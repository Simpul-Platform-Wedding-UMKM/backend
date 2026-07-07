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
// If TEST_API_URL is provided, it tests a remote environment (e.g. Vercel).
export const api = request(process.env.TEST_API_URL || app);

// ── Database ──────────────────────────────────────────────────────────────────
export const db = prisma;

export async function resetDB() {
  console.log("resetDB called. DATABASE_URL =", process.env.DATABASE_URL);
  const searchPath = await db.$queryRaw`SHOW search_path`;
  console.log("resetDB SHOW search_path:", searchPath);
  const tablenames = await db.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname='test'
  `;
  console.log("resetDB found tables in 'test' schema:", tablenames);

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== "_prisma_migrations")
    .map((name) => `"test"."${name}"`)
    .join(", ");

  if (tables.length > 0) {
    try {
      await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (e) {
      console.error("Failed to truncate database tables:", e);
    }
  }
}



// ── Seed specific test accounts from seed.ts ───────────────────────────────
export async function seedSeededUsers() {
  // Seed standard dummy consumer from seed.ts
  await db.account.create({
    data: {
      email: "davin@demo.simpul",
      passwordHash: "password123", // mocked bcryptjs makes this match password123
      fullName: "Davin & Partner",
      role: "CONSUMER",
    },
  });

  // Seed standard dummy vendor from seed.ts
  await db.account.create({
    data: {
      email: "rara.makeup.studio@demo.simpul",
      passwordHash: "password123", // mocked bcryptjs makes this match password123
      fullName: "Rara Makeup Studio",
      role: "CONSUMER",
      vendor: {
        create: {
          businessName: "Rara Makeup Studio",
          category: "MUA",
          region: "Purwokerto",
          priceMin: 1500000,
          priceMax: 5000000,
          kybVerified: true,
        },
      },
    },
  });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
// These mirror Laravel's actingAs() — they give you a ready-to-use JWT token.

/**
 * Register a consumer and return { token, account }.
 * @param {Partial<{email, password, fullName}>} overrides
 */
export async function registerConsumer(overrides = {}) {
  const payload = {
    email: `consumer-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`,
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
  const email = overrides.email || `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
  const password = overrides.password || "password123";
  const fullName = overrides.fullName || "Test Vendor";

  const consumer = await registerConsumer({ email, password, fullName });

  const payload = {
    businessName: overrides.businessName || "Test Studio",
    category: overrides.category || "MUA",
    region: overrides.region || "Purwokerto",
    priceMin: overrides.priceMin !== undefined ? overrides.priceMin : 500000,
    priceMax: overrides.priceMax !== undefined ? overrides.priceMax : 3000000,
  };

  const res = await authApi(consumer.token)
    .post("/vendors/apply")
    .send(payload)
    .expect(201);

  return {
    token: consumer.token,
    account: {
      ...consumer.account,
      vendor: res.body,
    },
  };
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
