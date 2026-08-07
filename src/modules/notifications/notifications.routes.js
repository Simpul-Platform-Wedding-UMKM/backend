import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getNotifications } from "./notifications.controller.js";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);
notificationRouter.get("/", getNotifications);
