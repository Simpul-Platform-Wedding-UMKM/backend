import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { createPayment, createRemainderPayment, getPayment, confirmPayment } from "./payment.controller.js";

export const paymentRouter = Router();

paymentRouter.post("/bookings/:bookingId/payment", requireAuth, requireRole("CONSUMER"), createPayment);
paymentRouter.post("/bookings/:bookingId/payment/remainder", requireAuth, requireRole("CONSUMER"), createRemainderPayment);
paymentRouter.get("/payments/:id", requireAuth, getPayment);
paymentRouter.post("/payments/:id/confirm", requireAuth, confirmPayment);
