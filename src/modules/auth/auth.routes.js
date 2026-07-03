import { Router } from "express";
import { registerConsumer, registerVendor, login } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register/consumer", registerConsumer);
authRouter.post("/register/vendor", registerVendor);
authRouter.post("/login", login);
