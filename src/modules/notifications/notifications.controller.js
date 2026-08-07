import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// Notifications are DERIVED from real events, not stored:
//   - booking items that were created for the user (order placed)
//   - payments that reached PAID (payment confirmed)
//   - payment splits that settled (vendor payout — informational for consumer)
//   - chat messages received from vendors
//   - support ticket updates
// There is no read-state column, so isRead is always false (same as vendor).

// GET /notifications
export const getNotifications = asyncHandler(async (req, res) => {
  const accountId = req.account.id;

  const [projects, bookings, chatRooms, tickets] = await Promise.all([
    prisma.weddingProject.findMany({
      where: { accountId },
      select: { id: true },
    }),
    prisma.booking.findMany({
      where: { weddingProject: { accountId } },
      include: {
        items: { include: { vendor: true, vendorService: true } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.chatRoom.findMany({
      where: { consumerId: accountId },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.supportTicket.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const notifications = [];

  // 1. Booking items (new orders / status)
  for (const booking of bookings) {
    for (const item of booking.items) {
      notifications.push({
        id: `booking-${item.id}`,
        type: "ORDER",
        title: "Pesanan Dikirim",
        description: `${item.vendor?.businessName ?? "Vendor"} menerima pesanan ${item.vendorService?.name ?? "paket"} Anda.`,
        createdAt: booking.createdAt.toISOString(),
        isRead: false,
      });
    }
  }

  // 2. Payments that reached PAID
  for (const booking of bookings) {
    const p = booking.payment;
    if (p && p.status === "PAID") {
      notifications.push({
        id: `payment-${p.id}`,
        type: "PAYMENT",
        title: "Pembayaran Diterima",
        description: `Pembayaran ${p.paymentType === "DP_30" ? "uang muka (DP 30%)" : "pelunasan"} sebesar Rp${p.totalAmount.toLocaleString("id-ID")} berhasil dikonfirmasi.`,
        createdAt: (p.paidAt ?? p.updatedAt).toISOString(),
        isRead: false,
      });
    }
  }

  // 3. Chat messages from vendors (latest per room)
  for (const room of chatRooms) {
    const last = room.messages[0];
    if (last && last.senderType === "VENDOR") {
      notifications.push({
        id: `chat-${last.id}`,
        type: "CHAT",
        title: "Pesan Baru dari Vendor",
        description: "Seorang vendor mengirimkan pesan baru.",
        createdAt: last.createdAt.toISOString(),
        isRead: false,
      });
    }
  }

  // 4. Support ticket status
  for (const t of tickets) {
    notifications.push({
      id: `ticket-${t.id}`,
      type: "SUPPORT",
      title: "Laporan Support Diperbarui",
      description: `Tiket "${t.subject}" berstatus ${t.status}.`,
      createdAt: t.createdAt.toISOString(),
      isRead: false,
    });
  }

  // Sort newest first, cap at 30
  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(notifications.slice(0, 30));
});
