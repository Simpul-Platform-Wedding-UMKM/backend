import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { createQrisForBooking, settlePayment, computeSplit } from "./payment.service.js";

const createPaymentSchema = z.object({
  paymentType: z.enum(["DP_30", "FULL_100"]).default("FULL_100"),
});

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

  const { paymentType } = createPaymentSchema.parse(req.body);

  const fullAmount = booking.items.reduce((sum, i) => sum + i.price, 0);
  const chargeRate = paymentType === "DP_30" ? 0.3 : 1.0;
  const totalAmount = Math.round(fullAmount * chargeRate);
  const gateway = await createQrisForBooking(booking, totalAmount);

  const splitsData = booking.items.map((item) => {
    const adjustedPrice = Math.round(item.price * chargeRate);
    const { vendorAmount, platformFeeAmount } = computeSplit(adjustedPrice);
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
      paymentType,
      pjpProvider: env.pjpProvider,
      pjpTransactionId: gateway.pjpTransactionId,
      qrisString: gateway.qrisString,
      qrisImageUrl: gateway.qrisImageUrl || gateway.qrisString || null,
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
    include: {
      splits: {
        include: {
          bookingItem: {
            include: { vendor: true },
          },
        },
      },
    },
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

function verifyMidtransSignature(payload) {
  const { order_id, status_code, gross_amount, signature_key } = payload;
  const hashSource = `${order_id}${status_code}${gross_amount}${env.midtransServerKey}`;
  const calculatedSignature = crypto.createHash("sha512").update(hashSource).digest("hex");
  return calculatedSignature === signature_key;
}

// Hackathon demo: confirm a payment as paid. In production this would be
// handled exclusively by PJP webhooks (xenditWebhook / midtransWebhook).
// See section 3.3.3 — "Simulasi Bayar Sukses" in the mobile app.
export const confirmPayment = asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
    include: { booking: { include: { items: true } } },
  });
  if (!payment) throw new ApiError(404, "Payment not found");
  if (payment.status !== "PENDING") throw new ApiError(409, "Payment already processed");

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  // Update BookingItem statuses based on payment type:
  // DP_30 → ON_PROGRESS ("Aktif"), FULL_100 → COMPLETED ("Lunas")
  const newItemStatus = payment.paymentType === "FULL_100" ? "COMPLETED" : "ON_PROGRESS";
  await prisma.bookingItem.updateMany({
    where: { bookingId: payment.bookingId },
    data: { status: newItemStatus },
  });

  // Settle asynchronously — fire and forget from the demo endpoint
  settlePayment(payment.id).catch((err) => console.error("settlePayment failed:", err));

  res.json(updatedPayment);
});

export const midtransWebhook = asyncHandler(async (req, res) => {
  const payload = req.body;

  const verified = verifyMidtransSignature(payload);
  if (!verified) {
    throw new ApiError(401, "Invalid signature key");
  }

  const { order_id, transaction_status, transaction_id } = payload;
  const bookingId = order_id.split("_")[0];

  if (transaction_status === "settlement" || transaction_status === "capture") {
    const payment = await prisma.payment.findUnique({
      where: { bookingId },
    });
    if (!payment) {
      throw new ApiError(404, "Payment not found");
    }

    if (payment.status !== "PAID") {
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          pjpTransactionId: transaction_id,
        },
      });

      // Update BookingItem statuses on real webhook too
      const newItemStatus = payment.paymentType === "FULL_100" ? "COMPLETED" : "ON_PROGRESS";
      await prisma.bookingItem.updateMany({
        where: { bookingId },
        data: { status: newItemStatus },
      });

      settlePayment(updatedPayment.id).catch((err) =>
        console.error("settlePayment failed:", err)
      );
    }
  } else if (
    transaction_status === "expire" ||
    transaction_status === "cancel" ||
    transaction_status === "deny"
  ) {
    await prisma.payment.updateMany({
      where: { bookingId },
      data: { status: "FAILED" },
    });
  }

  res.status(200).json({ received: true });
});
