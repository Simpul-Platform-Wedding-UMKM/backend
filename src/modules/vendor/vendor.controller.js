import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

// FR-02 Hyper-Local Filter: region, price range, rating, category.
// (Date-of-availability filtering needs a vendor calendar/blackout-dates
// table — left out of the MVP schema; add a VendorAvailability model if
// you have time before the demo.)
const searchSchema = z.object({
  region: z.string().optional(),
  category: z.enum(["MUA", "CATERING", "DECORATION", "PHOTOGRAPHY", "ATTIRE", "WEDDING_ORGANIZER", "VENUE", "OTHER"]).optional(),
  minPrice: z.coerce.number().int().optional(),
  maxPrice: z.coerce.number().int().optional(),
  minRating: z.coerce.number().optional(),
});

export const searchVendors = asyncHandler(async (req, res) => {
  const q = searchSchema.parse(req.query);

  const vendors = await prisma.vendor.findMany({
    where: {
      ...(q.region && { region: { equals: q.region, mode: "insensitive" } }),
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
  })
  .refine(
    (d) => {
      if (d.priceMin !== undefined && d.priceMax !== undefined) {
        return d.priceMin <= d.priceMax;
      }
      return true;
    },
    { message: "priceMin must be <= priceMax", path: ["priceMax"] }
  );

// Vendor updates their own profile — req.account.id is the Account id, so
// we scope the update through the Account -> Vendor relation.
export const updateMyVendorProfile = asyncHandler(async (req, res) => {
  const data = updateProfileSchema.parse(req.body);
  const vendor = await prisma.vendor.update({
    where: { accountId: req.account.id },
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
  const vendor = await prisma.vendor.findUnique({ where: { accountId: req.account.id } });
  if (!vendor) throw new ApiError(404, "Vendor profile not found");

  const service = await prisma.vendorService.create({
    data: { ...data, vendorId: vendor.id },
  });
  res.status(201).json(service);
});
