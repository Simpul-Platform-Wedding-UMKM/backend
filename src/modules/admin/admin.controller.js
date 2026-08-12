import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { CATEGORIES } from "../../lib/categories.js";
import { normalizeLocation } from "../../lib/location.js";

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
  region: z.string().min(1).transform(normalizeLocation),
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
  region: z.string().optional().transform(normalizeLocation),
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
  seoKecamatans: z.array(z.string().transform(normalizeLocation)).optional(),
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
// KYB verification list/detail — admin reviews vendor documents.
// Approve/reject reuses PATCH /vendors/:id (same controller).
// ---------------------------------------------------------------------------

const KYB_STATUSES = ["UNSUBMITTED", "PENDING", "VERIFIED", "REJECTED"];

// GET /admin/vendor-verifications?status=PENDING (tanpa param = semua)
export const getVendorVerifications = asyncHandler(async (req, res) => {
  const status = req.query.status
    ? String(req.query.status).toUpperCase()
    : null;
  if (status && !KYB_STATUSES.includes(status)) {
    throw new ApiError(400, "Invalid kyb status filter");
  }

  const vendors = await prisma.vendor.findMany({
    where: { ...(status ? { kybStatus: status } : {}) },
    include: { account: { select: { fullName: true, email: true } } },
    orderBy: { updatedAt: "desc" },
  });

  res.json(
    vendors.map((v) => ({
      vendorId: v.id,
      businessName: v.businessName,
      category: v.category,
      region: v.region,
      status: v.kybStatus,
      submittedAt: v.updatedAt.toISOString(),
      name: v.account?.fullName ?? "",
      email: v.account?.email ?? "",
      documents: {
        ktpUrl: v.ktpUrl ?? "",
        npwpUrl: v.npwpUrl ?? "",
        siupUrl: v.siupUrl ?? "",
        mouUrl: v.mouUrl ?? "",
      },
    })),
  );
});

// GET /admin/vendor-verifications/:id — full KYB detail incl. bank info
export const getVendorVerificationById = asyncHandler(async (req, res) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: req.params.id },
    include: { account: { select: { fullName: true, email: true } } },
  });
  if (!vendor) throw new ApiError(404, "Vendor not found");

  res.json({
    id: vendor.id,
    vendorId: vendor.id,
    businessName: vendor.businessName,
    category: vendor.category,
    region: vendor.region,
    status: vendor.kybStatus,
    kybStatus: vendor.kybStatus,
    kybVerified: vendor.kybVerified,
    kycVerifiedAt:
        vendor.kybStatus === "VERIFIED" ? vendor.updatedAt.toISOString() : null,
    rejectedReason: vendor.rejectedReason,
    submittedAt: vendor.updatedAt.toISOString(),
    name: vendor.account?.fullName ?? "",
    email: vendor.account?.email ?? "",
    businessType: vendor.category,
    address: vendor.description ?? "",
    phone: vendor.whatsapp ?? "",
    bankName: vendor.bankName ?? "",
    bankCode: "",
    bankAccountNumber: vendor.bankAccountNumber ?? "",
    bankAccountName: vendor.bankAccountName ?? "",
    ktpUrl: vendor.ktpUrl ?? "",
    npwpUrl: vendor.npwpUrl ?? "",
    siupUrl: vendor.siupUrl ?? "",
    mouUrl: vendor.mouUrl ?? "",
    createdAt: vendor.createdAt.toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Heatmap — QRIS transaction density by kecamatan (Kabupaten Banyumas)
// Data dari tabel payment_geo (di-seed). Fallback ke [] jika belum ada.
// ---------------------------------------------------------------------------

// GET /heatmap — reads PaymentGeo rows seeded into the database.
export const getHeatmapData = asyncHandler(async (req, res) => {
  const rows = await prisma.paymentGeo.findMany({
    orderBy: { count: "desc" },
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      kecamatan: r.kecamatan,
      latitude: r.latitude,
      longitude: r.longitude,
      amount: r.amount,
      count: r.count,
    })),
  );
});
