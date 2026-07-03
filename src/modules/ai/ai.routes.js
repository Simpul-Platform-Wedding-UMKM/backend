import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getRecommendation } from "./ai.controller.js";

export const aiRouter = Router();

aiRouter.post("/recommend", requireAuth, requireRole("CONSUMER"), getRecommendation);
