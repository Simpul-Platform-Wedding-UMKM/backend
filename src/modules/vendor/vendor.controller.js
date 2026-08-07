import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { CATEGORIES } from "../../lib/categories.js";
import { normalizeLocation } from "../../lib/location.js";

// FR-02 Hyper-Local Filter: region, price range, rating, category.
// (Date-of-availability filtering needs a vendor calendar/blackout-dates
// table — left out of the MVP schema; add a VendorAvailability model if
// you have time before the demo.)
const searchSchema = z.object({
    region: z.string().optional(),
    category: z.enum(CATEGORIES).optional(),
    minPrice: z.coerce.number().int().optional(),
    maxPrice: z.coerce.number().int().optional(),
    minRating: z.coerce.number().optional(),
});

export const searchVendors = asyncHandler(async (req, res) => {
    const q = searchSchema.parse(req.query);

    const vendors = await prisma.vendor.findMany({
        where: {
            ...(q.region && {
                region: { equals: q.region, mode: "insensitive" },
            }),
            ...(q.category && { category: q.category }),
            ...(q.minPrice && { priceMax: { gte: q.minPrice } }),
            ...(q.maxPrice && { priceMin: { lte: q.maxPrice } }),
            ...(q.minRating && { ratingAvg: { gte: q.minRating } }),
        },
        include: { services: { where: { isActive: true } } },
        orderBy: { ratingAvg: "desc" },
    });

    res.json(vendors);
});

export const getVendor = asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findUnique({
        where: { id: req.params.id },
        include: { services: { where: { isActive: true } }, reviews: true },
    });
    if (!vendor) throw new ApiError(404, "Vendor not found");
    res.json(vendor);
});

const updateProfileSchema = z
    .object({
        businessName: z.string().min(1).optional(),
        description: z.string().optional(),
        region: z.string().optional().transform(normalizeLocation),
        priceMin: z.number().int().nonnegative().optional(),
        priceMax: z.number().int().nonnegative().optional(),
        bankName: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        bankAccountName: z.string().optional(),
        // Gap D: social / profile extras
        bannerImageUrl: z.string().url().optional(),
        whatsapp: z.string().min(5).max(30).optional(),
        instagram: z.string().min(1).max(60).optional(),
        website: z.string().url().optional(),
    })
    .refine(
        (d) => {
            if (d.priceMin !== undefined && d.priceMax !== undefined) {
                return d.priceMin <= d.priceMax;
            }
            return true;
        },
        { message: "priceMin must be <= priceMax", path: ["priceMax"] },
    );

// Vendor updates their own profile — req.vendor is set by requireVendor middleware.
export const updateMyVendorProfile = asyncHandler(async (req, res) => {
    const data = updateProfileSchema.parse(req.body);
    const vendor = await prisma.vendor.update({
        where: { id: req.vendor.id },
        data,
    });
    res.json(vendor);
});

const createServiceSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    price: z.number().int().nonnegative(),
});

export const addMyVendorService = asyncHandler(async (req, res) => {
    const data = createServiceSchema.parse(req.body);
    const service = await prisma.vendorService.create({
        data: { ...data, vendorId: req.vendor.id },
    });
    res.status(201).json(service);
});

const applyVendorSchema = z.object({
    businessName: z.string().min(1),
    category: z.enum(CATEGORIES),
    region: z.string().min(1).transform(normalizeLocation),
    priceMin: z.number().int().nonnegative(),
    priceMax: z.number().int().nonnegative(),
    description: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankAccountName: z.string().optional(),
}).refine((d) => d.priceMin <= d.priceMax, {
    message: "priceMin must be <= priceMax",
    path: ["priceMax"],
});

export const applyVendor = asyncHandler(async (req, res) => {
    const data = applyVendorSchema.parse(req.body);

    const existingVendor = await prisma.vendor.findUnique({
        where: { accountId: req.account.id },
    });
    if (existingVendor) {
        throw new ApiError(400, "Account is already registered as a vendor");
    }

    const vendor = await prisma.vendor.create({
        data: {
            ...data,
            accountId: req.account.id,
            kybVerified: false,
        },
    });

    res.status(201).json(vendor);
});

// ---------------------------------------------------------------------------
// Gap C: KYB document submission
// ---------------------------------------------------------------------------

const verifySchema = z.object({
    ktpUrl: z.string().url(),
    npwpUrl: z.string().url(),
    siupUrl: z.string().url().optional(),
    mouUrl: z.string().url().optional(),
});

// POST /vendors/me/verify — submit KYB documents
export const submitKyb = asyncHandler(async (req, res) => {
    const data = verifySchema.parse(req.body);
    const vendor = await prisma.vendor.update({
        where: { id: req.vendor.id },
        data: {
            ...data,
            kybStatus: "PENDING",
            kybVerified: false, // clear stale verified flag if re-submitting
            rejectedReason: null,
        },
    });
    res.json({
        status: vendor.kybStatus,
        submittedAt: vendor.updatedAt,
        rejectedReason: vendor.rejectedReason,
    });
});

// GET /vendors/me/verification
export const getKybStatus = asyncHandler(async (req, res) => {
    const v = req.vendor;
    res.json({
        status: v.kybStatus,
        submittedAt: v.kybStatus === "UNSUBMITTED" ? null : v.updatedAt,
        rejectedReason: v.rejectedReason,
    });
});

// ---------------------------------------------------------------------------
// Gap F: Premium SEO + ad-slot bid
// ---------------------------------------------------------------------------

const seoSchema = z.object({
    seoKecamatans: z.array(z.string().min(1).max(80).transform(normalizeLocation)).max(20),
});
export const setPremiumSeo = asyncHandler(async (req, res) => {
    const { seoKecamatans } = seoSchema.parse(req.body);
    const vendor = await prisma.vendor.update({
        where: { id: req.vendor.id },
        data: { seoKecamatans },
    });
    res.json({ seoKecamatans: vendor.seoKecamatans });
});

const adSlotSchema = z.object({
    adSlotActive: z.boolean(),
    adBidAmount: z.number().int().nonnegative().max(100000).optional(),
});
export const setAdSlot = asyncHandler(async (req, res) => {
    const data = adSlotSchema.parse(req.body);
    const vendor = await prisma.vendor.update({
        where: { id: req.vendor.id },
        data,
    });
    res.json({
        adSlotActive: vendor.adSlotActive,
        adBidAmount: vendor.adBidAmount,
    });
});

// ---------------------------------------------------------------------------
// Vendor Management — catalog CRUD, dashboard stats, earnings, notifications,
// portfolio, premium info. All scoped to the authenticated vendor (req.vendor).
// ---------------------------------------------------------------------------

async function loadServiceForVendor(serviceId, vendorId) {
    const service = await prisma.vendorService.findUnique({
        where: { id: serviceId },
    });
    if (!service) throw new ApiError(404, "Service not found");
    if (service.vendorId !== vendorId) throw new ApiError(403, "Not your service");
    return service;
}

// PATCH /vendors/me/services/:serviceId — partial update of a package
const updateServiceSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
});
export const updateMyVendorService = asyncHandler(async (req, res) => {
    const data = updateServiceSchema.parse(req.body);
    await loadServiceForVendor(req.params.serviceId, req.vendor.id);
    const service = await prisma.vendorService.update({
        where: { id: req.params.serviceId },
        data,
    });
    res.json(service);
});

// DELETE /vendors/me/services/:serviceId — remove a package
export const deleteMyVendorService = asyncHandler(async (req, res) => {
    await loadServiceForVendor(req.params.serviceId, req.vendor.id);
    await prisma.vendorService.delete({ where: { id: req.params.serviceId } });
    res.json({ ok: true });
});

// GET /vendors/me/dashboard — revenue/rating/order-count stats
export const getVendorDashboard = asyncHandler(async (req, res) => {
    const [splits, orderItems, vendor] = await Promise.all([
        prisma.paymentSplit.findMany({
            where: { vendorId: req.vendor.id },
        }),
        prisma.bookingItem.findMany({
            where: { vendorId: req.vendor.id },
            select: { status: true },
        }),
        prisma.vendor.findUnique({ where: { id: req.vendor.id } }),
    ]);

    const revenueTotal = splits
        .filter((s) => s.settlementStatus === "SETTLED")
        .reduce((sum, s) => sum + s.vendorAmount, 0);
    const revenuePending = splits
        .filter((s) => s.settlementStatus === "PENDING")
        .reduce((sum, s) => sum + s.vendorAmount, 0);

    res.json({
        revenueTotal,
        revenuePending,
        ratingAvg: vendor?.ratingAvg ?? 0,
        ratingCount: vendor?.ratingCount ?? 0,
        newOrdersCount: orderItems.filter((i) => i.status === "PENDING").length,
        activeOrdersCount: orderItems.filter((i) => i.status === "ON_PROGRESS").length,
    });
});

// GET /vendors/me/earnings — settlement summary + payout history
export const getVendorEarnings = asyncHandler(async (req, res) => {
    const splits = await prisma.paymentSplit.findMany({
        where: { vendorId: req.vendor.id },
        include: {
            bookingItem: {
                include: {
                    booking: {
                        include: {
                            weddingProject: { include: { account: true } },
                        },
                    },
                },
            },
        },
        orderBy: { settledAt: "desc" },
    });

    const totalSettled = splits
        .filter((s) => s.settlementStatus === "SETTLED")
        .reduce((sum, s) => sum + s.vendorAmount, 0);
    const pendingPayout = splits
        .filter((s) => s.settlementStatus === "PENDING")
        .reduce((sum, s) => sum + s.vendorAmount, 0);

    const idr = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    });

    const payouts = splits.map((s) => ({
        orderNo: s.bookingItem.id.slice(-6).toUpperCase(),
        client: s.bookingItem.booking.weddingProject.account.fullName,
        amount: s.vendorAmount,
        amountLabel: idr.format(s.vendorAmount),
        date: s.settledAt
            ? new Intl.DateTimeFormat("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
              }).format(s.settledAt)
            : "Menunggu settlement",
        status: s.settlementStatus,
    }));

    res.json({ totalSettled, pendingPayout, payouts });
});

// GET /vendors/me/notifications — latest orders + settlements for this vendor
export const getVendorNotifications = asyncHandler(async (req, res) => {
    const [items, splits] = await Promise.all([
        prisma.bookingItem.findMany({
            where: { vendorId: req.vendor.id },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
                vendorService: true,
                booking: {
                    include: {
                        weddingProject: { include: { account: true } },
                    },
                },
            },
        }),
        prisma.paymentSplit.findMany({
            where: { vendorId: req.vendor.id, settlementStatus: "SETTLED" },
            orderBy: { settledAt: "desc" },
            take: 5,
        }),
    ]);

    const notifications = [
        ...items.map((i) => ({
            id: `order-${i.id}`,
            type: "ORDER",
            title: "Pesanan Baru Masuk!",
            description: `${i.booking.weddingProject.account.fullName} memesan ${i.vendorService.name}.`,
            createdAt: i.createdAt.toISOString(),
            isRead: false,
        })),
        ...splits.map((s) => ({
            id: `settlement-${s.id}`,
            type: "SETTLEMENT",
            title: "Hasil Settlement QRIS",
            description: `Pencairan dana order ${s.id.slice(-6).toUpperCase()} berhasil ditransfer ke rekening Anda.`,
            createdAt: (s.settledAt ?? new Date()).toISOString(),
            isRead: false,
        })),
    ]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

    res.json(notifications);
});

// GET /vendors/me/catalog — active services + portfolio image URLs
export const getVendorCatalog = asyncHandler(async (req, res) => {
    const [services, vendor] = await Promise.all([
        prisma.vendorService.findMany({
            where: { vendorId: req.vendor.id },
            orderBy: { createdAt: "desc" },
        }),
        prisma.vendor.findUnique({ where: { id: req.vendor.id } }),
    ]);
    res.json({
        services,
        portfolio: [
            vendor?.profileImageUrl,
            vendor?.bannerImageUrl,
        ].filter(Boolean),
    });
});

// POST /vendors/me/portfolio — append an image URL to the vendor portfolio
const portfolioSchema = z.object({
    imageUrl: z.string().url(),
});
export const addVendorPortfolio = asyncHandler(async (req, res) => {
    const { imageUrl } = portfolioSchema.parse(req.body);
    const vendor = await prisma.vendor.findUnique({ where: { id: req.vendor.id } });
    const portfolio = [...(vendor?.portfolio ?? []), imageUrl];
    await prisma.vendor.update({
        where: { id: req.vendor.id },
        data: { portfolio },
    });
    res.json({ portfolio });
});

// GET /vendors/me/premium — current premium config
export const getVendorPremium = asyncHandler(async (req, res) => {
    const v = req.vendor;
    res.json({
        seoKecamatans: v.seoKecamatans,
        adSlotActive: v.adSlotActive,
        adBidAmount: v.adBidAmount,
        subscriptionTier: v.subscriptionTier,
    });
});
