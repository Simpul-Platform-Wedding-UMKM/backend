import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const registerConsumerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  phone: z.string().optional(),
});

const registerVendorSchema = registerConsumerSchema
  .extend({
    businessName: z.string().min(1),
    category: z.enum([
      "MUA",
      "CATERING",
      "DECORATION",
      "PHOTOGRAPHY",
      "ATTIRE",
      "WEDDING_ORGANIZER",
      "VENUE",
      "OTHER",
    ]),
    region: z.string().min(1),
    priceMin: z.number().int().nonnegative(),
    priceMax: z.number().int().nonnegative(),
  })
  .refine((d) => d.priceMin <= d.priceMax, {
    message: "priceMin must be <= priceMax",
    path: ["priceMax"],
  });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(account) {
  return jwt.sign({ id: account.id, role: account.role, email: account.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export const registerConsumer = asyncHandler(async (req, res) => {
  const data = registerConsumerSchema.parse(req.body);

  const existing = await prisma.account.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const account = await prisma.account.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: Role.CONSUMER,
    },
  });

  res.status(201).json({ token: signToken(account), account: sanitize(account) });
});

export const registerVendor = asyncHandler(async (req, res) => {
  const data = registerVendorSchema.parse(req.body);

  const existing = await prisma.account.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(data.password, 10);

  // Account + Vendor profile created together — a Vendor row without an
  // Account makes no sense, and vice versa for role=VENDOR.
  const account = await prisma.account.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: Role.VENDOR,
      vendor: {
        create: {
          businessName: data.businessName,
          category: data.category,
          region: data.region,
          priceMin: data.priceMin,
          priceMax: data.priceMax,
        },
      },
    },
    include: { vendor: true },
  });

  res.status(201).json({ token: signToken(account), account: sanitize(account) });
});

export const login = asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const account = await prisma.account.findUnique({
    where: { email: data.email },
    include: { vendor: true },
  });
  if (!account) throw new ApiError(401, "Invalid email or password");

  const valid = await bcrypt.compare(data.password, account.passwordHash);
  if (!valid) throw new ApiError(401, "Invalid email or password");

  res.json({ token: signToken(account), account: sanitize(account) });
});

function sanitize(account) {
  const { passwordHash, ...rest } = account;
  return rest;
}
