import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

export const getPaymentSplits = asyncHandler(async (req, res) => {
  const splits = await prisma.paymentSplit.findMany({
    include: {
      payment: true,
      bookingItem: { include: { vendor: true, vendorService: true } },
    },
    orderBy: { payment: { createdAt: "desc" } },
  });

  const result = splits.map(mapSplit);
  res.json(result);
});

export const getPaymentSplitById = asyncHandler(async (req, res) => {
  const split = await prisma.paymentSplit.findUnique({
    where: { id: req.params.id },
    include: {
      payment: true,
      bookingItem: { include: { vendor: true, vendorService: true } },
    },
  });
  if (!split) throw new ApiError(404, "Payment split not found");
  res.json(mapSplit(split));
});

function mapSplit(s) {
  const item = s.bookingItem;
  const payment = s.payment;
  return {
    id: s.id,
    bookingId: payment.id,
    bookingItemId: s.bookingItemId,
    vendorId: s.vendorId,
    grossAmount: item.price,
    microFeeAmount: 0,
    platformFeeAmount: s.platformFeeAmount,
    netAmount: s.vendorAmount,
    status: payment.status,
    settlementStatus: s.settlementStatus,
    qrisCode: payment.qrisString || null,
    qrisExpiresAt: payment.expiresAt?.toISOString() || null,
    transactionId: payment.pjpTransactionId || null,
    pjpProvider: payment.pjpProvider || null,
    pjpTransactionId: payment.pjpTransactionId || null,
    releasedAt: s.settledAt?.toISOString() || null,
    createdAt: s.payment.createdAt.toISOString(),
    updatedAt: s.payment.updatedAt.toISOString(),
  };
}
