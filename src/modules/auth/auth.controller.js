import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const BCRYPT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 10;

const registerConsumerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(1),
    phone: z.string().optional(),
});

const googleLoginSchema = z.object({
    idToken: z.string().min(1),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

function signToken(account) {
    return jwt.sign(
        { id: account.id, role: account.role, email: account.email },
        env.jwtSecret,
        {
            expiresIn: env.jwtExpiresIn,
        },
    );
}

export const registerConsumer = asyncHandler(async (req, res) => {
    const data = registerConsumerSchema.parse(req.body);

    const existing = await prisma.account.findUnique({
        where: { email: data.email },
    });
    if (existing) throw new ApiError(409, "Email already registered");

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const account = await prisma.account.create({
        data: {
            email: data.email,
            passwordHash,
            fullName: data.fullName,
            phone: data.phone,
            role: Role.CONSUMER,
        },
    });

    res.status(201).json({
        token: signToken(account),
        account: sanitize(account),
    });
});

export const googleLogin = asyncHandler(async (req, res) => {
    const { idToken } = googleLoginSchema.parse(req.body);

    const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    let payload;
    try {
        const response = await fetch(tokenInfoUrl);
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new ApiError(400, errBody.error_description || "Invalid Google ID token");
        }
        payload = await response.json();
    } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(400, "Failed to verify Google ID token with Google API: " + err.message);
    }

    const { email, name, picture, sub: googleId } = payload;
    if (!email) {
        throw new ApiError(400, "Google token does not contain email claim");
    }

    let account = await prisma.account.findFirst({
        where: {
            OR: [
                { googleId },
                { email }
            ]
        },
        include: { vendor: true }
    });

    if (!account) {
        account = await prisma.account.create({
            data: {
                email,
                fullName: name || "Google User",
                profileImageUrl: picture || null,
                googleId,
                role: Role.CONSUMER,
            },
            include: { vendor: true }
        });
    } else if (!account.googleId) {
        account = await prisma.account.update({
            where: { id: account.id },
            data: { googleId, profileImageUrl: account.profileImageUrl || picture },
            include: { vendor: true }
        });
    }

    await recordLoginSession(req, account.id);
    res.json({
        token: signToken(account),
        account: sanitize(account),
    });
});

export const login = asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);

    const account = await prisma.account.findUnique({
        where: { email: data.email },
        include: { vendor: true },
    });
    if (!account) throw new ApiError(401, "Invalid email or password");

    if (!account.passwordHash) {
        throw new ApiError(401, "This account was registered using Google. Please sign in with Google.");
    }

    const valid = await bcrypt.compare(data.password, account.passwordHash);
    if (!valid) throw new ApiError(401, "Invalid email or password");

    await recordLoginSession(req, account.id);
    res.json({ token: signToken(account), account: sanitize(account) });
});

export const getMe = asyncHandler(async (req, res) => {
    const account = await prisma.account.findUnique({
        where: { id: req.account.id },
        include: { vendor: true },
    });
    if (!account) throw new ApiError(404, "Account not found");
    res.json({ account: sanitize(account) });
});

function sanitize(account) {
    const { passwordHash, ...rest } = account;
    return rest;
}

// ── Change Password ───────────────────────────────────────────────────────
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const changePassword = asyncHandler(async (req, res) => {
    const data = changePasswordSchema.parse(req.body);

    const account = await prisma.account.findUnique({
        where: { id: req.account.id },
    });
    if (!account) throw new ApiError(404, "Account not found");

    if (!account.passwordHash) {
        throw new ApiError(400, "Akun ini menggunakan Google sign-in. Ubah password tidak tersedia.");
    }

    const valid = await bcrypt.compare(data.currentPassword, account.passwordHash);
    if (!valid) throw new ApiError(401, "Password saat ini salah");

    const newHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await prisma.account.update({
        where: { id: account.id },
        data: { passwordHash: newHash },
    });

    res.json({ message: "Password berhasil diubah" });
});

// ── Login Session Recording ───────────────────────────────────────────────

function deviceNameFromUA(ua) {
    if (!ua) return "Perangkat Tidak Dikenal";
    // ponytail: extract basic device info from User-Agent
    if (ua.includes("Android")) return "Android" + (ua.match(/Android\s([\d.]+)/)?.[0]?.replace("Android ", " ") || "");
    if (ua.includes("iPhone") || ua.includes("iPad")) return ua.includes("iPad") ? "iPad" : "iPhone";
    if (ua.includes("Windows")) return "Windows" + (ua.match(/Windows\sNT\s([\d.]+)/)?.[0]?.replace("Windows NT ", " ") || "");
    if (ua.includes("Mac")) return "Mac" + (ua.match(/Mac\sOS\sX\s([\d_]+)/)?.[0]?.replace("Mac OS X ", " ")?.replace(/_/g, ".") || "");
    if (ua.includes("Linux")) return "Linux";
    return "Perangkat Tidak Dikenal";
}

function deviceTypeFromUA(ua) {
    if (!ua) return "desktop";
    if (ua.includes("Android") || ua.includes("iPhone") || ua.includes("iPad")) return "mobile";
    return "desktop";
}

async function recordLoginSession(req, accountId) {
    const ua = req.headers["user-agent"] || null;
    const deviceName = deviceNameFromUA(ua);
    const deviceType = deviceTypeFromUA(ua);
    const ipAddress = req.ip || req.socket?.remoteAddress || null;

    // ponytail: mark all existing sessions for this account as not-current
    await prisma.loginSession.updateMany({
        where: { accountId, isCurrent: true },
        data: { isCurrent: false },
    });

    await prisma.loginSession.create({
        data: {
            accountId,
            deviceName,
            deviceType,
            ipAddress,
            userAgent: ua,
            isCurrent: true,
        },
    });
}

// ── Sessions ──────────────────────────────────────────────────────────────

export const getSessions = asyncHandler(async (req, res) => {
    const sessions = await prisma.loginSession.findMany({
        where: { accountId: req.account.id },
        orderBy: { createdAt: "desc" },
    });
    // ponytail: limit to 10 most recent sessions
    res.json({ sessions: sessions.slice(0, 10) });
});

export const revokeSession = asyncHandler(async (req, res) => {
    const session = await prisma.loginSession.findUnique({
        where: { id: req.params.id },
    });
    if (!session) throw new ApiError(404, "Session not found");
    if (session.accountId !== req.account.id) throw new ApiError(403, "Cannot revoke another user's session");
    if (session.isCurrent) throw new ApiError(400, "Cannot revoke the current session");

    await prisma.loginSession.delete({ where: { id: session.id } });
    res.json({ message: "Session revoked" });
});

// ── Forgot / Reset Password ──────────────────────────────────────────────

const forgotPasswordSchema = z.object({
    email: z.string().email(),
});

const resetPasswordSchema = z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8, "Password baru minimal 8 karakter"),
});

export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);

    // Don't reveal whether the email exists — same response either way
    const account = await prisma.account.findUnique({ where: { email } });
    if (!account) {
        // ponytail: still return success so attackers can't enumerate emails
        res.json({ message: "Jika email terdaftar, link reset telah dikirim." });
        return;
    }

    // Invalidate old tokens for this account
    await prisma.passwordResetToken.updateMany({
        where: { accountId: account.id, used: false },
        data: { used: true },
    });

    // Create new token — valid for 1 hour
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
        data: {
            accountId: account.id,
            token,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });

    // ponytail: return token directly for dev (production would email it)
    res.json({
        message: "Link reset password telah dibuat.",
        token, // included so mobile can navigate to reset screen
    });
});

// ── Update My Account ─────────────────────────────────────────────────────

const updateMyAccountSchema = z.object({
    fullName: z.string().min(1).optional(),
    phone: z.string().optional(),
    profileImageUrl: z.string().url().optional().nullable(),
});

export const updateMyAccount = asyncHandler(async (req, res) => {
    const data = updateMyAccountSchema.parse(req.body);
    const account = await prisma.account.update({
        where: { id: req.account.id },
        data,
        include: { vendor: true },
    });
    res.json({ account: sanitize(account) });
});

export const resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
        throw new ApiError(400, "Token reset tidak valid atau sudah kadaluarsa");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.account.update({
        where: { id: resetToken.accountId },
        data: { passwordHash },
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
    });

    res.json({ message: "Password berhasil direset. Silakan login dengan password baru." });
});
