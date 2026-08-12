import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// The payment modules read process.env at import time (config/env.js), so we
// must stub env vars BEFORE importing them. We use vi.resetModules() +
// dynamic import inside beforeEach to get a fresh module graph per test.
async function loadPaymentModules() {
  const midtrans = await import("../modules/payment/midtrans.service.js");
  const controller = await import("../modules/payment/payment.controller.js");
  return { ...midtrans, verifyMidtransSignature: controller.verifyMidtransSignature };
}

let payment;

beforeEach(async () => {
  vi.stubEnv("JWT_SECRET", "test-secret");
  vi.stubEnv("MIDTRANS_SERVER_KEY", "SB-Mid-server-test");
  vi.stubEnv("MIDTRANS_IS_PRODUCTION", "false");
  vi.resetModules();
  payment = await loadPaymentModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildOrderId / extractBookingId", () => {
  it("round-trips a booking id through order id", () => {
    const bookingId = "clxabc123";
    const orderId = payment.buildOrderId(bookingId);
    expect(orderId.startsWith(`SIMPUL-${bookingId}`)).toBe(true);
    expect(payment.extractBookingId(orderId)).toBe(bookingId);
  });

  it("returns null for malformed order ids", () => {
    expect(payment.extractBookingId("SIMPUL-")).toBeNull();
    expect(payment.extractBookingId("")).toBeNull();
    expect(payment.extractBookingId(null)).toBeNull();
    expect(payment.extractBookingId("other-id")).toBeNull();
  });

  it("stays within Midtrans 50-char order_id limit", () => {
    const longBookingId = "cmsqbc3fe0001lfvpu2ufavss";
    expect(payment.buildOrderId(longBookingId).length).toBeLessThanOrEqual(50);
  });
});

describe("verifyMidtransSignature", () => {
  it("accepts a valid signature", () => {
    const order_id = "SIMPUL-abc-123";
    const status_code = "200";
    const gross_amount = "10000";
    const signature_key = crypto
      .createHash("sha512")
      .update(`${order_id}${status_code}${gross_amount}SB-Mid-server-test`)
      .digest("hex");
    expect(
      payment.verifyMidtransSignature({ order_id, status_code, gross_amount, signature_key })
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(
      payment.verifyMidtransSignature({
        order_id: "SIMPUL-abc-123",
        status_code: "200",
        gross_amount: "10000",
        signature_key: "deadbeef",
      })
    ).toBe(false);
  });
});

describe("createSnapTransaction", () => {
  it("throws MidtransError when server key is missing", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "");
    vi.resetModules();
    const fresh = await import("../modules/payment/midtrans.service.js");
    await expect(fresh.createSnapTransaction({ orderId: "x", grossAmount: 1000 })).rejects.toThrow(
      "MIDTRANS_SERVER_KEY is not configured"
    );
  });

  it("calls the sandbox Snap endpoint and returns token + redirectUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        token: "snap-token",
        redirect_url:
          "https://app.sandbox.midtrans.com/snap/v4/transactions/x",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await payment.createSnapTransaction({
      orderId: "SIMPUL-clxabc123",
      grossAmount: 50000,
    });
    expect(result.token).toBe("snap-token");
    expect(result.redirectUrl).toContain("app.sandbox.midtrans.com");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/snap/v1/transactions");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const body = JSON.parse(init.body);
    expect(body.transaction_details.order_id).toBe("SIMPUL-clxabc123");
    expect(body.transaction_details.gross_amount).toBe(50000);
  });

  it("throws MidtransError with API error message on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error_messages: ["Access denied"] }),
      })
    );
    await expect(
      payment.createSnapTransaction({ orderId: "x", grossAmount: 1 })
    ).rejects.toThrow(/401/);
  });

  it("throws MidtransError when response is missing token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
    );
    await expect(
      payment.createSnapTransaction({ orderId: "x", grossAmount: 1 })
    ).rejects.toThrow(/missing token/);
  });
});

describe("getTransactionStatus", () => {
  it("returns null on 404 (transaction not found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    );
    await expect(payment.getTransactionStatus("SIMPUL-abc")).resolves.toBeNull();
  });

  it("returns null when body has no transaction_status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ foo: "bar" }) })
    );
    await expect(payment.getTransactionStatus("SIMPUL-abc")).resolves.toBeNull();
  });

  it("returns the transaction status on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          transaction_status: "settlement",
          transaction_id: "txn-123",
        }),
      })
    );
    const result = await payment.getTransactionStatus("SIMPUL-abc");
    expect(result.transaction_status).toBe("settlement");
    expect(result.transaction_id).toBe("txn-123");
  });
});
