import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { createBooking, getBooking, updateBookingItemStatus } from "./booking.controller.js";

export const bookingRouter = Router();

bookingRouter.post("/", requireAuth, requireRole("CONSUMER"), createBooking);
bookingRouter.get("/:id", requireAuth, getBooking);
bookingRouter.patch(
  "/items/:itemId/status",
  requireAuth,
  requireRole("VENDOR"),
  updateBookingItemStatus
);
