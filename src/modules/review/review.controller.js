import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const createReviewSchema = z.object({
  bookingItemId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const createReview = asyncHandler(async (req, res) => {
  const data = createReviewSchema.parse(req.body);

  const item = await prisma.bookingItem.findUnique({
    where: { id: data.bookingItemId },
    include: { booking: { include: { weddingProject: true } } },
  });
  if (!item) throw new ApiError(404, "Booking item not found");
  if (item.booking.weddingProject.accountId !== req.account.id) {
    throw new ApiError(403, "Not your booking");
  }
  if (item.status !== "COMPLETED") {
    throw new ApiError(409, "Can only review completed services");
  }

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        bookingItemId: item.id,
        vendorId: item.vendorId,
        accountId: req.account.id,
        rating: data.rating,
        comment: data.comment,
      },
    });

    // Roll the new rating into Vendor.ratingAvg without a separate cron —
    // fine at hackathon scale, revisit with a materialized aggregate if
    // review volume ever gets large.
    const agg = await tx.review.aggregate({
      where: { vendorId: item.vendorId },
      _avg: { rating: true },
      _count: true,
    });
    await tx.vendor.update({
      where: { id: item.vendorId },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
    });

    return created;
  });

  res.status(201).json(review);
});
