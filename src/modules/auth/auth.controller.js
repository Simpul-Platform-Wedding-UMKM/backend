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
