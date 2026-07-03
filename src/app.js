import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";

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

app.use(cors({ origin: env.corsOrigin }));
app.use(morgan("dev"));
app.use(express.json());

// Xendit's webhook is verified via the x-callback-token header (checked
// inside xenditWebhook), not a raw-body HMAC signature, so it's safe to
// sit after the normal JSON parser like everything else.
app.use("/webhooks", webhookRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/vendors", vendorRouter);
app.use("/budget", budgetRouter);
app.use("/bookings", bookingRouter);
app.use("/", paymentRouter); // exposes /bookings/:id/payment and /payments/:id
app.use("/ai", aiRouter);
app.use("/disputes", disputeRouter);
app.use("/reviews", reviewRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);
