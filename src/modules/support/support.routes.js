import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createTicket, listTickets } from "./support.controller.js";

export const supportRouter = Router();

supportRouter.use(requireAuth);
supportRouter.post("/tickets", createTicket);
supportRouter.get("/tickets", listTickets);
