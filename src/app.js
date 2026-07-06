import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { statusPage } from "./status.page.js";
import {
    bodyLimit,
    securityHeaders,
    globalRateLimit,
    authRateLimit,
    sanitizeQuery,
} from "./middleware/security.js";

import { authRouter } from "./modules/auth/auth.routes.js";
import { vendorRouter } from "./modules/vendor/vendor.routes.js";
import { budgetRouter } from "./modules/budget/budget.routes.js";
import { bookingRouter } from "./modules/booking/booking.routes.js";
import { paymentRouter } from "./modules/payment/payment.routes.js";
import { webhookRouter } from "./modules/payment/webhook.routes.js";
import { aiRouter } from "./modules/ai/ai.routes.js";
import { disputeRouter } from "./modules/dispute/dispute.routes.js";
import { reviewRouter } from "./modules/review/review.routes.js";

export const app = express();

// Trust Vercel's proxy layer so req.ip is the real client IP (needed for rate limiting)
app.set("trust proxy", 1);

app.use(securityHeaders);
app.use(globalRateLimit);
app.use(cors({ origin: env.corsOrigin }));
app.use(morgan("dev"));
app.use(express.json({ limit: bodyLimit }));
app.use(sanitizeQuery);

// Xendit's webhook is verified via the x-callback-token header (checked
// inside xenditWebhook), not a raw-body HMAC signature, so it's safe to
// sit after the normal JSON parser like everything else.
app.use("/webhooks", webhookRouter);

app.get("/", (req, res) => res.redirect("/status"));

app.get("/health", async (req, res) => {
    const uptime = process.uptime();
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ ok: true, db: "up", uptime });
    } catch {
        res.status(503).json({ ok: false, db: "down", uptime });
    }
});

app.get("/status", (req, res) => res.type("html").send(statusPage));

app.use("/auth", authRateLimit, authRouter);
app.use("/vendors", vendorRouter);
app.use("/budget", budgetRouter);
app.use("/bookings", bookingRouter);
app.use("/", paymentRouter); // exposes /bookings/:id/payment and /payments/:id
app.use("/ai", aiRouter);
app.use("/disputes", disputeRouter);
app.use("/reviews", reviewRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

export default app;
