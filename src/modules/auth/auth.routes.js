import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { registerConsumer, registerVendor, login, getMe } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register/consumer", registerConsumer);
authRouter.post("/register/vendor", registerVendor);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, getMe);

