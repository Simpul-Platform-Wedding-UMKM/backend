/**
 * Auth API tests — mirrors what you'd write in Laravel:
 *
 *   public function test_user_can_register() { ... }
 *   public function test_login_returns_token() { ... }
 *
 * In Vitest: describe() = test class, it() / test() = individual test method.
 */

import { describe, it, beforeEach, afterAll, expect } from "vitest";
import { api, db, resetDB, registerConsumer } from "./helpers.js";

// Wipe the DB before every test — like RefreshDatabase
beforeEach(async () => {
  await resetDB();
});

// Close the DB connection after all tests finish
afterAll(async () => {
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/register/consumer", () => {
  it("registers a new consumer and returns a token", async () => {
    const res = await api
      .post("/auth/register/consumer")
      .send({
        email: "davin@test.com",
        password: "password123",
        fullName: "Davin Test",
      })
      .expect(201); // like $this->assertStatus(201)

    // Like $this->assertJsonStructure(['token', 'account'])
    expect(res.body).toHaveProperty("token");
    expect(res.body.account.email).toBe("davin@test.com");

    // Password hash must NEVER leak in the response
    expect(res.body.account).not.toHaveProperty("passwordHash");
  });

  it("returns 409 if email is already taken", async () => {
    // Register once
    await registerConsumer({ email: "same@test.com" });

    // Try to register again with same email
    const res = await api
      .post("/auth/register/consumer")
      .send({ email: "same@test.com", password: "password123", fullName: "Duplicate" })
      .expect(409);

    expect(res.body.error).toMatch(/already registered/i);
  });

  it("returns 400 for invalid email format", async () => {
    await api
      .post("/auth/register/consumer")
      .send({ email: "not-an-email", password: "password123", fullName: "Test" })
      .expect(400);
  });

  it("returns 400 if password is too short (< 8 chars)", async () => {
    await api
      .post("/auth/register/consumer")
      .send({ email: "ok@test.com", password: "short", fullName: "Test" })
      .expect(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/register/vendor", () => {
  it("rejects when priceMin > priceMax", async () => {
    const res = await api
      .post("/auth/register/vendor")
      .send({
        email: "v@test.com",
        password: "password123",
        fullName: "Vendor",
        businessName: "Studio",
        category: "MUA",
        region: "Purwokerto",
        priceMin: 5000000, // higher than max — should fail
        priceMax: 1000000,
      })
      .expect(400);

    expect(res.body.error).toMatch(/priceMin/i);
  });

  it("registers a vendor with valid data", async () => {
    const res = await api
      .post("/auth/register/vendor")
      .send({
        email: "vendor@test.com",
        password: "password123",
        fullName: "Rara Studio",
        businessName: "Rara MUA",
        category: "MUA",
        region: "Purwokerto",
        priceMin: 500000,
        priceMax: 3000000,
      })
      .expect(201);

    expect(res.body.account.role).toBe("VENDOR");
    expect(res.body.token).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/login", () => {
  it("returns token for valid credentials", async () => {
    await registerConsumer({ email: "login@test.com", password: "correct123" });

    const res = await api
      .post("/auth/login")
      .send({ email: "login@test.com", password: "correct123" })
      .expect(200);

    expect(res.body).toHaveProperty("token");
  });

  it("returns 401 for wrong password", async () => {
    await registerConsumer({ email: "login2@test.com", password: "correct123" });

    await api
      .post("/auth/login")
      .send({ email: "login2@test.com", password: "wrongpassword" })
      .expect(401);
  });

  it("returns 401 for non-existent email", async () => {
    await api
      .post("/auth/login")
      .send({ email: "nobody@test.com", password: "anything" })
      .expect(401);
  });
});
