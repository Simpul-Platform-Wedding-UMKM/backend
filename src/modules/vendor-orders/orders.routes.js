import { Router } from "express";
import { requireAuth, requireVendor } from "../../middleware/auth.js";
import {
    listMyOrders,
    acceptOrder,
    rejectOrder,
    updateMilestones,
} from "./orders.controller.js";

export const vendorOrdersRouter = Router();

vendorOrdersRouter.use(requireAuth, requireVendor);
vendorOrdersRouter.get("/orders", listMyOrders);
vendorOrdersRouter.post("/orders/:bookingItemId/accept", acceptOrder);
vendorOrdersRouter.post("/orders/:bookingItemId/reject", rejectOrder);
vendorOrdersRouter.put("/orders/:bookingItemId/milestones", updateMilestones);
