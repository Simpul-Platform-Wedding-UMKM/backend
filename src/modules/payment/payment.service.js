import axios from "axios";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

// ---------------------------------------------------------------------
// Why two steps (collect, then disburse) instead of one atomic split:
//
// Xendit's QR Codes API (POST /qr_codes) creates a single-destination
// dynamic QRIS — it does not accept split-rule routing in the same call,
// as far as the public docs show. Xendit's split-rule feature is
// documented for card/e-wallet/invoice charges, not QR codes specifically.
// If you confirm otherwise before the demo, wire split_rule directly into
// createQrisForBooking() and delete disburseSplits() — that would get you
// closer to true one-step "Automated Routing" from section 3.3.3.
//
// Until then: collect the full amount into the platform's Xendit balance,
// then immediately fan it out via the Disbursements API once the webhook
// confirms payment. From the consumer's side it's still one QRIS scan —
// the two-step part is invisible to them and happens in seconds.
// ---------------------------------------------------------------------

const xendit = axios.create({
  baseURL: "https://api.xendit.co",
  auth: { username: env.xenditSecretKey ?? "", password: "" },
  headers: { "api-version": "2022-07-31" },
});

const QRIS_TTL_MINUTES = 15; // matches the proposal's stated Dynamic QRIS TTL and Midtrans's own default

export async function createQrisForBooking(booking, totalAmount) {
  const expiresAt = new Date(Date.now() + QRIS_TTL_MINUTES * 60 * 1000);

  const { data } = await xendit.post("/qr_codes", {
    reference_id: booking.id,
    type: "DYNAMIC",
    currency: "IDR",
    amount: totalAmount,
    expires_at: expiresAt.toISOString(),
    callback_url: `${process.env.PUBLIC_BASE_URL ?? "http://localhost:4000"}/webhooks/xendit`,
  });

  return {
    pjpTransactionId: data.id,
    qrisString: data.qr_string,
    expiresAt,
  };
}

// Called from the webhook route once Xendit confirms the QR was paid.
// Computes each vendor's share from the BookingItem prices that were
// snapshotted at checkout, then fires one Disbursement per vendor.
export async function settlePayment(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      splits: { include: { bookingItem: { include: { vendor: true } } } },
    },
  });
  if (!payment || payment.status !== "PAID") return;

  for (const split of payment.splits) {
    if (split.settlementStatus === "SETTLED") continue;
    const vendor = split.bookingItem.vendor;

    try {
      const { data } = await xendit.post("/disbursements", {
        external_id: `split_${split.id}`,
        amount: split.vendorAmount,
        bank_code: vendor.bankName,
        account_holder_name: vendor.bankAccountName,
        account_number: vendor.bankAccountNumber,
        description: `SIMPUL payout — booking ${payment.bookingId}`,
      });

      await prisma.paymentSplit.update({
        where: { id: split.id },
        data: { settlementStatus: "SETTLED", settledAt: new Date(), pjpTransferId: data.id },
      });
    } catch (err) {
      // Don't let one failed vendor payout silently swallow the rest —
      // log and keep the split PENDING so it shows up in a reconciliation
      // job/dashboard rather than getting lost.
      console.error(`Disbursement failed for split ${split.id}:`, err.response?.data ?? err.message);
      await prisma.paymentSplit.update({
        where: { id: split.id },
        data: { settlementStatus: "FAILED" },
      });
    }
  }
}

// Splits BookingItem prices into (vendorAmount, platformFeeAmount) using
// the micro-fee rate from env (default 0.75%, inside the proposal's 0.5–1% range).
export function computeSplit(price) {
  const platformFeeAmount = Math.round((price * env.platformFeeBps) / 10000);
  const vendorAmount = price - platformFeeAmount;
  return { vendorAmount, platformFeeAmount };
}
