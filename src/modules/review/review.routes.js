import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { createReview } from "./review.controller.js";

export const reviewRouter = Router();

reviewRouter.post("/", requireAuth, requireRole("CONSUMER"), createReview);
