import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { registerConsumer, login, googleLogin, getMe, updateMyAccount, changePassword, getSessions, revokeSession, forgotPassword, resetPassword } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register/consumer", registerConsumer);
authRouter.post("/login", login);
authRouter.post("/google", googleLogin);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.get("/me", requireAuth, getMe);
authRouter.patch("/me", requireAuth, updateMyAccount);
authRouter.patch("/change-password", requireAuth, changePassword);
authRouter.get("/sessions", requireAuth, getSessions);
authRouter.delete("/sessions/:id", requireAuth, revokeSession);

