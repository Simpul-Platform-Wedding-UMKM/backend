import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const addSchema = z.object({
  vendorId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// POST /bookmarks
// ---------------------------------------------------------------------------

export const addBookmark = asyncHandler(async (req, res) => {
  const data = addSchema.parse(req.body);

  const vendor = await prisma.vendor.findUnique({
    where: { id: data.vendorId },
    select: { id: true, businessName: true, category: true, ratingAvg: true, region: true },
  });
  if (!vendor) throw new ApiError(404, "Vendor not found");

  const bookmark = await prisma.bookmark.upsert({
    where: {
      accountId_vendorId: { accountId: req.account.id, vendorId: data.vendorId },
    },
    create: {
      accountId: req.account.id,
      vendorId: data.vendorId,
      notes: data.notes,
    },
    update: {
      notes: data.notes ?? null,
    },
  });

  res.status(201).json({ success: true, bookmark: { ...bookmark, vendor } });
});

// ---------------------------------------------------------------------------
// GET /bookmarks
// ---------------------------------------------------------------------------

export const listBookmarks = asyncHandler(async (req, res) => {
  const bookmarks = await prisma.bookmark.findMany({
    where: { accountId: req.account.id },
    include: {
      vendor: { select: { id: true, businessName: true, category: true, ratingAvg: true, region: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, bookmarks, total: bookmarks.length });
});

// ---------------------------------------------------------------------------
// GET /bookmarks/:vendorId — check if bookmarked
// ---------------------------------------------------------------------------

export const checkBookmark = asyncHandler(async (req, res) => {
  const bookmark = await prisma.bookmark.findUnique({
    where: {
      accountId_vendorId: { accountId: req.account.id, vendorId: req.params.vendorId },
    },
  });

  res.json({ success: true, bookmarked: !!bookmark });
});

// ---------------------------------------------------------------------------
// DELETE /bookmarks/:vendorId
// ---------------------------------------------------------------------------

export const removeBookmark = asyncHandler(async (req, res) => {
  await prisma.bookmark.deleteMany({
    where: { accountId: req.account.id, vendorId: req.params.vendorId },
  });

  res.json({ success: true });
});
