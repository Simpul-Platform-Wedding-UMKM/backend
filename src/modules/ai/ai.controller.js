import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { recommendPackage } from "./ai.service.js";

const requestSchema = z.object({
  weddingProjectId: z.string(),
  categories: z
    .array(
      z.enum([
        "MUA",
        "CATERING",
        "DECORATION",
        "PHOTOGRAPHY",
        "ATTIRE",
        "WEDDING_ORGANIZER",
        "VENUE",
        "OTHER",
      ])
    )
    .min(1),
});

export const getRecommendation = asyncHandler(async (req, res) => {
  const data = requestSchema.parse(req.body);

  const project = await prisma.weddingProject.findFirst({
    where: { id: data.weddingProjectId, accountId: req.account.id },
  });
  if (!project) throw new ApiError(404, "Wedding project not found");

  const { recommendation, candidateVendorIds } = await recommendPackage({
    totalBudget: project.totalBudget,
    guestCount: project.guestCount,
    location: project.location,
    themePref: project.themePref,
    categories: data.categories,
  });

  await prisma.aiRecommendationLog.create({
    data: {
      weddingProjectId: project.id,
      queryParams: { ...data, totalBudget: project.totalBudget },
      candidateVendorIds,
      recommendedPackage: recommendation,
    },
  });

  res.json(recommendation);
});
