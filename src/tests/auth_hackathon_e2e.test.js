/**
 * Smoke E2E Auth — hackathon.
 *
 * Verifikasi loop auth lengkap TANPA truncate DB dan TANPA ALLOW_DB_RESET:
 *   register (email unik) → login → me → forgot-password → reset-password
 *   → login password baru → change-password → login password terbaru.
 *
 * Semua user disposable (email unik per run). Tidak menyentuh data lain.
 *
 * Jalankan: `npm run test -- src/tests/auth_hackathon_e2e.test.js`
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api } from "./helpers.js";
import { prisma } from "../lib/prisma.js";

const EMAIL = `auth-e2e-${Date.now()}@test.com`;
const PASS = "password123";

describe("Auth smoke E2E (disposable user, no DB reset)", () => {
  let token;
  let account;
  let resetToken;

  afterAll(async () => {
    // Bersihkan user test — hanya akun yang kita buat, bukan truncate.
    const acc = await prisma.account.findUnique({ where: { email: EMAIL } });
    if (acc) {
      await prisma.passwordResetToken.deleteMany({ where: { accountId: acc.id } });
      await prisma.account.delete({ where: { id: acc.id } });
    }
    await prisma.$disconnect();
  });

  it("register consumer → 201 + token", async () => {
    const res = await api.post("/auth/register/consumer").send({
      email: EMAIL,
      password: PASS,
      fullName: "Auth E2E",
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.account.email).toBe(EMAIL);
    token = res.body.token;
    account = res.body.account;
  });

  it("duplicate email → 409", async () => {
    const res = await api.post("/auth/register/consumer").send({
      email: EMAIL,
      password: PASS,
      fullName: "Auth E2E",
    });
    expect(res.status).toBe(409);
  });

  it("login sukses → 200 + token", async () => {
    const res = await api.post("/auth/login").send({ email: EMAIL, password: PASS });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    token = res.body.token;
  });

  it("login password salah → 401", async () => {
    const res = await api.post("/auth/login").send({ email: EMAIL, password: "wrongpass1" });
    expect(res.status).toBe(401);
  });

  it("login email tidak terdaftar → 401", async () => {
    const res = await api.post("/auth/login").send({
      email: `nonexistent-${Date.now()}@test.com`,
      password: PASS,
    });
    expect(res.status).toBe(401);
  });

  it("GET /auth/me dengan token → account", async () => {
    const res = await api.get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.account.email).toBe(EMAIL);
  });

  it("GET /auth/me tanpa token → 401", async () => {
    const res = await api.get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("forgot-password → 200 + token (dev mode)", async () => {
    const res = await api.post("/auth/forgot-password").send({ email: EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    resetToken = res.body.token;
  });

  it("forgot-password email tak terdaftar → 200 tanpa token (anti-enumeration)", async () => {
    const res = await api.post("/auth/forgot-password").send({
      email: `ghost-${Date.now()}@test.com`,
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
  });

  it("reset-password dengan token → sukses", async () => {
    const res = await api.post("/auth/reset-password").send({
      token: resetToken,
      newPassword: "newpassword456",
    });
    expect(res.status).toBe(200);
  });

  it("login dengan password baru → 200", async () => {
    const res = await api.post("/auth/login").send({ email: EMAIL, password: "newpassword456" });
    expect(res.status).toBe(200);
    token = res.body.token;
  });

  it("change-password (old benar) → sukses", async () => {
    const res = await api
      .patch("/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "newpassword456", newPassword: "finalpass789" });
    expect(res.status).toBe(200);
  });

  it("login dengan password terbaru → 200", async () => {
    const res = await api.post("/auth/login").send({ email: EMAIL, password: "finalpass789" });
    expect(res.status).toBe(200);
  });

  it("login dengan password lama → 401 (password sudah diganti)", async () => {
    const res = await api.post("/auth/login").send({ email: EMAIL, password: "newpassword456" });
    expect(res.status).toBe(401);
  });
});
