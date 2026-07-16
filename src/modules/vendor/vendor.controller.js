import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { CATEGORIES } from "../../lib/categories.js";

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
        region: z.string().optional(),
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
    region: z.string().min(1),
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
    seoKecamatans: z.array(z.string().min(1).max(80)).max(20),
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
