import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import {
    recommendPackage,
    retrieveCandidates,
    chatSimple,
    understandMessage,
    generateReply,
} from "./ai.service.js";
import { CATEGORIES } from "../../lib/categories.js";

const requestSchema = z.object({
    weddingProjectId: z.string(),
    categories: z.array(z.enum(CATEGORIES)).min(1),
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

// ---------------------------------------------------------------------------
// Chat endpoint — free-text, intent-routed
// ---------------------------------------------------------------------------

const chatSchema = z.object({
    message: z.string().min(1).max(2000),
    weddingProjectId: z.string().optional(),
    sessionId: z.string().max(64).optional(),
});

// Guardrail: content patterns that must be rejected
function guardrailCheck(message) {
    // Block HTML/script injection
    if (/<\s*script[\s>]/i.test(message) || /on\w+\s*=/i.test(message)) {
        throw new ApiError(400, "Pesan mengandung konten yang tidak diizinkan");
    }

    // Block excessively repeated characters (spam)
    const repeat = /(.)\1{50,}/.test(message);
    const wordRepeat = /(\b\w{1,5}\b)(?:\s+\1){20,}/.test(message);
    if (repeat || wordRepeat) {
        throw new ApiError(400, "Pesan terlalu berulang");
    }
}

const SEARCH_INTENTS = new Set([
    "VendorSearch",
    "SearchPackage",
    "ComparePackage",
    "CheckAvailability",
    "BudgetPlanner",
    "Booking",
    "Payment",
    "Promotion",
    "WeddingTheme",
]);

export const chat = asyncHandler(async (req, res) => {
    const data = chatSchema.parse(req.body);

    // Guardrail
    guardrailCheck(data.message);

    // Step 1: Understand
    const understanding = await understandMessage(data.message, data.sessionId || "");
    const { intent, entities, intent_source } = understanding;

    // Step 2: Route based on intent
    // Fallback: if intent classifier fails (Unknown) but entities mention city/budget,
    // treat as vendor search — deterministic entities don't need LLM
    const hasSearchEntities = Boolean(entities.city || entities.budget || entities.venue);
    const isSearch = SEARCH_INTENTS.has(intent) || (intent === "Unknown" && hasSearchEntities);

    let reply;
    let candidates = [];
    let project = null;

    if (isSearch) {
        // Load project context if provided
        if (data.weddingProjectId) {
            project = await prisma.weddingProject.findFirst({
                where: { id: data.weddingProjectId, accountId: req.account.id },
            });
            if (!project) throw new ApiError(404, "Wedding project not found");
        }

        // Query DB for matching vendors
        const allCandidates = await retrieveCandidates({
            region: entities.city || project?.location,
            categories: CATEGORIES,
            budgetPerCategory: project?.totalBudget
                ? Math.floor(project.totalBudget / CATEGORIES.length)
                : undefined,
        });
        candidates = allCandidates;

        // Rank by relevance and take top 3 for LLM — keeps prompt small & fast
        const ranked = [...allCandidates].sort((a, b) => {
            // Rating descending
            if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
            // Budget proximity: prefer services within or near budget
            if (entities.budget) {
                const aDist = Math.abs(a.price - entities.budget);
                const bDist = Math.abs(b.price - entities.budget);
                return aDist - bDist;
            }
            return 0;
        });
        const topCandidates = ranked.slice(0, 3);

        // Generate reply with only top 3 — faster, more focused
        const generation = await generateReply({
            intent,
            entities,
            context: {
                totalBudget: project?.totalBudget?.toString() || "",
                guestCount: project?.guestCount?.toString() || "",
                location: project?.location || "",
                themePref: project?.themePref || "",
            },
            data: {
                candidates: topCandidates,
                categories: CATEGORIES,
                totalCount: allCandidates.length,
            },
            sessionId: data.sessionId || "",
        });
        reply = generation.reply || "Saya temukan beberapa vendor yang cocok. Silakan lihat daftar lengkapnya di bawah.";
    } else {
        // General conversation — no DB needed
        const chatResponse = await chatSimple(data.message, data.sessionId || "");
        reply = chatResponse.reply;
    }

    // Audit log
    if (project) {
        await prisma.aiRecommendationLog.create({
            data: {
                weddingProjectId: project.id,
                queryParams: { message: data.message, sessionId: data.sessionId, intent },
                candidateVendorIds: candidates.map((c) => c.vendorId),
                recommendedPackage: { reply, intent, entities },
            },
        });
    }

    res.json({
        success: true,
        intent,
        intent_source,
        entities,
        reply,
        candidates: isSearch ? candidates : undefined,
    });
});
