import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { raiseDispute, resolveDispute, getDisputes, getDisputeById } from "./dispute.controller.js";

export const disputeRouter = Router();

disputeRouter.get("/", requireAuth, getDisputes);
disputeRouter.get("/:id", requireAuth, getDisputeById);
disputeRouter.post("/", requireAuth, requireRole("CONSUMER"), raiseDispute);
disputeRouter.patch("/:id/resolve", requireAuth, requireRole("ADMIN"), resolveDispute);
// ponytail: alias so admin dashboard's PATCH /disputes/:id works
// (same handler as /:id/resolve — the body determines the action)
disputeRouter.patch("/:id", requireAuth, requireRole("ADMIN"), resolveDispute);
