/**
 * Smoke E2E Vendor loop — hackathon.
 *
 * Jalur penuh: register consumer → apply vendor → KYB (multipart, butuh
 * Supabase storage) → admin approve → create service → consumer booking +
 * pay DP + confirm → vendor accept → vendor complete → consumer lihat
 * status COMPLETED.
 *
 * Append-only: user disposable, TANPA truncate, TANPA ALLOW_DB_RESET.
 * Jika SUPABASE_URL/KEY kosong → test KYB di-skip (status tetap bisa
 * diverifikasi via admin patch).
 *
 * Jalankan: `npm run test -- src/tests/vendor_hackathon_e2e.test.js`
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, authApi, db } from "./helpers.js";

const TS = Date.now();
const C_EMAIL = `vendor-e2e-c${TS}@test.com`;
const V_EMAIL = `vendor-e2e-v${TS}@test.com`;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const supabaseReady = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe("Vendor loop E2E (disposable, no DB reset)", () => {
  let consumerToken;
  let vendorToken;
  let adminToken;
  let vendorId;
  let serviceId;
  let projectId;
  let bookingId;
  let paymentId;
  let itemId;

  beforeAll(async () => {
    // Consumer
    const c = await api.post("/auth/register/consumer").send({
      email: C_EMAIL, password: "password123", fullName: "E2E Consumer",
    });
    consumerToken = c.body.token;

    // Vendor (consumer kedua + apply)
    const v = await api.post("/auth/register/consumer").send({
      email: V_EMAIL, password: "password123", fullName: "E2E Vendor",
    });
    vendorToken = v.body.token;
    await authApi(vendorToken).post("/vendors/apply").send({
      businessName: "E2E Wedding Studio",
      category: "MUA",
      region: "Purwokerto",
      priceMin: 500000,
      priceMax: 2000000,
      description: "Studio E2E untuk demo",
    }).expect(201);

    // Admin (register + promote)
    const a = await api.post("/auth/register/consumer").send({
      email: `vendor-e2e-a${TS}@test.com`, password: "password123", fullName: "E2E Admin",
    });
    await db.account.update({
      where: { email: `vendor-e2e-a${TS}@test.com` }, data: { role: "ADMIN" },
    });
    const aLogin = await api.post("/auth/login").send({
      email: `vendor-e2e-a${TS}@test.com`, password: "password123",
    });
    adminToken = aLogin.body.token;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("apply vendor → vendor dibuat (kybStatus UNSUBMITTED)", async () => {
    const vendor = await db.vendor.findFirst({ where: { account: { email: V_EMAIL } } });
    expect(vendor).toBeTruthy();
    expect(vendor.kybStatus).toBe("UNSUBMITTED");
    vendorId = vendor.id;
  });

  (supabaseReady ? describe : describe.skip)(
    "KYB upload (butuh Supabase storage)",
    () => {
      it("submit KTP+NPWP → PENDING", async () => {
        const res = await authApi(vendorToken)
          .post("/vendors/me/verify")
          .attach("ktp", TINY_PNG, { filename: "ktp.png", contentType: "image/png" })
          .attach("npwp", TINY_PNG, { filename: "npwp.png", contentType: "image/png" })
          .expect(200);
        expect(res.body.status).toBe("PENDING");
      });

      it("admin approve → VERIFIED", async () => {
        await authApi(adminToken)
          .patch(`/vendors/${vendorId}`)
          .send({ kybStatus: "VERIFIED", kybVerified: true })
          .expect(200);
        const status = await authApi(vendorToken)
          .get("/vendors/me/verification").expect(200);
        expect(status.body.status).toBe("VERIFIED");
      });
    },
  );

  it("admin approve langsung (tanpa KYB storage) → VERIFIED", async () => {
    // Jalankan hanya jika storage kosong (KYB di-skip di atas).
    if (supabaseReady) return;
    await authApi(adminToken)
      .patch(`/vendors/${vendorId}`)
      .send({ kybStatus: "VERIFIED", kybVerified: true })
      .expect(200);
  });

  it("vendor tambah service → muncul di GET /vendors/:id", async () => {
    const svc = await authApi(vendorToken)
      .post("/vendors/me/services")
      .send({ name: "Paket E2E Demo", price: 1000000 })
      .expect(201);
    serviceId = svc.body.id;

    const pub = await api.get(`/vendors/${vendorId}`).expect(200);
    expect(pub.body.services.some((s) => s.id === serviceId)).toBe(true);
  });

  it("consumer booking + pay DP + confirm → item ON_PROGRESS", async () => {
    const proj = await authApi(consumerToken)
      .post("/budget/projects")
      .send({ totalBudget: 5000000, eventDate: "2027-01-15T00:00:00.000Z", location: "Purwokerto" })
      .expect(201);
    projectId = proj.body.id;

    const booking = await authApi(consumerToken)
      .post("/bookings")
      .send({ weddingProjectId: projectId, vendorServiceIds: [serviceId] })
      .expect(201);
    bookingId = booking.body.id;

    const pay = await authApi(consumerToken)
      .post(`/bookings/${bookingId}/payment`)
      .send({ paymentType: "DP_30" })
      .expect(201);
    paymentId = pay.body.id;
    await authApi(consumerToken).post(`/payments/${paymentId}/confirm`).expect(200);

    const detail = await authApi(consumerToken).get(`/bookings/${bookingId}`).expect(200);
    expect(detail.body.payment.paidAmount).toBe(300000);
    expect(detail.body.items[0].status).toBe("ON_PROGRESS");
    itemId = detail.body.items[0].id;
  });

  it("vendor complete (dari ON_PROGRESS hasil DP) → consumer lihat COMPLETED", async () => {
    // Catatan: DP confirm langsung set item ON_PROGRESS, jadi accept tidak
    // diperlukan di jalur ini (accept hanya untuk item PENDING). Complete
    // valid dari ON_PROGRESS.
    await authApi(vendorToken).post(`/vendor/orders/${itemId}/complete`).expect(200);
    const detail = await authApi(consumerToken).get(`/bookings/${bookingId}`).expect(200);
    expect(detail.body.items[0].status).toBe("COMPLETED");
  });

  it("vendor accept path: item PENDING (belum bayar) → accept → ON_PROGRESS", async () => {
    const svc3 = await authApi(vendorToken)
      .post("/vendors/me/services")
      .send({ name: "Paket Accept Demo", price: 400000 })
      .expect(201);
    const b3 = await authApi(consumerToken)
      .post("/bookings")
      .send({ weddingProjectId: projectId, vendorServiceIds: [svc3.body.id] })
      .expect(201);
    const d3 = await authApi(consumerToken).get(`/bookings/${b3.body.id}`).expect(200);
    expect(d3.body.items[0].status).toBe("PENDING");

    await authApi(vendorToken).post(`/vendor/orders/${d3.body.items[0].id}/accept`).expect(200);
    const after = await authApi(consumerToken).get(`/bookings/${b3.body.id}`).expect(200);
    expect(after.body.items[0].status).toBe("ON_PROGRESS");
  });

  it("vendor reject path: item PENDING → reject → consumer lihat CANCELLED", async () => {
    // Booking tanpa pembayaran → item tetap PENDING → bisa di-reject vendor.
    const svc2 = await authApi(vendorToken)
      .post("/vendors/me/services")
      .send({ name: "Paket Reject Demo", price: 500000 })
      .expect(201);
    const b2 = await authApi(consumerToken)
      .post("/bookings")
      .send({ weddingProjectId: projectId, vendorServiceIds: [svc2.body.id] })
      .expect(201);

    const detail2 = await authApi(consumerToken).get(`/bookings/${b2.body.id}`).expect(200);
    const item2 = detail2.body.items[0];
    expect(item2.status).toBe("PENDING");

    await authApi(vendorToken).post(`/vendor/orders/${item2.id}/reject`).expect(200);

    const after = await authApi(consumerToken).get(`/bookings/${b2.body.id}`).expect(200);
    expect(after.body.items[0].status).toBe("CANCELLED");
  });
});
