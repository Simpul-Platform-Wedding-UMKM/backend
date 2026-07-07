/**
 * Vendor API tests — search, profile update, service creation.
 */

import { describe, it, expect, afterAll } from "vitest";
import { api, db, registerConsumer, registerVendor, authApi } from "./helpers.js";

afterAll(async () => {
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /vendors — Hyper-Local Search (FR-02)", () => {
  it("returns all KYB-verified vendors without filters", async () => {
    await registerVendor({ email: "v1@test.com", region: "Purwokerto", category: "MUA" });
    await registerVendor({ email: "v2@test.com", region: "Cilacap", category: "CATERING" });

    const res = await api.get("/vendors").expect(200);
    expect(res.body).toHaveLength(2);
  });

  it("filters by region (case-insensitive)", async () => {
    await registerVendor({ email: "bwk@test.com", region: "Purwokerto" });
    await registerVendor({ email: "clp@test.com", region: "Cilacap" });

    const res = await api.get("/vendors?region=purwokerto").expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].region).toBe("Purwokerto");
  });

  it("filters by category", async () => {
    await registerVendor({ email: "mua@test.com", category: "MUA" });
    await registerVendor({ email: "cat@test.com", category: "CATERING" });

    const res = await api.get("/vendors?category=MUA").expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category).toBe("MUA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /vendors/me — update vendor profile", () => {
  it("vendor can update their own profile", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token)
      .patch("/vendors/me")
      .send({ businessName: "Updated Studio" })
      .expect(200);

    expect(res.body.businessName).toBe("Updated Studio");
  });

  it("rejects priceMin > priceMax", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token)
      .patch("/vendors/me")
      .send({ priceMin: 9000000, priceMax: 1000000 })
      .expect(400);

    expect(res.body.error).toMatch(/priceMin/i);
  });

  it("returns 401 if no token", async () => {
    await api.patch("/vendors/me").send({ businessName: "Hacker" }).expect(401);
  });

  it("returns 403 if caller is a consumer (not a vendor)", async () => {
    const { token } = await registerConsumer();
    await authApi(token).patch("/vendors/me").send({ businessName: "Hacker" }).expect(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /vendors/me/services — add a service", () => {
  it("vendor can add a service", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token)
      .post("/vendors/me/services")
      .send({ name: "Basic Bridal Makeup", price: 1500000 })
      .expect(201);

    expect(res.body.name).toBe("Basic Bridal Makeup");
    expect(res.body.price).toBe(1500000);
  });

  it("rejects negative price", async () => {
    const { token } = await registerVendor();
    await authApi(token)
      .post("/vendors/me/services")
      .send({ name: "Test", price: -100 })
      .expect(400);
  });
});
