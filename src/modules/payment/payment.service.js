// TODO: Ganti dengan Midtrans / Xendit real integration sebelum production.
// Saat ini seluruh payment flow menggunakan mock/simulasi tanpa payment
// gateway eksternal. Lihat payment.routes.js untuk endpoint manual
// POST /payments/:id/confirm yang mensimulasikan pembayaran sukses.
//
// Yang perlu diganti sebelum production:
//   1. createQrisForBooking  → panggil Xendit QR Codes API atau Midtrans
//      charge endpoint untuk generate QRIS asli
//   2. settlePayment         → panggil Xendit Disbursements API atau
//      Midtrans payout untuk transfer dana ke vendor
//   3. Webhook handler       → verifikasi signature dari PJP, update
//      Payment + BookingItem otomatis (hapus endpoint manual confirmPayment)

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

const QRIS_TTL_MINUTES = 15;

// ---------------------------------------------------------------------------
// Mock: generate dummy QRIS data tanpa panggil PJP eksternal.
// Return signature sama dengan sebelumnya supaya payment.controller.js
// tidak perlu diubah sama sekali.
// ---------------------------------------------------------------------------
export async function createQrisForBooking(booking, totalAmount) {
    const expiresAt = new Date(Date.now() + QRIS_TTL_MINUTES * 60 * 1000);

    // Dummy QR string — frontend (QrPaymentScreen) merender QR-nya sendiri
    // via CustomPaint (_MockQrDetailPainter), jadi nilai ini tidak dipakai
    // untuk rendering. Tetap disimpan untuk keperluan record-keeping.
    const mockQrString = `MOCK_QRIS_${booking.id}_${Date.now()}`;

    return {
        pjpTransactionId: `mock_txn_${booking.id}_${Date.now()}`,
        qrisString: mockQrString,
        qrisImageUrl: null,               // frontend render sendiri, tidak perlu URL
        expiresAt,
    };
}

// ---------------------------------------------------------------------------
// Mock: tandai semua split sebagai SETTLED tanpa panggil disbursement API.
// Di production, ini akan memanggil Xendit/Midtrans disbursement/payout
// untuk mentransfer dana ke masing-masing vendor.
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
