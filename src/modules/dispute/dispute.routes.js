import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { raiseDispute, resolveDispute, getDisputes, getDisputeById } from "./dispute.controller.js";

export const disputeRouter = Router();

disputeRouter.get("/", requireAuth, getDisputes);
disputeRouter.get("/:id", requireAuth, getDisputeById);
disputeRouter.post("/", requireAuth, requireRole("CONSUMER"), raiseDispute);
disputeRouter.patch("/:id/resolve", requireAuth, requireRole("ADMIN"), resolveDispute);
