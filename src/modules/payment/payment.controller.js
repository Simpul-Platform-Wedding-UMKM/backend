import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { createQrisForBooking, settlePayment, computeSplit } from "./payment.service.js";

// Step 1 of section 3.3.3: consolidate the Booking's items into one total,
// ask the PJP for a single Dynamic QRIS, and pre-compute (but don't yet
// settle) how that total will be split across vendors once it's paid.
export const createPayment = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.bookingId },
    include: { items: true, payment: true },
  });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.payment) throw new ApiError(409, "Payment already created for this booking");

  const totalAmount = booking.items.reduce((sum, i) => sum + i.price, 0);
  const gateway = await createQrisForBooking(booking, totalAmount);

  const splitsData = booking.items.map((item) => {
    const { vendorAmount, platformFeeAmount } = computeSplit(item.price);
    return {
      bookingItemId: item.id,
      vendorId: item.vendorId,
      vendorAmount,
      platformFeeAmount,
    };
  });
  const platformFee = splitsData.reduce((sum, s) => sum + s.platformFeeAmount, 0);

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      totalAmount,
      platformFee,
      pjpProvider: "xendit",
      pjpTransactionId: gateway.pjpTransactionId,
      qrisString: gateway.qrisString,
      expiresAt: gateway.expiresAt,
      splits: { create: splitsData },
    },
    include: { splits: true },
  });

  res.status(201).json(payment);
});

export const getPayment = asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
    include: { splits: true },
  });
  if (!payment) throw new ApiError(404, "Payment not found");
  res.json(payment);
});

// Xendit calls this. Verify the shared token before trusting anything in
// the body — this endpoint has no auth middleware since it's called by
// Xendit, not by a logged-in user, so the token IS the auth.
export const xenditWebhook = asyncHandler(async (req, res) => {
  const token = req.headers["x-callback-token"];
  if (token !== env.xenditCallbackToken) {
    throw new ApiError(401, "Invalid webhook token");
  }

  const { reference_id: bookingId, status } = req.body;
  if (status !== "SUCCEEDED" && status !== "COMPLETED") {
    return res.status(200).json({ received: true }); // ignore pending/failed pings, nothing to do yet
  }

  const payment = await prisma.payment.update({
    where: { bookingId },
    data: { status: "PAID", paidAt: new Date() },
  });

  // Fire and forget from the webhook's point of view — Xendit just wants a
  // fast 200. Disbursement failures are handled/logged inside settlePayment.
  settlePayment(payment.id).catch((err) => console.error("settlePayment failed:", err));

  res.status(200).json({ received: true });
});
