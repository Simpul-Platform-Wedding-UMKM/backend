import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const addSchema = z.object({
  vendorServiceId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST /cart-items — upsert (idempotent)
// ---------------------------------------------------------------------------

export const addCartItem = asyncHandler(async (req, res) => {
  const data = addSchema.parse(req.body);

  const service = await prisma.vendorService.findUnique({
    where: { id: data.vendorServiceId, isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      vendor: { select: { id: true, businessName: true, category: true, region: true } },
    },
  });
  if (!service) throw new ApiError(422, "Vendor service not found or inactive");

  const item = await prisma.cartItem.upsert({
    where: {
      accountId_vendorServiceId: {
        accountId: req.account.id,
        vendorServiceId: data.vendorServiceId,
      },
    },
    create: {
      accountId: req.account.id,
      vendorServiceId: data.vendorServiceId,
    },
    update: {}, // no-op — idempotent re-add
  });

  res.status(201).json({ success: true, cartItem: { ...item, vendorService: service } });
});

// ---------------------------------------------------------------------------
// GET /cart-items
// ---------------------------------------------------------------------------

export const listCartItems = asyncHandler(async (req, res) => {
  const items = await prisma.cartItem.findMany({
    where: { accountId: req.account.id },
    include: {
      vendorService: {
        include: {
          vendor: {
            select: { id: true, businessName: true, category: true, region: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, cartItems: items, total: items.length });
});

// ---------------------------------------------------------------------------
// DELETE /cart-items/:vendorServiceId
// ---------------------------------------------------------------------------

export const removeCartItem = asyncHandler(async (req, res) => {
  await prisma.cartItem.deleteMany({
    where: {
      accountId: req.account.id,
      vendorServiceId: req.params.vendorServiceId,
    },
  });

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /cart-items — clear entire cart (called after checkout success)
// ---------------------------------------------------------------------------

export const clearCart = asyncHandler(async (req, res) => {
  const result = await prisma.cartItem.deleteMany({
    where: { accountId: req.account.id },
  });

  res.json({ success: true, deleted: result.count });
});
