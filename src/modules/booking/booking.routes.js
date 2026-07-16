import { Router } from "express";
import { requireAuth, requireRole, requireVendor } from "../../middleware/auth.js";
import { createBooking, getBooking, updateBookingItemStatus, getBookings } from "./booking.controller.js";

export const bookingRouter = Router();

bookingRouter.post("/", requireAuth, requireRole("CONSUMER"), createBooking);
bookingRouter.get("/", requireAuth, getBookings);
bookingRouter.get("/:id", requireAuth, getBooking);
bookingRouter.patch(
  "/items/:itemId/status",
  requireAuth,
  requireVendor,
  updateBookingItemStatus
);
