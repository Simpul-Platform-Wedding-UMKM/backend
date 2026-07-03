import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const raiseDisputeSchema = z.object({
  bookingItemId: z.string(),
  reason: z.string().min(10),
  evidenceUrls: z.array(z.string().url()).default([]),
});

export const raiseDispute = asyncHandler(async (req, res) => {
  const data = raiseDisputeSchema.parse(req.body);

  const item = await prisma.bookingItem.findUnique({
    where: { id: data.bookingItemId },
    include: { booking: { include: { weddingProject: true } } },
  });
  if (!item) throw new ApiError(404, "Booking item not found");
  if (item.booking.weddingProject.accountId !== req.account.id) {
    throw new ApiError(403, "Not your booking");
  }

  // Holding this single item back (not the whole Booking, not the whole
  // Payment) is the actual mechanism behind "Mekanisme ini memastikan
  // bahwa vendor yang telah menyelesaikan kewajibannya tetap menerima hak
  // pembayaran secara penuh" — every other vendor in the same booking is
  // untouched.
  const [dispute] = await prisma.$transaction([
    prisma.dispute.create({
      data: {
        bookingItemId: item.id,
        raisedById: req.account.id,
        reason: data.reason,
        evidenceUrls: data.evidenceUrls,
      },
    }),
    prisma.bookingItem.update({
      where: { id: item.id },
      data: { status: "DISPUTED" },
    }),
  ]);

  res.status(201).json(dispute);
});

const resolveDisputeSchema = z.object({
  status: z.enum(["RESOLVED", "REJECTED"]),
  resolution: z.string().min(1),
});

// Admin-only — a real mediation UI would sit in front of this, but the
// endpoint itself just needs to record the outcome and unstick the item.
export const resolveDispute = asyncHandler(async (req, res) => {
  const data = resolveDisputeSchema.parse(req.body);

  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
  if (!dispute) throw new ApiError(404, "Dispute not found");

  const nextItemStatus = data.status === "RESOLVED" ? "COMPLETED" : "ON_PROGRESS";

  const [updated] = await prisma.$transaction([
    prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: data.status, resolution: data.resolution, resolvedAt: new Date() },
    }),
    prisma.bookingItem.update({
      where: { id: dispute.bookingItemId },
      data: { status: nextItemStatus },
    }),
  ]);

  res.json(updated);
});
