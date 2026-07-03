import { Router } from "express";
import { xenditWebhook } from "./payment.controller.js";

export const webhookRouter = Router();

webhookRouter.post("/xendit", xenditWebhook);
