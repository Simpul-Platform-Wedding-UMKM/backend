// TODO: Payout/disbursement ke vendor masih mock (di luar scope integrasi
// Midtrans Snap ini). Yang sudah real:
//   1. createSnapForBooking → panggil Midtrans Snap API, dapat snapToken +
//      paymentUrl asli
//   2. Webhook handler → verifikasi signature dari Midtrans, update Payment
//      + BookingItem otomatis (endpoint manual confirmPayment sudah dihapus)
//
// Yang perlu diganti sebelum production:
//   1. settlePayment → panggil Midtrans payout/transfer API untuk kirim dana
//      ke vendor (butuh konfigurasi merchant terpisah)

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { createSnapTransaction, buildOrderId } from "./midtrans.service.js";

const QRIS_TTL_MINUTES = 15;

// ---------------------------------------------------------------------------
// Real: minta Snap token + payment URL ke Midtrans untuk satu Booking.
// Return signature kompatibel dengan pemanggil di payment.controller.js.
// ---------------------------------------------------------------------------
export async function createSnapForBooking(booking, totalAmount) {
    const orderId = buildOrderId(booking.id);
    const account = booking.weddingProject?.account;
    const customer = {
        firstName: account?.fullName ?? "",
        email: account?.email ?? "",
    };
    const { token, redirectUrl } = await createSnapTransaction({
        orderId,
        grossAmount: totalAmount,
        customer,
    });
    const expiresAt = new Date(Date.now() + QRIS_TTL_MINUTES * 60 * 1000);

    return {
        pjpTransactionId: orderId, // Snap order_id — dipakai webhook untuk lookup
        snapToken: token,
        paymentUrl: redirectUrl,
        qrisString: null,
        qrisImageUrl: null,
        expiresAt,
    };
}

// ---------------------------------------------------------------------------
// TODO (out of scope): tandai semua split sebagai SETTLED tanpa panggil
// disbursement API. Di production, ini akan memanggil Midtrans payout untuk
// mentransfer dana ke masing-masing vendor — butuh konfigurasi merchant
// terpisah, jadi sengaja tetap mock settlement.
// ---------------------------------------------------------------------------
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
            const pjpTransferId = `mock_payout_${split.id}_${Date.now()}`;
            console.log(
                `[Mock Settlement] Rp ${split.vendorAmount} → ${vendor.businessName} (${pjpTransferId})`
            );

            await prisma.paymentSplit.update({
                where: { id: split.id },
                data: {
                    settlementStatus: "SETTLED",
                    settledAt: new Date(),
                    pjpTransferId,
                },
            });
        } catch (err) {
            console.error(`Settlement failed for split ${split.id}:`, err);
            await prisma.paymentSplit.update({
                where: { id: split.id },
                data: { settlementStatus: "FAILED" },
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Pure math — tidak perlu mock. Tetap sama seperti sebelumnya.
// ---------------------------------------------------------------------------
export function computeSplit(price) {
    const platformFeeAmount = Math.round((price * env.platformFeeBps) / 10000);
    const vendorAmount = price - platformFeeAmount;
    return { vendorAmount, platformFeeAmount };
}
