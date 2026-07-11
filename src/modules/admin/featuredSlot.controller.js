import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// GET /featured-slots — returns featured vendor slots with shape the
// admin dashboard expects.
export const getFeaturedSlots = asyncHandler(async (req, res) => {
  const slots = await prisma.featuredSlot.findMany({
    orderBy: { endDate: "desc" },
  });

  const result = slots.map((s) => ({
    id: s.id,
    vendorId: s.vendorId,
    projectId: "",
    isActive: new Date(s.endDate) > new Date(),
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    monthlyFee: s.amountPaid,
    premiumStatus: "PREMIUM",
    createdAt: s.startDate.toISOString(),
    updatedAt: s.endDate.toISOString(),
  }));

  res.json(result);
});
