/**
 * Vendor API tests — search, profile update, service creation.
 */

import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { api, db, registerConsumer, registerVendor, authApi, resetDB } from "./helpers.js";

beforeEach(async () => {
  await resetDB();
});

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

// ─────────────────────────────────────────────────────────────────────────────
describe("Vendor management endpoints", () => {
  it("PATCH /vendors/me/services/:id — updates a service", async () => {
    const { token } = await registerVendor();
    const created = await authApi(token)
      .post("/vendors/me/services")
      .send({ name: "Basic Bridal Makeup", price: 1500000 })
      .expect(201);

    const res = await authApi(token)
      .patch(`/vendors/me/services/${created.body.id}`)
      .send({ price: 2000000, isActive: false })
      .expect(200);

    expect(res.body.price).toBe(2000000);
    expect(res.body.isActive).toBe(false);
  });

  it("PATCH /vendors/me/services/:id — 403 for another vendor's service", async () => {
    const { token: t1 } = await registerVendor({ email: "owner@test.com" });
    const { token: t2 } = await registerVendor({ email: "other@test.com" });

    const created = await authApi(t1)
      .post("/vendors/me/services")
      .send({ name: "Secret Package", price: 1000000 })
      .expect(201);

    await authApi(t2)
      .patch(`/vendors/me/services/${created.body.id}`)
      .send({ price: 1 })
      .expect(403);
  });

  it("DELETE /vendors/me/services/:id — removes a service", async () => {
    const { token } = await registerVendor();
    const created = await authApi(token)
      .post("/vendors/me/services")
      .send({ name: "To Delete", price: 1000000 })
      .expect(201);

    await authApi(token)
      .delete(`/vendors/me/services/${created.body.id}`)
      .expect(200);

    const res = await authApi(token).get("/vendors/me/catalog").expect(200);
    expect(res.body.services).toHaveLength(0);
  });

  it("GET /vendors/me/dashboard — returns stats", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token).get("/vendors/me/dashboard").expect(200);
    expect(res.body).toMatchObject({
      revenueTotal: 0,
      revenuePending: 0,
      newOrdersCount: 0,
    });
    expect(typeof res.body.ratingAvg).toBe("number");
  });

  it("GET /vendors/me/earnings — returns payout summary", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token).get("/vendors/me/earnings").expect(200);
    expect(res.body).toMatchObject({ totalSettled: 0, pendingPayout: 0 });
    expect(Array.isArray(res.body.payouts)).toBe(true);
  });

  it("GET /vendors/me/notifications — returns list", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token).get("/vendors/me/notifications").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /vendors/me/catalog — returns services + portfolio", async () => {
    const { token } = await registerVendor();
    await authApi(token)
      .post("/vendors/me/services")
      .send({ name: "Premium Package", price: 3000000 })
      .expect(201);

    const res = await authApi(token).get("/vendors/me/catalog").expect(200);
    expect(res.body.services).toHaveLength(1);
    expect(res.body.services[0].name).toBe("Premium Package");
    expect(Array.isArray(res.body.portfolio)).toBe(true);
  });

  it("POST /vendors/me/portfolio — appends an image URL", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token)
      .post("/vendors/me/portfolio")
      .send({ imageUrl: "https://example.com/photo.jpg" })
      .expect(200);

    expect(res.body.portfolio).toContain("https://example.com/photo.jpg");
  });

  it("GET /vendors/me/premium — returns premium config", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token).get("/vendors/me/premium").expect(200);
    expect(res.body).toMatchObject({
      adSlotActive: false,
      adBidAmount: 500,
      subscriptionTier: "FREE",
    });
    expect(Array.isArray(res.body.seoKecamatans)).toBe(true);
  });

  it("PUT /vendors/me/premium/ad-slot — toggles ad slot", async () => {
    const { token } = await registerVendor();

    const res = await authApi(token)
      .put("/vendors/me/premium/ad-slot")
      .send({ adSlotActive: true, adBidAmount: 2500 })
      .expect(200);

    expect(res.body.adSlotActive).toBe(true);
    expect(res.body.adBidAmount).toBe(2500);
  });
});
