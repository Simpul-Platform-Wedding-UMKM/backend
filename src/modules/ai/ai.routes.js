import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getRecommendation, chat } from "./ai.controller.js";

export const aiRouter = Router();

// Tighter rate limit for chatbot — prevent abuse
const chatRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Terlalu banyak permintaan chat, coba lagi nanti." },
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req) =>
        req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.ip,
});

aiRouter.post("/recommend", requireAuth, requireRole("CONSUMER"), getRecommendation);
aiRouter.post("/chat", requireAuth, requireRole("CONSUMER"), chatRateLimit, chat);
