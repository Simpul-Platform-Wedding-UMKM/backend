import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IDR = (n) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const dateFmt = (d) =>
    new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);

async function loadItemForVendor(itemId, vendorId) {
    const item = await prisma.bookingItem.findUnique({
        where: { id: itemId },
        include: {
            vendorService: true,
            booking: {
                include: {
                    weddingProject: { include: { account: true } },
                    payment: true,
                },
            },
        },
    });
    if (!item) throw new ApiError(404, "Booking item not found");
    if (item.vendorId !== vendorId) throw new ApiError(403, "Not your order");
    return item;
}

// ---------------------------------------------------------------------------
// GET /vendor/orders
// ---------------------------------------------------------------------------
export const listMyOrders = asyncHandler(async (req, res) => {
    const items = await prisma.bookingItem.findMany({
        where: { vendorId: req.vendor.id },
        orderBy: { id: "desc" },
        include: {
            vendorService: true,
            booking: {
                include: { weddingProject: { include: { account: true } } },
            },
        },
    });

    res.json(
        items.map((i) => ({
            orderNo: i.id.slice(-6).toUpperCase(),
            bookingItemId: i.id,
            bookingId: i.bookingId,
            clientName: i.booking.weddingProject.account.fullName,
            clientAvatar: i.booking.weddingProject.account.profileImageUrl,
            date: dateFmt(i.booking.createdAt),
            amount: i.price,
            amountLabel: IDR(i.price),
            package: i.vendorService.name,
            status: i.status,
            milestones: i.milestones ?? [],
        })),
    );
});

// ---------------------------------------------------------------------------
// POST /vendor/orders/:bookingItemId/accept — PENDING → ON_PROGRESS
// ---------------------------------------------------------------------------
export const acceptOrder = asyncHandler(async (req, res) => {
    const item = await loadItemForVendor(req.params.bookingItemId, req.vendor.id);
    if (item.status !== "PENDING") {
        throw new ApiError(422, `Cannot accept an order in status ${item.status}`);
    }
    const updated = await prisma.bookingItem.update({
        where: { id: item.id },
        data: { status: "ON_PROGRESS" },
    });
    res.json(updated);
});

// ---------------------------------------------------------------------------
// POST /vendor/orders/:bookingItemId/reject — PENDING → CANCELLED
// ---------------------------------------------------------------------------
export const rejectOrder = asyncHandler(async (req, res) => {
    const item = await loadItemForVendor(req.params.bookingItemId, req.vendor.id);
    if (item.status !== "PENDING") {
        throw new ApiError(422, `Cannot reject an order in status ${item.status}`);
    }
    const updated = await prisma.bookingItem.update({
        where: { id: item.id },
        data: { status: "CANCELLED" },
    });
    res.json(updated);
});

// ---------------------------------------------------------------------------
// PUT /vendor/orders/:bookingItemId/milestones — replace milestone checklist
// ---------------------------------------------------------------------------
const milestoneSchema = z.object({
    milestones: z.array(
        z.object({
            title: z.string().min(1).max(120),
            status: z.string().min(1).max(60),
            done: z.boolean(),
        }),
    ).min(1),
});
export const updateMilestones = asyncHandler(async (req, res) => {
    const { milestones } = milestoneSchema.parse(req.body);
    const item = await loadItemForVendor(req.params.bookingItemId, req.vendor.id);
    const updated = await prisma.bookingItem.update({
        where: { id: item.id },
        data: { milestones },
    });
    res.json(updated);
});
