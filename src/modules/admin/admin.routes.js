import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getSystemUsers, getAuditLogs } from "./admin.controller.js";
import { getPaymentSplits, getPaymentSplitById } from "./paymentSplit.controller.js";
import { getComplianceChecks } from "./compliance.controller.js";
import { getAIAnalyticsLogs } from "./aiAnalytics.controller.js";
import { getFeaturedSlots } from "./featuredSlot.controller.js";

export const adminRouter = Router();

adminRouter.get("/system-users", requireAuth, getSystemUsers);
adminRouter.get("/audit-logs", requireAuth, getAuditLogs);
adminRouter.get("/payment-splits", requireAuth, getPaymentSplits);
adminRouter.get("/payment-splits/:id", requireAuth, getPaymentSplitById);
adminRouter.get("/compliance-checks", requireAuth, getComplianceChecks);
adminRouter.get("/ai-analytics-logs", requireAuth, getAIAnalyticsLogs);
adminRouter.get("/featured-slots", requireAuth, getFeaturedSlots);
