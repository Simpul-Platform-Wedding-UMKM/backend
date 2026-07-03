import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import {
  createWeddingProject,
  getMyWeddingProjects,
  setBudgetAllocations,
} from "./budget.controller.js";

export const budgetRouter = Router();

budgetRouter.use(requireAuth, requireRole("CONSUMER"));
budgetRouter.post("/projects", createWeddingProject);
budgetRouter.get("/projects", getMyWeddingProjects);
budgetRouter.put("/projects/:projectId/allocations", setBudgetAllocations);
