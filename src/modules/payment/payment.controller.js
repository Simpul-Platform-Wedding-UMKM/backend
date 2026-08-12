import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { createSnapForBooking, settlePayment, computeSplit } from "./payment.service.js";
import { extractBookingId, getTransactionStatus } from "./midtrans.service.js";

const createPaymentSchema = z.object({
  paymentType: z.enum(["DP_30", "FULL_100"]).default("FULL_100"),
});

// Step 1 of section 3.3.3: consolidate the Booking's items into one total,
// ask the PJP for a single Dynamic QRIS, and pre-compute (but don't yet
// settle) how that total will be split across vendors once it's paid.
export const createPayment = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.bookingId },
    include: { items: true, payment: true, weddingProject: { include: { account: true } } },
  });
  if (!booking) throw new ApiError(404, "Booking not found");

  // If a previous payment exists and is still active (PENDING & not expired),
  // don't allow creating another one — the user should pay that one. If it's
  // in a dead state (EXPIRED/FAILED/CANCELLED) or its Snap window lapsed
  // (PENDING but past expiresAt), reset it so the user can retry.
  const existing = booking.payment;
  const isPendingAndActive =
    existing?.status === "PENDING" &&
    (!existing.expiresAt || existing.expiresAt > new Date());
  if (isPendingAndActive) {
    throw new ApiError(409, "Payment already created for this booking");
  }
  if (existing) {
    // Delete the dead payment + splits so a fresh Snap transaction is created.
    await prisma.paymentSplit.deleteMany({ where: { paymentId: existing.id } });
    await prisma.payment.delete({ where: { id: existing.id } });
  }

  const { paymentType } = createPaymentSchema.parse(req.body);

  const fullAmount = booking.items.reduce((sum, i) => sum + i.price, 0);
  const chargeRate = paymentType === "DP_30" ? 0.3 : 1.0;
  const totalAmount = Math.round(fullAmount * chargeRate);
  const gateway = await createSnapForBooking(booking, totalAmount);

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
      qrisImageUrl: gateway.qrisImageUrl || null,
      snapToken: gateway.snapToken,
      paymentUrl: gateway.paymentUrl,
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

  // Server-side verification: reconcile with the PJP when the payment is
  // still pending. This makes polling work even when the Midtrans webhook
  // can't reach us (e.g. localhost development) and guards against lost or
  // delayed webhooks in production.
  if (payment.status === "PENDING" && payment.pjpProvider === "midtrans" && payment.pjpTransactionId) {
    await reconcileWithMidtrans(payment).catch((err) =>
      console.error("reconcileWithMidtrans failed:", err)
    );
  }

  // Backfill: payments marked PAID by an older webhook/flow may have
  // paidAmount/paidAt left empty. Keep the record consistent.
  if (payment.status === "PAID" && payment.paidAmount === 0 && payment.totalAmount > 0) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { paidAmount: payment.totalAmount, paidAt: payment.paidAt ?? new Date() },
    });
  }

  const fresh = await prisma.payment.findUnique({
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
  res.json(fresh);
});

// Pelunasan sisa setelah DP (installment 2). Payment row sama (bookingId
// unique) — kita update: totalAmount → sisa yang harus dibayar, paymentType
// → FULL_100, installmentNumber → 2, status → PENDING, Snap baru untuk sisa.
// Saat webhook settlement, item jadi COMPLETED & paidAmount diakumulasi.
export const createRemainderPayment = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.bookingId },
    include: { items: true, payment: true },
  });
  if (!booking) throw new ApiError(404, "Booking not found");
  const payment = booking.payment;
  if (!payment) throw new ApiError(409, "Belum ada pembayaran — buat DP/lunas dulu");
  if (payment.paymentType !== "DP_30") {
    throw new ApiError(409, "Bukan pembayaran DP — tidak ada sisa tagihan");
  }
  if (payment.status !== "PAID") {
    throw new ApiError(409, "DP belum dibayar — selesaikan DP dulu");
  }

  const fullAmount = booking.items.reduce((sum, i) => sum + i.price, 0);
  const remaining = fullAmount - payment.paidAmount;
  if (remaining <= 0) {
    throw new ApiError(409, "Tagihan sudah lunas");
  }

  const gateway = await createSnapForBooking(booking, remaining);

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      totalAmount: remaining,
      paymentType: "FULL_100",
      installmentNumber: 2,
      status: "PENDING",
      pjpTransactionId: gateway.pjpTransactionId,
      qrisString: gateway.qrisString,
      qrisImageUrl: gateway.qrisImageUrl || null,
      snapToken: gateway.snapToken,
      paymentUrl: gateway.paymentUrl,
      expiresAt: gateway.expiresAt,
    },
  });
  res.json(updated);
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

  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment) throw new ApiError(404, "Payment not found");

  // Idempotent: webhook retries / duplicate pings must not double-process
  if (payment.status !== "PAID") {
    const updatedPayment = await markPaymentPaid(payment, null);
    // Fire and forget from the webhook's point of view — Xendit just wants a
    // fast 200. Disbursement failures are handled/logged inside settlePayment.
    settlePayment(updatedPayment.id).catch((err) => console.error("settlePayment failed:", err));
  }

  res.status(200).json({ received: true });
});

export function verifyMidtransSignature(payload) {
  const { order_id, status_code, gross_amount, signature_key } = payload;
  const hashSource = `${order_id}${status_code}${gross_amount}${env.midtransServerKey}`;
  const calculatedSignature = crypto.createHash("sha512").update(hashSource).digest("hex");
  return calculatedSignature === signature_key;
}

// Reconcile a pending payment against Midtrans' own records. Used when the
// webhook can't reach us (localhost) or as a safety net for lost webhooks.
// Idempotent — only acts when the payment is still PENDING.
async function reconcileWithMidtrans(payment) {
  const status = await getTransactionStatus(payment.pjpTransactionId);
  if (!status) return;

  const transactionStatus = status.transaction_status;
  if (transactionStatus === "settlement" || transactionStatus === "capture") {
    const updatedPayment = await markPaymentPaid(payment, status.transaction_id);
    settlePayment(updatedPayment.id).catch((err) =>
      console.error("settlePayment failed:", err)
    );
  } else if (transactionStatus === "expire") {
    await prisma.payment.updateMany({
      where: { id: payment.id },
      data: { status: "EXPIRED" },
    });
  } else if (transactionStatus === "cancel") {
    await prisma.payment.updateMany({
      where: { id: payment.id },
      data: { status: "CANCELLED" },
    });
  } else if (transactionStatus === "deny") {
    await prisma.payment.updateMany({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
  }
}

// Shared logic for "a payment just got paid": update Payment (paidAmount,
// paidAt, status), flip BookingItem statuses, then settle (fire-and-forget
// from the caller's perspective). Idempotent via payment.status check.
async function markPaymentPaid(payment, transactionId) {
  const newItemStatus = payment.paymentType === "FULL_100" ? "COMPLETED" : "ON_PROGRESS";

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidAmount: payment.paidAmount + payment.totalAmount,
        ...(transactionId ? { pjpTransactionId: transactionId } : {}),
      },
    }),
    prisma.bookingItem.updateMany({
      where: { bookingId: payment.bookingId },
      data: { status: newItemStatus },
    }),
  ]);

  return updatedPayment;
}

export const midtransWebhook = asyncHandler(async (req, res) => {
  const payload = req.body;

  const verified = verifyMidtransSignature(payload);
  if (!verified) {
    throw new ApiError(401, "Invalid signature key");
  }

  const { order_id, transaction_status, transaction_id } = payload;
  const bookingId = extractBookingId(order_id);
  if (!bookingId) {
    throw new ApiError(400, "Invalid order_id format");
  }

  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }

  if (transaction_status === "settlement" || transaction_status === "capture") {
    // Idempotent: skip if already PAID (Midtrans may retry webhooks)
    if (payment.status !== "PAID") {
      const updatedPayment = await markPaymentPaid(payment, transaction_id);
      settlePayment(updatedPayment.id).catch((err) =>
        console.error("settlePayment failed:", err)
      );
    }
  } else if (transaction_status === "expire") {
    await prisma.payment.updateMany({
      where: { bookingId },
      data: { status: "EXPIRED" },
    });
  } else if (transaction_status === "cancel") {
    await prisma.payment.updateMany({
      where: { bookingId },
      data: { status: "CANCELLED" },
    });
  } else if (transaction_status === "deny") {
    await prisma.payment.updateMany({
      where: { bookingId },
      data: { status: "FAILED" },
    });
  }

  res.status(200).json({ received: true });
});
