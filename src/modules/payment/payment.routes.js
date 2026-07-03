import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { createPayment, getPayment } from "./payment.controller.js";

export const paymentRouter = Router();

paymentRouter.post("/bookings/:bookingId/payment", requireAuth, requireRole("CONSUMER"), createPayment);
paymentRouter.get("/payments/:id", requireAuth, getPayment);
