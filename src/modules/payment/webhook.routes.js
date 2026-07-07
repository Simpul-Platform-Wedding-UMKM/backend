import { Router } from "express";
import { xenditWebhook, midtransWebhook } from "./payment.controller.js";

export const webhookRouter = Router();

webhookRouter.post("/xendit", xenditWebhook);
webhookRouter.post("/midtrans", midtransWebhook);
