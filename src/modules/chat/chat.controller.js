import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Caller types:
//   - "CONSUMER" — req.account is a CONSUMER (no req.vendor)
//   - "VENDOR"   — req.vendor is set (from requireVendor middleware)
function callerType(req) {
    return req.vendor ? "VENDOR" : "CONSUMER";
}

function otherAccountView(room, type) {
    return type === "CONSUMER"
        ? { id: room.vendorId, kind: "VENDOR" }
        : { id: room.consumerId, kind: "CONSUMER" };
}

async function assertRoomAccess({ roomId, req }) {
    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new ApiError(404, "Chat room not found");
    const allowed =
        callerType(req) === "VENDOR"
            ? room.vendorId === req.vendor.id
            : room.consumerId === req.account.id;
    if (!allowed) throw new ApiError(403, "Not your chat");
    return room;
}

// ---------------------------------------------------------------------------
// GET /chats/rooms — list caller's rooms
// ---------------------------------------------------------------------------
export const listMyRooms = asyncHandler(async (req, res) => {
    const where =
        callerType(req) === "VENDOR"
            ? { vendorId: req.vendor.id }
            : { consumerId: req.account.id };

    const rooms = await prisma.chatRoom.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
    });

    // Hydrate the other party so the list view doesn't need N more round-trips.
    const consumerIds = [...new Set(rooms.map((r) => r.consumerId))];
    const vendorIds = [...new Set(rooms.map((r) => r.vendorId))];
    const [consumers, vendors] = await Promise.all([
        prisma.account.findMany({
            where: { id: { in: consumerIds } },
            select: { id: true, fullName: true, profileImageUrl: true },
        }),
        prisma.vendor.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, businessName: true, profileImageUrl: true },
        }),
    ]);
    const cMap = Object.fromEntries(consumers.map((c) => [c.id, c]));
    const vMap = Object.fromEntries(vendors.map((v) => [v.id, v]));

    res.json(
        rooms.map((r) => ({
            id: r.id,
            consumerId: r.consumerId,
            vendorId: r.vendorId,
            consumer: cMap[r.consumerId] ?? null,
            vendor: vMap[r.vendorId] ?? null,
            lastMessage: r.messages[0] ?? null,
            updatedAt: r.updatedAt,
        })),
    );
});

// ---------------------------------------------------------------------------
// GET /chats/messages?vendorId=<id> — get/upsert the room between caller & vendor
// Returns the room's messages. Used by consumers to load a chat.
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
    vendorId: z.string().optional(),
    roomId: z.string().optional(),
    since: z.string().datetime().optional(),
});
export const listMessages = asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    if (!q.vendorId && !q.roomId) {
        throw new ApiError(400, "vendorId or roomId is required");
    }

    let room;
    if (q.roomId) {
        room = await assertRoomAccess({ roomId: q.roomId, req });
    } else {
        // Consumer side: pick/create the unique (consumer, vendor) room.
        // Vendor side: also OK to ask "messages for vendor X" if X is the caller.
        if (callerType(req) === "VENDOR") {
            throw new ApiError(400, "Vendors should pass roomId");
        }
        // Verify the vendor exists (cheap guard, avoids weird rooms).
        const vendor = await prisma.vendor.findUnique({
            where: { id: q.vendorId },
            select: { id: true },
        });
        if (!vendor) throw new ApiError(404, "Vendor not found");
        room = await prisma.chatRoom.upsert({
            where: {
                consumerId_vendorId: {
                    consumerId: req.account.id,
                    vendorId: q.vendorId,
                },
            },
            update: {},
            create: { consumerId: req.account.id, vendorId: q.vendorId },
        });
    }

    const since = q.since ? new Date(q.since) : null;
    const latest = await prisma.message.findFirst({
        where: { chatRoomId: room.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
    });
    const etag = `W/"${room.id}-${latest?.createdAt?.getTime() ?? 0}"`;
    res.set("ETag", etag);
    if (latest) res.set("Last-Modified", latest.createdAt.toUTCString());

    if (since && latest && latest.createdAt <= since) {
        return res.status(304).end();
    }

    const messages = await prisma.message.findMany({
        where: {
            chatRoomId: room.id,
            ...(since && { createdAt: { gt: since } }),
        },
        orderBy: { createdAt: "asc" },
        take: 200,
    });

    res.json({ roomId: room.id, messages });
});

// ---------------------------------------------------------------------------
// POST /chats/messages
// Consumer: body { vendorId, content } → upsert room, append message
// Vendor:   body { roomId,   content } → append message in their room
// ---------------------------------------------------------------------------
const sendSchema = z.union([
    z.object({
        vendorId: z.string(),
        content: z.string().min(1).max(4000),
    }),
    z.object({
        roomId: z.string(),
        content: z.string().min(1).max(4000),
    }),
]);
export const sendMessage = asyncHandler(async (req, res) => {
    const data = sendSchema.parse(req.body);

    let room;
    if ("roomId" in data) {
        room = await assertRoomAccess({ roomId: data.roomId, req });
    } else {
        if (callerType(req) === "VENDOR") {
            throw new ApiError(400, "Vendors must pass roomId");
        }
        room = await prisma.chatRoom.upsert({
            where: {
                consumerId_vendorId: {
                    consumerId: req.account.id,
                    vendorId: data.vendorId,
                },
            },
            update: {},
            create: { consumerId: req.account.id, vendorId: data.vendorId },
        });
    }

    const senderType = callerType(req);
    const message = await prisma.message.create({
        data: {
            chatRoomId: room.id,
            senderId: req.account.id,
            senderType,
            content: data.content,
        },
    });
    // Touch the room so listMyRooms sorts by recency correctly.
    await prisma.chatRoom.update({
        where: { id: room.id },
        data: { updatedAt: new Date() },
    });

    res.status(201).json({ ...message, chatRoomId: room.id });
});
