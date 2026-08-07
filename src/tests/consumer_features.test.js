/**
 * Consumer planning features API tests — guests, moodboard, notifications, support.
 */

import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { api, db, registerConsumer, authApi, resetDB } from "./helpers.js";

beforeEach(async () => {
  await resetDB();
});

afterAll(async () => {
  await db.$disconnect();
});

// Helper: register a consumer and create a wedding project (needed for guests/moodboard)
async function registerConsumerWithProject() {
  const { token, account } = await registerConsumer();
  const project = await db.weddingProject.create({
    data: { accountId: account.id, totalBudget: 50000000 },
  });
  return { token, account, project };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /guests — guest list", () => {
  it("returns empty list when no guests", async () => {
    const { token } = await registerConsumerWithProject();
    const res = await authApi(token).get("/guests").expect(200);
    expect(res.body).toEqual([]);
  });

  it("returns 400 when user has no wedding project", async () => {
    const { token } = await registerConsumer();
    await authApi(token).get("/guests").expect(400);
  });

  it("returns 401 without token", async () => {
    await api.get("/guests").expect(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /guests — create guest", () => {
  it("creates a guest with default RSVP MENUNGGU", async () => {
    const { token } = await registerConsumerWithProject();
    const res = await authApi(token)
      .post("/guests")
      .send({ name: "Budi Santoso", phone: "0812-3456-7891" })
      .expect(201);
    expect(res.body.name).toBe("Budi Santoso");
    expect(res.body.rsvpStatus).toBe("MENUNGGU");
  });

  it("creates a guest with explicit RSVP", async () => {
    const { token } = await registerConsumerWithProject();
    const res = await authApi(token)
      .post("/guests")
      .send({ name: "Siti Rahma", rsvpStatus: "HADIR" })
      .expect(201);
    expect(res.body.rsvpStatus).toBe("HADIR");
  });

  it("rejects invalid RSVP status", async () => {
    const { token } = await registerConsumerWithProject();
    await authApi(token)
      .post("/guests")
      .send({ name: "Test", rsvpStatus: "BOGUS" })
      .expect(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /guests/:id — update guest", () => {
  it("updates RSVP status", async () => {
    const { token } = await registerConsumerWithProject();
    const created = await authApi(token)
      .post("/guests")
      .send({ name: "Budi", rsvpStatus: "MENUNGGU" })
      .expect(201);

    const res = await authApi(token)
      .patch(`/guests/${created.body.id}`)
      .send({ rsvpStatus: "HADIR" })
      .expect(200);
    expect(res.body.rsvpStatus).toBe("HADIR");
  });

  it("returns 403 for another user's guest", async () => {
    const { token: t1 } = await registerConsumerWithProject();
    const { token: t2 } = await registerConsumerWithProject();
    const created = await authApi(t1)
      .post("/guests")
      .send({ name: "Mine" })
      .expect(201);

    await authApi(t2)
      .patch(`/guests/${created.body.id}`)
      .send({ rsvpStatus: "HADIR" })
      .expect(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /guests/:id — delete guest", () => {
  it("deletes a guest", async () => {
    const { token } = await registerConsumerWithProject();
    const created = await authApi(token)
      .post("/guests")
      .send({ name: "To Delete" })
      .expect(201);

    await authApi(token).delete(`/guests/${created.body.id}`).expect(200);
    const list = await authApi(token).get("/guests").expect(200);
    expect(list.body).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("/moodboard — moodboard items", () => {
  it("lists empty moodboard", async () => {
    const { token } = await registerConsumerWithProject();
    const res = await authApi(token).get("/moodboard").expect(200);
    expect(res.body).toEqual([]);
  });

  it("creates and lists a moodboard item", async () => {
    const { token } = await registerConsumerWithProject();
    await authApi(token)
      .post("/moodboard")
      .send({
        title: "Rustic Wedding Decor",
        category: "Dekorasi",
        imageUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400",
      })
      .expect(201);

    const res = await authApi(token).get("/moodboard").expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Rustic Wedding Decor");
    expect(res.body[0].category).toBe("Dekorasi");
  });

  it("deletes a moodboard item", async () => {
    const { token } = await registerConsumerWithProject();
    const created = await authApi(token)
      .post("/moodboard")
      .send({
        title: "To Remove",
        category: "MUA",
        imageUrl: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400",
      })
      .expect(201);

    await authApi(token).delete(`/moodboard/${created.body.id}`).expect(200);
    const res = await authApi(token).get("/moodboard").expect(200);
    expect(res.body).toHaveLength(0);
  });

  it("rejects invalid image URL", async () => {
    const { token } = await registerConsumerWithProject();
    await authApi(token)
      .post("/moodboard")
      .send({ title: "Bad", category: "MUA", imageUrl: "not-a-url" })
      .expect(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /notifications — derived notifications", () => {
  it("returns empty list for fresh consumer", async () => {
    const { token } = await registerConsumerWithProject();
    const res = await authApi(token).get("/notifications").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 401 without token", async () => {
    await api.get("/notifications").expect(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("/support/tickets — support tickets", () => {
  it("creates a support ticket", async () => {
    const { token } = await registerConsumerWithProject();
    const res = await authApi(token)
      .post("/support/tickets")
      .send({ subject: "Masalah pembayaran QRIS", message: "Pembayaran saya gagal." })
      .expect(201);
    expect(res.body.subject).toBe("Masalah pembayaran QRIS");
    expect(res.body.status).toBe("OPEN");
  });

  it("lists support tickets", async () => {
    const { token } = await registerConsumerWithProject();
    await authApi(token)
      .post("/support/tickets")
      .send({ subject: "A", message: "M1" })
      .expect(201);
    await authApi(token)
      .post("/support/tickets")
      .send({ subject: "B", message: "M2" })
      .expect(201);

    const res = await authApi(token).get("/support/tickets").expect(200);
    expect(res.body).toHaveLength(2);
  });

  it("rejects empty message", async () => {
    const { token } = await registerConsumerWithProject();
    await authApi(token)
      .post("/support/tickets")
      .send({ subject: "A", message: "" })
      .expect(400);
  });
});
