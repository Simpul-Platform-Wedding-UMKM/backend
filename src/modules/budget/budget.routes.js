import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { addExpense, createWeddingProject, getMyWeddingProjects, getProjectSummary, listExpenses, setBudgetAllocations, updateWeddingProject } from "./budget.controller.js";

export const budgetRouter = Router();

budgetRouter.use(requireAuth, requireRole("CONSUMER"));
budgetRouter.post("/projects", createWeddingProject);
budgetRouter.get("/projects", getMyWeddingProjects);
budgetRouter.put("/projects/:projectId/allocations", setBudgetAllocations);
budgetRouter.patch("/projects/:projectId", updateWeddingProject);
budgetRouter.post("/projects/:projectId/expenses", addExpense);
budgetRouter.get("/projects/:projectId/expenses", listExpenses);
budgetRouter.get("/projects/:projectId/summary", getProjectSummary);
