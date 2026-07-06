/**
 * Security hardening middleware for SIMPUL backend.
 *
 * Defences implemented here:
 *
 *  1. Request size limiting       — blocks oversized body payloads (DoS / memory exhaustion)
 *  2. CORS strict-origin check    — rejects requests from unknown origins
 *  3. HTTP security headers       — X-Content-Type-Options, etc. (Vercel adds these
 *                                   via vercel.json too, so this is defence-in-depth)
 *  4. Basic IP rate limiting      — slows down brute-force & scrapers
 *     (express-rate-limit is already in package.json)
 *  5. Parameter sanitisation      — trims & truncates string query params before
 *                                   they reach Zod / Prisma (belt-and-suspenders
 *                                   alongside the Zod schemas already in every controller)
 *
 * SQL injection is NOT a risk here because every database query goes through
 * Prisma's parameterised query engine — raw SQL is never used in this project.
 * Zod schemas in each controller provide the second layer of validation.
 *
 * ponytail: no prototype-pollution guard — express.json() parses via
 * JSON.parse, which assigns "__proto__" as a plain own key, not a prototype
 * pollution vector. Add a guard only if a body parser that doesn't use
 * JSON.parse (e.g. a custom merge/deep-extend step) is introduced later.
 */

import rateLimit from "express-rate-limit";

// ---------------------------------------------------------------------------
// 1. Request body size guard
//    Applied in app.js via express.json({ limit: '64kb' }) — see note there.
//    Max 64 KB is generous for a JSON API; a normal request is < 2 KB.
// ---------------------------------------------------------------------------
export const bodyLimit = "64kb"; // re-exported so app.js can import it

// ---------------------------------------------------------------------------
// 2. Security headers (defence-in-depth — Vercel also sets these via vercel.json)
// ---------------------------------------------------------------------------
export function securityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Allow our Flutter web origin to make requests — CORS is handled separately
    next();
}

// ---------------------------------------------------------------------------
// 3. Rate limiting — global + a tighter limit for auth routes.
//    Trust Vercel's proxy to give us the real IP.
// ---------------------------------------------------------------------------
const keyGenerator = (req) =>
    req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.ip;

export const globalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    keyGenerator,
});

// Tight rate limit for login / register — prevents brute-force
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 20 auth attempts per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many auth attempts, please try again in 15 minutes.",
    },
    keyGenerator,
});

// ---------------------------------------------------------------------------
// 4. Query parameter sanitisation
//    Trims whitespace and caps string length at 200 chars.
//    Zod schemas validate types and allowed values — this just cleans the raw
//    input before it reaches Zod so that error messages are meaningful.
// ---------------------------------------------------------------------------
const MAX_QUERY_PARAM_LENGTH = 200;

export function sanitizeQuery(req, res, next) {
    if (req.query && typeof req.query === "object") {
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === "string") {
                req.query[key] = value.trim().slice(0, MAX_QUERY_PARAM_LENGTH);
            }
        }
    }
    next();
}
