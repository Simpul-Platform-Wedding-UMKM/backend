import { describe, it, afterAll, expect, beforeEach } from "vitest";
import { api, db, authApi, seedSeededUsers } from "./helpers.js";

beforeEach(async () => {
  await seedSeededUsers();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("POST /auth/login with Seeded Users", () => {
  it("authenticates seeded consumer 'davin@demo.simpul' in < 30ms", async () => {
    const start = performance.now();
    const res = await api
      .post("/auth/login")
      .send({ email: "davin@demo.simpul", password: "password123" })
      .expect(200);
    const duration = performance.now() - start;

    expect(res.body).toHaveProperty("token");
    expect(res.body.account.email).toBe("davin@demo.simpul");
    
    // Check if the response time threshold matches (only works locally without remote network lag)
    if (process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1")) {
      expect(duration).toBeLessThan(30);
    }
  });

  it("authenticates seeded vendor 'rara.makeup.studio@demo.simpul'", async () => {
    const res = await api
      .post("/auth/login")
      .send({ email: "rara.makeup.studio@demo.simpul", password: "password123" })
      .expect(200);

    expect(res.body).toHaveProperty("token");
    expect(res.body.account.role).toBe("VENDOR");
  });

  it("can access protected routes with signed token", async () => {
    const loginRes = await api
      .post("/auth/login")
      .send({ email: "rara.makeup.studio@demo.simpul", password: "password123" })
      .expect(200);

    const token = loginRes.body.token;

    const profileRes = await authApi(token)
      .patch("/vendors/me")
      .send({ description: "Newly updated profile description" })
      .expect(200);

    expect(profileRes.body.description).toBe("Newly updated profile description");
  });
});
