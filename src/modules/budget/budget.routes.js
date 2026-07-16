import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import {
  createWeddingProject,
  getMyWeddingProjects,
  setBudgetAllocations,
  addExpense,
  listExpenses,
} from "./budget.controller.js";

export const budgetRouter = Router();

budgetRouter.use(requireAuth, requireRole("CONSUMER"));
budgetRouter.post("/projects", createWeddingProject);
budgetRouter.get("/projects", getMyWeddingProjects);
budgetRouter.put("/projects/:projectId/allocations", setBudgetAllocations);
budgetRouter.post("/projects/:projectId/expenses", addExpense);
budgetRouter.get("/projects/:projectId/expenses", listExpenses);
