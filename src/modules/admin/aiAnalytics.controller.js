import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// GET /ai-analytics-logs — returns AI recommendation logs with shape the
// admin dashboard expects.
export const getAIAnalyticsLogs = asyncHandler(async (req, res) => {
  const logs = await prisma.aiRecommendationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const result = logs.map((log) => {
    // queryParams & recommendedPackage disimpan sebagai string polos
    // (seed) atau JSON string — parse aman untuk tampilan bersih.
    const rawQuery = log.queryParams;
    const rawPkg = log.recommendedPackage;
    const query =
      typeof rawQuery === "string" && rawQuery.startsWith("{")
        ? safeParse(rawQuery)
        : String(rawQuery ?? "");
    const pkg =
      typeof rawPkg === "string" && rawPkg.startsWith("{")
        ? safeParse(rawPkg)
        : String(rawPkg ?? "");

    const cleanQuery = stripMarkdown(query);
    const cleanPkg = stripMarkdown(pkg);

    return {
      id: log.id,
      vendorId: (log.candidateVendorIds && log.candidateVendorIds[0]) || "",
      queryType: "recommendation",
      topic: cleanPkg ? cleanPkg.slice(0, 80) : "AI recommendation",
      query: cleanQuery,
      response: cleanPkg,
      tokensUsed: 0,
      confidence: 0.9,
      createdAt: log.createdAt.toISOString(),
    };
  });

  res.json(result);
});

// Parse JSON string dengan aman; kembalikan string asli jika gagal.
function safeParse(value) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return value;
  }
}

// Bersihkan simbol markdown (**bold**, *italic*, `code`, heading, list)
// dari teks LLM agar tampilan admin tidak berantakan.
function stripMarkdown(text) {
  if (typeof text !== "string") return text;
  let t = text;
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  t = t.replace(/__(.+?)__/g, "$1");
  t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
  t = t.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^(\s*)[-*]\s+/gm, "$1");
  t = t.replace(/^\s*#{1,6}\s+/gm, "");
  t = t.replace(/\s*#{1,6}\s+/g, " ");
  return t.trim();
}
