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
import { adminRouter } from "./modules/admin/admin.routes.js";
import { disputeRouter } from "./modules/dispute/dispute.routes.js";
import { internalRouter } from "./modules/internal/internal.routes.js";
import { reviewRouter } from "./modules/review/review.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { vendorOrdersRouter } from "./modules/vendor-orders/orders.routes.js";
import { bookmarkRouter } from "./modules/bookmark/bookmark.routes.js";
import { cartRouter } from "./modules/cart-item/cart-item.routes.js";

export const app = express();

// Trust Vercel's proxy layer so req.ip is the real client IP (needed for rate limiting)
app.set("trust proxy", 1);


const allowedOrigins = env.allowedOrigins;

/**
 * Check if an origin is allowed.
 * Supports exact matches AND wildcard patterns:
 *   "http://localhost:3000"  → exact match
 *   "*.vercel.app"           → matches any vercel.app subdomain
 *   "*.simpul.my.id"         → matches any simpul.my.id subdomain
 * When allowedOrigins is empty (no env configured), ALL origins are allowed
 * (suitable for mobile-only backends where CORS is irrelevant).
 */
function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;

  return allowedOrigins.some((pattern) => {
    // Exact match (backward compatible)
    if (pattern === origin) return true;
    // Wildcard: "*.example.com" → matches "sub.example.com", "a.b.example.com"
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // ".example.com"
      if (origin.endsWith(suffix)) return true;
    }
    return false;
  });
}

// Auto-detect Vercel deployment and allow preview URLs
const vercelUrl = process.env["VERCEL_URL"];
if (vercelUrl && !allowedOrigins.includes(`https://${vercelUrl}`)) {
  // Allow this specific Vercel deployment URL (e.g., project.vercel.app)
  // Also allow all preview deployments (*.vercel.app) if not already listed
  const hasVercelWildcard = allowedOrigins.some(
    (p) => p === "*.vercel.app" || p === "https://*.vercel.app",
  );
  if (!hasVercelWildcard) {
    console.log(
      `[cors] VERCEL_URL detected (${vercelUrl}) — consider adding "*.vercel.app" to ALLOWED_ORIGINS for preview deployments`,
    );
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        // Log rejection for debugging — helps identify missing origins
        console.warn(`[cors] Rejected origin: ${origin}`);
        callback(new Error('Origin ' + origin + ' not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// CORS preflight is handled automatically by the cors() middleware above
app.use(securityHeaders);
app.use(globalRateLimit);
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
app.use("/", adminRouter);
app.use("/", paymentRouter); // exposes /bookings/:id/payment and /payments/:id
app.use("/ai", aiRouter);
app.use("/internal", internalRouter);
app.use("/disputes", disputeRouter);
app.use("/reviews", reviewRouter);
app.use("/chats", chatRouter);
app.use("/vendor", vendorOrdersRouter);
app.use("/bookmarks", bookmarkRouter);
app.use("/cart-items", cartRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

export default app;
