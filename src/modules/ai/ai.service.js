import OpenAI from "openai";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

// Step 1: Retrieval. Filter the DB FIRST, before the LLM ever sees
// anything — this is what section 3.5.2's risk table means by
// "Pembatasan knowledge base AI hanya pada database vendor terverifikasi
// dan pembatasan harga riil pasar." The model never gets to invent a
// vendor; it can only choose among rows that actually exist and are
// KYB-verified.
async function retrieveCandidates({ region, categories, budgetPerCategory }) {
  const services = await prisma.vendorService.findMany({
    where: {
      isActive: true,
      vendor: {
        kybVerified: true,
        ...(region && { region: { equals: region, mode: "insensitive" } }),
        ...(categories?.length && { category: { in: categories } }),
      },
      ...(budgetPerCategory && { price: { lte: budgetPerCategory * 1.15 } }), // small headroom, final filtering happens below
    },
    include: { vendor: true },
    take: 60, // cap what we send to the LLM — keeps prompt small and predictable
  });

  return services.map((s) => ({
    vendorServiceId: s.id,
    vendorId: s.vendorId,
    vendorName: s.vendor.businessName,
    category: s.vendor.category,
    serviceName: s.name,
    price: s.price,
    region: s.vendor.region,
    ratingAvg: s.vendor.ratingAvg,
  }));
}

const SYSTEM_PROMPT = `You are the SIMPUL Wedding Assistant. You recommend a vendor package for an
Indonesian wedding using ONLY the candidate list provided in the user message — never invent a
vendor, service, or price that isn't in that list. Pick at most one service per requested category,
staying within the couple's total budget. Respond with strict JSON matching this shape:
{
  "packages": [
    { "category": string, "vendorServiceId": string, "reasoning": string }
  ],
  "totalPrice": number,
  "notes": string
}
If no candidate fits a category within budget, omit that category from "packages" and explain why in "notes".`;

export async function recommendPackage({ totalBudget, guestCount, location, themePref, categories }) {
  const budgetPerCategory = categories?.length ? Math.floor(totalBudget / categories.length) : undefined;
  const candidates = await retrieveCandidates({ region: location, categories, budgetPerCategory });

  const userPrompt = JSON.stringify({
    totalBudget,
    guestCount,
    location,
    themePref,
    requestedCategories: categories,
    candidates,
  });

  const completion = await openai.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const recommendation = JSON.parse(completion.choices[0].message.content);

  // Cross-check the LLM's output against the candidate list one more time
  // before it ever reaches the user — belt-and-suspenders against the
  // model hallucinating an id that looks plausible but isn't real.
  const validIds = new Set(candidates.map((c) => c.vendorServiceId));
  recommendation.packages = (recommendation.packages ?? []).filter((p) =>
    validIds.has(p.vendorServiceId)
  );

  return { recommendation, candidateVendorIds: candidates.map((c) => c.vendorId) };
}
