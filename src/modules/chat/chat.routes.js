import { Router } from "express";
import { requireAuth, optionalVendor } from "../../middleware/auth.js";
import {
    listMyRooms,
    listMessages,
    sendMessage,
} from "./chat.controller.js";

export const chatRouter = Router();

// ponytail: optionalVendor instead of requireVendor — controllers branch on
// req.vendor (set for VENDOR, undefined for CONSUMER). Both roles need access.
chatRouter.get("/rooms", requireAuth, optionalVendor, listMyRooms);
chatRouter.get("/messages", requireAuth, optionalVendor, listMessages);
chatRouter.post("/messages", requireAuth, optionalVendor, sendMessage);
