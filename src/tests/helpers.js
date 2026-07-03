/**
 * Shared test helpers — imported at the top of every test file.
 *
 * Think of this as Laravel's TestCase base class:
 *   - `api`    → the Supertest agent (like $this->getJson / postJson)
 *   - `db`     → the Prisma client pointed at the test database
 *   - `resetDB`→ truncates all tables before each test (like RefreshDatabase)
 *   - helpers  → `registerConsumer`, `registerVendor`, `loginAs`
 */

import request from "supertest";
import { app } from "../app.js";
import { prisma } from "../lib/prisma.js";

// ── HTTP client ───────────────────────────────────────────────────────────────
// `request(app)` works like $this->postJson() in Laravel.
// Call it fresh each test — Supertest creates the HTTP server on-demand.
export const api = request(app);

// ── Database ──────────────────────────────────────────────────────────────────
export const db = prisma;

// ── Reset the DB between tests ────────────────────────────────────────────────
// Deletes rows in dependency order (children before parents).
// Works like Laravel's RefreshDatabase trait.
export async function resetDB() {
  // Use a transaction to make the truncate atomic
  await db.$transaction([
    db.aiRecommendationLog.deleteMany(),
    db.review.deleteMany(),
    db.dispute.deleteMany(),
    db.paymentSplit.deleteMany(),
    db.payment.deleteMany(),
    db.bookingItem.deleteMany(),
    db.booking.deleteMany(),
    db.budgetAllocation.deleteMany(),
    db.weddingProject.deleteMany(),
    db.vendorService.deleteMany(),
    db.featuredSlot.deleteMany(),
    db.vendor.deleteMany(),
    db.account.deleteMany(),
  ]);
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
// These mirror Laravel's actingAs() — they give you a ready-to-use JWT token.

/**
 * Register a consumer and return { token, account }.
 * @param {Partial<{email, password, fullName}>} overrides
 */
export async function registerConsumer(overrides = {}) {
  const payload = {
    email: "consumer@test.com",
    password: "password123",
    fullName: "Test Consumer",
    ...overrides,
  };
  const res = await api.post("/auth/register/consumer").send(payload).expect(201);
  return res.body; // { token, account }
}

/**
 * Register a vendor and return { token, account }.
 * @param {Partial<object>} overrides
 */
export async function registerVendor(overrides = {}) {
  const payload = {
    email: "vendor@test.com",
    password: "password123",
    fullName: "Test Vendor",
    businessName: "Test Studio",
    category: "MUA",
    region: "Purwokerto",
    priceMin: 500000,
    priceMax: 3000000,
    ...overrides,
  };
  const res = await api.post("/auth/register/vendor").send(payload).expect(201);
  return res.body; // { token, account }
}

/**
 * Returns a Supertest request with the Authorization header already set.
 * Usage: authApi(token).get('/vendors') instead of api.get(...).set(...)
 * @param {string} token
 */
export function authApi(token) {
  // Return a proxy object that pre-sets the header on every method
  return new Proxy(api, {
    get(target, method) {
      return (...args) => target[method](...args).set("Authorization", `Bearer ${token}`);
    },
  });
}
