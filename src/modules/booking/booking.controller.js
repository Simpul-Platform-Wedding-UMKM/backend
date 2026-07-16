import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const createBookingSchema = z.object({
  weddingProjectId: z.string(),
  vendorServiceIds: z.array(z.string()).min(1),
});

// This is the "Konsolidasi Invoice" step from section 3.3.3 (step 1 of the
// Smart QRIS flow) — everything downstream (Payment, single QRIS code,
// split settlement) is generated FROM this Booking, not from individual
// vendor orders.
export const createBooking = asyncHandler(async (req, res) => {
  const data = createBookingSchema.parse(req.body);

  const project = await prisma.weddingProject.findFirst({
    where: { id: data.weddingProjectId, accountId: req.account.id },
  });
  if (!project) throw new ApiError(404, "Wedding project not found");

  const services = await prisma.vendorService.findMany({
    where: { id: { in: data.vendorServiceIds }, isActive: true },
  });
  if (services.length !== data.vendorServiceIds.length) {
    throw new ApiError(422, "One or more services are unavailable");
  }

  const booking = await prisma.booking.create({
    data: {
      weddingProjectId: project.id,
      items: {
        create: services.map((s) => ({
          vendorId: s.vendorId,
          vendorServiceId: s.id,
          price: s.price, // snapshot the price now — protects both sides if the vendor changes it later
        })),
      },
    },
    include: { items: { include: { vendor: true, vendorService: true } } },
  });

  res.status(201).json(booking);
});

export const getBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      items: { include: { vendor: true, vendorService: true, dispute: true } },
      payment: { include: { splits: true } },
      weddingProject: true,
    },
  });
  if (!booking) throw new ApiError(404, "Booking not found");

  const { id: accountId, role } = req.account;

  if (role === "ADMIN") {
    // ADMIN can see all bookings
  } else {
    const isConsumer = booking.weddingProject.accountId === accountId;
    if (isConsumer) {
      // Allowed
    } else {
      const vendor = await prisma.vendor.findUnique({ where: { accountId } });
      const hasItem = vendor ? booking.items.some((i) => i.vendorId === vendor.id) : false;
      if (!hasItem) {
        throw new ApiError(403, "Not your booking");
      }
    }
  }

  res.json(booking);
});

const updateStatusSchema = z.object({
  status: z.enum(["ON_PROGRESS", "COMPLETED"]),
});

// Vendor moves their own line item through the lifecycle. Deliberately
// scoped to a single BookingItem (not the whole Booking) — this is the
// piece that makes the Dispute Resolution Framework fair per-vendor.
export const updateBookingItemStatus = asyncHandler(async (req, res) => {
  const { status } = updateStatusSchema.parse(req.body);

  const vendor = await prisma.vendor.findUnique({ where: { accountId: req.account.id } });
  if (!vendor) throw new ApiError(404, "Vendor profile not found");

  const item = await prisma.bookingItem.findFirst({
    where: { id: req.params.itemId, vendorId: vendor.id },
  });
  if (!item) throw new ApiError(404, "Booking item not found for this vendor");
  if (item.status === "DISPUTED") {
    throw new ApiError(409, "Item is under dispute — resolve via Dispute Center first");
  }

  const updated = await prisma.bookingItem.update({
    where: { id: item.id },
    data: { status },
  });
  res.json(updated);
});
export const getBookings = asyncHandler(async (req, res) => {
  // ponytail: ADMIN sees all, CONSUMER sees own
  const where = req.account.role === "ADMIN"
    ? {}
    : { weddingProject: { accountId: req.account.id } };
  const bookings = await prisma.booking.findMany({
    where,
    include: {
      items: { include: { vendor: true, vendorService: true, dispute: true } },
      payment: true,
      weddingProject: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(bookings);
});
