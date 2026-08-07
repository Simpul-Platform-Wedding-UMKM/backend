import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
  listGuests,
  createGuest,
  updateGuest,
  deleteGuest,
} from "./guest.controller.js";

export const guestRouter = Router();

guestRouter.use(requireAuth);
guestRouter.get("/", listGuests);
guestRouter.post("/", createGuest);
guestRouter.patch("/:id", updateGuest);
guestRouter.delete("/:id", deleteGuest);
