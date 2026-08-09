import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getSystemUsers, getAuditLogs, createVendor, updateVendor, getHeatmapData, getVendorVerifications, getVendorVerificationById } from "./admin.controller.js";
import { getPaymentSplits, getPaymentSplitById, updatePaymentSplit } from "./paymentSplit.controller.js";
import { getComplianceChecks } from "./compliance.controller.js";
import { getAIAnalyticsLogs } from "./aiAnalytics.controller.js";
import { getFeaturedSlots } from "./featuredSlot.controller.js";

export const adminRouter = Router();

adminRouter.get("/system-users", requireAuth, getSystemUsers);
adminRouter.get("/audit-logs", requireAuth, getAuditLogs);
adminRouter.get("/vendor-verifications", requireAuth, requireRole("ADMIN"), getVendorVerifications);
adminRouter.get("/vendor-verifications/:id", requireAuth, requireRole("ADMIN"), getVendorVerificationById);
adminRouter.get("/payment-splits", requireAuth, getPaymentSplits);
adminRouter.get("/payment-splits/:id", requireAuth, getPaymentSplitById);
adminRouter.patch("/payment-splits/:id", requireAuth, requireRole("ADMIN"), updatePaymentSplit);
adminRouter.get("/compliance-checks", requireAuth, getComplianceChecks);
adminRouter.get("/ai-analytics-logs", requireAuth, getAIAnalyticsLogs);
adminRouter.get("/featured-slots", requireAuth, getFeaturedSlots);
adminRouter.get("/heatmap", requireAuth, getHeatmapData);
adminRouter.post("/vendors", requireAuth, requireRole("ADMIN"), createVendor);
adminRouter.patch("/vendors/:id", requireAuth, requireRole("ADMIN"), updateVendor);
