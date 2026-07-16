import { Router } from "express";
import { requireAuth, requireVendor } from "../../middleware/auth.js";
import {
    listMyRooms,
    listMessages,
    sendMessage,
} from "./chat.controller.js";

export const chatRouter = Router();

// List caller's rooms. requireVendor first so req.vendor is set when
// applicable; the controller branches on its presence.
chatRouter.get("/rooms", requireAuth, requireVendor, listMyRooms);

// Get messages for a room (roomId) or consumer↔vendor pair (vendorId).
chatRouter.get("/messages", requireAuth, requireVendor, listMessages);

// Send a message.
chatRouter.post("/messages", requireAuth, requireVendor, sendMessage);
