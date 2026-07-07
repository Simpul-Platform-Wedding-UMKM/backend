import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { registerConsumer, login, googleLogin, getMe } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register/consumer", registerConsumer);
authRouter.post("/login", login);
authRouter.post("/google", googleLogin);
authRouter.get("/me", requireAuth, getMe);

