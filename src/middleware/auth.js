import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.account = payload; // { id, role, email }
    next();
  } catch (err) {
    console.error("JWT verify failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Usage: router.post('/vendors', requireAuth, requireRole('VENDOR'), handler)
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.account || !roles.includes(req.account.role)) {
      return res.status(403).json({ error: "Forbidden for this role" });
    }
    next();
  };
}

export function requireVendor(req, res, next) {
  if (!req.account) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  prisma.vendor.findUnique({
    where: { accountId: req.account.id }
  }).then((vendor) => {
    if (!vendor) {
      return res.status(403).json({ error: "Forbidden: Vendor profile required" });
    }
    req.vendor = vendor;
    next();
  }).catch(next);
}

// ponytail: like requireVendor but doesn't 403 — attaches req.vendor if caller has
// a vendor profile, passes through otherwise. Used by chat routes where both
// CONSUMER and VENDOR callers need access (controller branches on req.vendor).
export function optionalVendor(req, res, next) {
  if (!req.account) return next();
  prisma.vendor.findUnique({
    where: { accountId: req.account.id }
  }).then((vendor) => {
    if (vendor) req.vendor = vendor;
    next();
  }).catch(next);
}
