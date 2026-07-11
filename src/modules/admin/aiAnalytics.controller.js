import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// GET /ai-analytics-logs — returns AI recommendation logs with shape the
// admin dashboard expects.
export const getAIAnalyticsLogs = asyncHandler(async (req, res) => {
  const logs = await prisma.aiRecommendationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const result = logs.map((log) => ({
    id: log.id,
    vendorId: (log.candidateVendorIds && log.candidateVendorIds[0]) || "",
    queryType: "recommendation",
    topic: log.recommendedPackage
      ? JSON.stringify(log.recommendedPackage).slice(0, 80)
      : "AI recommendation",
    query: JSON.stringify(log.queryParams),
    response: JSON.stringify(log.recommendedPackage),
    tokensUsed: 0,
    confidence: 0.9,
    createdAt: log.createdAt.toISOString(),
  }));

  res.json(result);
});
