/**
 * E2E: Loop KYB Consumer → Backend → Admin.
 *
 * Verifikasi kontrak lengkap:
 *   1. Vendor submit dokumen KYB (multipart) → PENDING + URL dokumen di Supabase
 *   2. Admin list & detail verifikasi (data real, bukan mock)
 *   3. Admin approve → vendor lihat VERIFIED
 *   4. Admin reject + reason → vendor lihat REJECTED
 *   5. Validasi negatif: submit tanpa file → 4xx, approve tanpa admin → 403
 *
 * Prasyarat:
 *   - Backend berjalan terhadap test DB (DATABASE_URL test)
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY terisi (upload dokumen real)
 *   - Jika Supabase kosong → test skip dengan pesan jelas (bukan silent pass)
 *
 * Jalankan: `npm run test -- src/tests/kyb_e2e.test.js`
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, authApi, db, resetDB } from "./helpers.js";
import { assertSafeE2EEnv } from "./safety.js";

// ── 1x1 transparent PNG fixture (valid image, ~70 bytes, bukan file besar) ──
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// ── Supabase config check — skip bila storage belum dikonfigurasi ────────────
// Upload dokumen KYB butuh SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY di backend.
// Kalau kosong, test yang butuh upload di-skip (bukan silent pass).
const supabaseConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const storageReady = supabaseConfigured
  ? describe
  : describe.skip; // eslint-disable-line no-unused-vars
const storageReason = supabaseConfigured
  ? ""
  : " (SKIP: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum terisi — upload dokumen tidak bisa diverifikasi)";

// ── Helper: create admin via register + role update (pola existing) ─────────
async function createAdmin() {
  const email = `admin-e2e-${Date.now()}@test.com`;
  const res = await api.post("/auth/register/consumer").send({
    email,
    password: "password123",
    fullName: "E2E Admin",
  });
  await db.account.update({ where: { email }, data: { role: "ADMIN" } });
  const login = await api.post("/auth/login").send({
    email,
    password: "password123",
  });
  return login.body.token;
}

// ── Helper: create vendor (consumer + apply) ─────────────────────────────────
async function createVendor(businessName) {
  const email = `vendor-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const consumer = await api.post("/auth/register/consumer").send({
    email,
    password: "password123",
    fullName: businessName,
  });
  const apply = await authApi(consumer.body.token)
    .post("/vendors/apply")
    .send({
      businessName,
      category: "MUA",
      region: "Purwokerto",
      priceMin: 500000,
      priceMax: 3000000,
    })
    .expect(201);
  return { token: consumer.body.token, vendor: apply.body };
}

describe("KYB Loop E2E — Consumer → Backend → Admin", () => {
  let adminToken;
  let vendorA; // approve path
  let vendorB; // reject path

  beforeAll(async () => {
    // SAFETY: tolak jalan kalau env mengarah ke production / tanpa ALLOW_DB_RESET.
    // resetDB() me-truncate SEMUA tabel — hanya boleh ke DB staging/test.
    const dbHost = assertSafeE2EEnv();
    console.log(`E2E running against ${dbHost}`);

    await resetDB();
    adminToken = await createAdmin();
    vendorA = await createVendor("E2E Vendor Approve");
    vendorB = await createVendor("E2E Vendor Reject");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("Submit dokumen KYB (vendor)", () => {
    it("menolak submit tanpa file KTP/NPWP (validasi negatif)", async () => {
      const res = await authApi(vendorA.token)
        .post("/vendors/me/verify")
        .expect(400);
      expect(res.body.error).toMatch(/KTP|NPWP/);
    });

    storageReady(
      `submit multipart KTP+NPWP → PENDING${storageReason}`,
      () => {
        it("vendor submit multipart KTP+NPWP → status PENDING", async () => {
          const res = await authApi(vendorA.token)
            .post("/vendors/me/verify")
            .attach("ktp", TINY_PNG, { filename: "ktp.png", contentType: "image/png" })
            .attach("npwp", TINY_PNG, { filename: "npwp.png", contentType: "image/png" })
            .expect(200);

          expect(res.body.status).toBe("PENDING");

          const status = await authApi(vendorA.token)
            .get("/vendors/me/verification")
            .expect(200);
          expect(status.body.status).toBe("PENDING");

          // kybVerified = sumber kebenaran DB (endpoint status tidak expose field ini)
          const vendor = await db.vendor.findUnique({
            where: { id: vendorA.vendor.id },
          });
          expect(vendor.kybVerified).toBe(false);
        });
      },
    );
  });

  storageReady(
    `Verifikasi dokumen di Supabase Storage${storageReason}`,
    () => {
      it("URL dokumen tersimpan di DB: http(s), mengandung /kyb/, bukan path lokal", async () => {
        const vendor = await db.vendor.findUnique({
          where: { id: vendorA.vendor.id },
        });

        for (const field of ["ktpUrl", "npwpUrl"]) {
          const url = vendor[field];
          expect(url, `${field} harus terisi`).toBeTruthy();
          expect(url).toMatch(/^https?:\/\//);
          expect(url).toContain("/kyb/");
          expect(url).not.toMatch(/\/data\/user\//);
          expect(url).not.toMatch(/^\/data\//);
        }
      });
    },
  );

  storageReady(
    `Admin list & detail verifikasi${storageReason}`,
    () => {
      it("list PENDING berisi vendor yang baru submit", async () => {
        const res = await authApi(adminToken)
          .get("/vendor-verifications?status=PENDING")
          .expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        const found = res.body.find(
          (v) => v.vendorId === vendorA.vendor.id,
        );
        expect(found).toBeTruthy();
        expect(found.status).toBe("PENDING");
      });

      it("detail verifikasi punya URL dokumen", async () => {
        const res = await authApi(adminToken)
          .get(`/vendor-verifications/${vendorA.vendor.id}`)
          .expect(200);
        expect(res.body.ktpUrl).toMatch(/^https?:\/\//);
        expect(res.body.npwpUrl).toMatch(/^https?:\/\//);
      });
    },
  );

  storageReady(
    `Approve path (admin → vendor)${storageReason}`,
    () => {
      it("admin approve → vendor lihat VERIFIED + kybVerified true", async () => {
        await authApi(adminToken)
          .patch(`/vendors/${vendorA.vendor.id}`)
          .send({ kybStatus: "VERIFIED", kybVerified: true })
          .expect(200);

        // Status lewat endpoint vendor (perspektif mobile)
        const status = await authApi(vendorA.token)
          .get("/vendors/me/verification")
          .expect(200);
        expect(status.body.status).toBe("VERIFIED");

        // kybVerified = sumber kebenaran DB (endpoint status tidak expose field ini)
        const vendor = await db.vendor.findUnique({
          where: { id: vendorA.vendor.id },
        });
        expect(vendor.kybVerified).toBe(true);
      });
    },
  );

  storageReady(
    `Reject path (admin → vendor)${storageReason}`,
    () => {
      it("admin reject + reason → vendor lihat REJECTED + reason", async () => {
        // Vendor B submit dulu
        await authApi(vendorB.token)
          .post("/vendors/me/verify")
          .attach("ktp", TINY_PNG, { filename: "ktp.png", contentType: "image/png" })
          .attach("npwp", TINY_PNG, { filename: "npwp.png", contentType: "image/png" })
          .expect(200);

        await authApi(adminToken)
          .patch(`/vendors/${vendorB.vendor.id}`)
          .send({
            kybStatus: "REJECTED",
            kybVerified: false,
            rejectedReason: "Foto KTP buram, tidak terbaca",
          })
          .expect(200);

        const status = await authApi(vendorB.token)
          .get("/vendors/me/verification")
          .expect(200);
        expect(status.body.status).toBe("REJECTED");
        expect(status.body.rejectedReason).toBe("Foto KTP buram, tidak terbaca");

        // kybVerified = sumber kebenaran DB
        const vendor = await db.vendor.findUnique({
          where: { id: vendorB.vendor.id },
        });
        expect(vendor.kybVerified).toBe(false);
      });
    },
  );

  describe("Validasi negatif auth", () => {
    it("approve tanpa token admin → 401", async () => {
      await api
        .patch(`/vendors/${vendorA.vendor.id}`)
        .send({ kybStatus: "VERIFIED", kybVerified: true })
        .expect(401);
    });

    it("approve pakai token vendor (bukan admin) → 403", async () => {
      await authApi(vendorA.token)
        .patch(`/vendors/${vendorA.vendor.id}`)
        .send({ kybStatus: "VERIFIED", kybVerified: true })
        .expect(403);
    });
  });
});
