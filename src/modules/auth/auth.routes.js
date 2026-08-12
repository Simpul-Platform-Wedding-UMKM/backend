import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { registerConsumer, registerVendor, login, googleLogin, getMe, updateMyAccount, uploadProfilePhoto, changePassword, getSessions, revokeSession, forgotPassword, resetPassword } from "./auth.controller.js";

// Multer memory storage — file dicek & diupload ke Supabase Storage.
// Max 100KB per foto profile (klien sudah kompres sebelum upload).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 },
});

export const authRouter = Router();

authRouter.post("/register/consumer", registerConsumer);
authRouter.post("/register/vendor", registerVendor);
authRouter.post("/login", login);
authRouter.post("/google", googleLogin);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.get("/me", requireAuth, getMe);
authRouter.patch("/me", requireAuth, updateMyAccount);
authRouter.post("/me/photo", requireAuth, upload.single("photo"), uploadProfilePhoto);
authRouter.patch("/change-password", requireAuth, changePassword);
authRouter.get("/sessions", requireAuth, getSessions);
authRouter.delete("/sessions/:id", requireAuth, revokeSession);
