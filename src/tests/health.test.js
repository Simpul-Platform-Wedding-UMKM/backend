import { describe, it, expect } from "vitest";
import { api } from "./helpers.js";
import { prisma } from "../lib/prisma.js";


describe("GET /health", () => {
  it("reports ok and db up when the database is reachable", async () => {
    const res = await api.get("/health").expect(200);
    expect(res.body).toMatchObject({ ok: true, db: "up" });
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("GET /status", () => {
  it("serves the brutalist status HTML page", async () => {
    const res = await api.get("/status").expect(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("SIMPUL // API STATUS");
  });
});
