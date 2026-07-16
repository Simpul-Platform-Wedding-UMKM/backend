import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { CATEGORIES } from "../../lib/categories.js";

// GET /system-users — returns all accounts mapped to the SystemUser shape
// the admin dashboard expects.
export const getSystemUsers = asyncHandler(async (req, res) => {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const users = accounts.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.fullName,
    role: mapRole(a.role),
    permissions: [],
    isActive: true,
    lastLoginAt: null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  res.json(users);
});

function mapRole(prismaRole) {
  if (prismaRole === "ADMIN") return "ADMIN";
  if (prismaRole === "CONSUMER") return "ANALYST";
  return "ANALYST";
}

// GET /audit-logs — no audit-log table exists yet in the Prisma schema.
// Returns an empty array so the admin dashboard's audit-log page renders
// without errors. Add an AuditLog model + migration when audit tracking is
// implemented.
export const getAuditLogs = asyncHandler(async (req, res) => {
  res.json([]);
});

// ---------------------------------------------------------------------------
// Admin vendor CRUD (gaps 1–2)
// ---------------------------------------------------------------------------

const adminCreateVendorSchema = z.object({
  businessName: z.string().min(1),
  category: z.enum(CATEGORIES),
  region: z.string().min(1),
  priceMin: z.number().int().nonnegative(),
  priceMax: z.number().int().nonnegative(),
  description: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountName: z.string().optional(),
  accountId: z.string().optional(),
}).refine((d) => d.priceMin <= d.priceMax, {
  message: "priceMin must be <= priceMax",
  path: ["priceMax"],
});

// POST /vendors — admin creates a vendor
export const createVendor = asyncHandler(async (req, res) => {
  const data = adminCreateVendorSchema.parse(req.body);
  const vendor = await prisma.vendor.create({
    data: {
      businessName: data.businessName,
      category: data.category,
      region: data.region,
      priceMin: data.priceMin,
      priceMax: data.priceMax,
      description: data.description,
      bankName: data.bankName,
      bankAccountNumber: data.bankAccountNumber,
      bankAccountName: data.bankAccountName,
      ...(data.accountId ? { accountId: data.accountId } : {}),
      kybVerified: false,
    },
  });
  res.status(201).json(vendor);
});

const adminUpdateVendorSchema = z.object({
  businessName: z.string().min(1).optional(),
  category: z.enum(CATEGORIES).optional(),
  region: z.string().optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountName: z.string().optional(),
  kybVerified: z.boolean().optional(),
  kybStatus: z.enum(["UNSUBMITTED", "PENDING", "VERIFIED", "REJECTED"]).optional(),
  rejectedReason: z.string().optional(),
  ktpUrl: z.string().url().optional(),
  npwpUrl: z.string().url().optional(),
  siupUrl: z.string().url().optional(),
  mouUrl: z.string().url().optional(),
  seoKecamatans: z.array(z.string()).optional(),
  adSlotActive: z.boolean().optional(),
  adBidAmount: z.number().int().nonnegative().optional(),
});

// PATCH /vendors/:id — admin updates any vendor
export const updateVendor = asyncHandler(async (req, res) => {
  const data = adminUpdateVendorSchema.parse(req.body);

  const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id } });
  if (!vendor) throw new ApiError(404, "Vendor not found");

  const updated = await prisma.vendor.update({
    where: { id: req.params.id },
    data,
  });
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Heatmap (gap 5)
// ---------------------------------------------------------------------------

// GET /heatmap — QRIS transaction density by kecamatan.
// ponytail: no geo-coordinate model exists yet, returns empty array.
// Add a PaymentGeo or kecamatan-ref model when real heatmap data is needed.
export const getHeatmapData = asyncHandler(async (req, res) => {
  res.json([]);
});
