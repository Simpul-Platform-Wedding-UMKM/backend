import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

// ---------------------------------------------------------------------------
// AI Service client — calls the FastAPI AI microservice
// ---------------------------------------------------------------------------

async function callAiService(endpoint, body) {
    const url = `${env.aiServiceUrl}${endpoint}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`AI service returned ${res.status}: ${errorBody}`);
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Step 1: Understand user message
// ---------------------------------------------------------------------------

export async function understandMessage(message, sessionId = "") {
    return callAiService("/understand", {
        message,
        sessionId,
    });
}

// ---------------------------------------------------------------------------
// Step 2: Query database (Express owns Prisma — AI service never touches it)
// ---------------------------------------------------------------------------

export async function retrieveCandidates({ region, categories, budgetPerCategory }) {
    const services = await prisma.vendorService.findMany({
        where: {
            isActive: true,
            vendor: {
                kybVerified: true,
                ...(region && { region: { equals: region, mode: "insensitive" } }),
                ...(categories?.length && { category: { in: categories } }),
            },
            ...(budgetPerCategory && { price: { lte: budgetPerCategory * 1.15 } }),
        },
        include: { vendor: true },
        take: 60,
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

// ---------------------------------------------------------------------------
// Step 3: Generate natural-language reply from structured data
// ---------------------------------------------------------------------------

export async function generateReply({ intent, entities, context, data, sessionId = "" }) {
    return callAiService("/generate", {
        intent,
        entities,
        context: context || {},
        data: data || {},
        sessionId,
    });
}

// ---------------------------------------------------------------------------
// Simple chat — no DB query, for general conversation
// ---------------------------------------------------------------------------

export async function chatSimple(message, sessionId = "") {
    return callAiService("/chat", {
        message,
        sessionId,
    });
}

// ---------------------------------------------------------------------------
// Full pipeline: understand → query DB → generate
// ---------------------------------------------------------------------------

export async function recommendPackage({
    message,
    totalBudget,
    guestCount,
    location,
    themePref,
    categories,
    sessionId,
}) {
    // Step 1: Understand
    const understanding = await understandMessage(message, sessionId);
    const { intent, entities } = understanding;

    // Step 2: Query database (Express owns Prisma)
    const budgetPerCategory = categories?.length
        ? Math.floor(totalBudget / categories.length)
        : undefined;
    const candidates = await retrieveCandidates({
        region: entities.city || location,
        categories,
        budgetPerCategory,
    });

    // Step 3: Generate natural reply
    const generation = await generateReply({
        intent,
        entities,
        context: {
            totalBudget: totalBudget.toString(),
            guestCount: guestCount?.toString(),
            location: location || "",
            themePref: themePref || "",
        },
        data: {
            candidates,
            categories: categories || [],
        },
        sessionId,
    });

    return {
        recommendation: {
            packages: candidates.map((c) => ({
                vendorServiceId: c.vendorServiceId,
                vendorId: c.vendorId,
                category: c.category,
                vendorName: c.vendorName,
                serviceName: c.serviceName,
                price: c.price,
                region: c.region,
                ratingAvg: c.ratingAvg,
            })),
            totalBudget,
            notes: generation.reply,
        },
        candidateVendorIds: candidates.map((c) => c.vendorId),
        understanding: { intent, entities, intentSource: understanding.intent_source },
    };
}
