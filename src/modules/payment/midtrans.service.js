// Midtrans Snap integration — Core API via plain fetch (no SDK needed).
// Docs: https://docs.midtrans.com/ref/snap-transactions
//
// Sandbox base: https://app.sandbox.midtrans.com
// Production base: https://app.midtrans.com
//
// Security notes:
//  - The server key is used ONLY server-side (Basic auth). Never expose it
//    to the mobile app — the client only gets the Snap token / redirect URL.
//  - Webhook signature verification lives in payment.controller.js.

import { env } from "../../config/env.js";

const SNAP_BASE_URLS = {
    sandbox: "https://app.sandbox.midtrans.com",
    production: "https://app.midtrans.com",
};

function snapBaseUrl() {
    if (env.midtransIsProduction) return SNAP_BASE_URLS.production;
    return SNAP_BASE_URLS.sandbox;
}

function authHeader() {
    // Basic auth with empty password — Midtrans expects "serverKey:"
    return `Basic ${Buffer.from(`${env.midtransServerKey}:`).toString("base64")}`;
}

export class MidtransError extends Error {
    constructor(message, { status, body } = {}) {
        super(message);
        this.name = "MidtransError";
        this.status = status;
        this.body = body;
    }
}

// Build a Midtrans order_id from a booking id. Midtrans caps order_id at 50
// chars, so we keep it short: `SIMPUL-<bookingId>`.
//
// ponytail: Midtrans REJECTS an order_id that was already used. One booking
// can legitimately create several Snap transactions (expired → retry, or
// DP → pelunasan), so callers pass a unique suffix per attempt. The webhook
// parser only looks at the first segment, so uniqueness costs nothing.
export function buildOrderId(bookingId, suffix = "") {
  const base = `SIMPUL-${bookingId}`;
  if (!suffix) return base;
  // Booking ids are cuid() (25 chars) — one short suffix stays under 50.
  return `${base}-${suffix}`;
}

// Extract the booking id from a Midtrans order_id. Expected format:
// `SIMPUL-<bookingId>` optionally followed by `-<attempt suffix>`.
// Booking ids are cuid() values (no dashes), so parsing only the first
// segment is safe regardless of the suffix.
export function extractBookingId(orderId) {
  if (typeof orderId !== "string") return null;
  const parts = orderId.split("-");
  if (parts.length < 2 || parts[0] !== "SIMPUL") return null;
  const bookingId = parts[1];
  return bookingId && bookingId.length > 0 ? bookingId : null;
}

// Create a Snap transaction. Returns { token, redirectUrl }.
// https://docs.midtrans.com/reference/snap-transactions
export async function createSnapTransaction({ orderId, grossAmount, customer = {} }) {
    if (!env.midtransServerKey) {
        throw new MidtransError("MIDTRANS_SERVER_KEY is not configured");
    }

    const payload = {
        transaction_details: {
            order_id: orderId,
            gross_amount: grossAmount,
        },
        credit_card: {
            secure: true,
        },
        customer_details: {
            first_name: customer.firstName ?? "",
            email: customer.email ?? "",
        },
    };

    let res;
    try {
        res = await fetch(`${snapBaseUrl()}/snap/v1/transactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: authHeader(),
            },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        throw new MidtransError(`Midtrans request failed: ${err.message}`, { status: 0 });
    }

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new MidtransError(
            `Midtrans Snap error (${res.status}): ${body.error_messages?.join(", ") || JSON.stringify(body)}`,
            { status: res.status, body }
        );
    }

    if (!body.token || !body.redirect_url) {
        throw new MidtransError("Midtrans Snap response missing token/redirect_url", {
            status: res.status,
            body,
        });
    }

    return {
        token: body.token,
        redirectUrl: body.redirect_url,
    };
}

// Get the current transaction status from Midtrans (server-side verification).
// https://docs.midtrans.com/reference/get-transaction-status
export async function getTransactionStatus(orderId) {
    if (!env.midtransServerKey) {
        throw new MidtransError("MIDTRANS_SERVER_KEY is not configured");
    }

    let res;
    try {
        res = await fetch(`${snapBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: authHeader(),
            },
        });
    } catch (err) {
        throw new MidtransError(`Midtrans status request failed: ${err.message}`, { status: 0 });
    }

    if (res.status === 404) return null; // transaction not found yet
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new MidtransError(
            `Midtrans status error (${res.status}): ${JSON.stringify(body)}`,
            { status: res.status, body }
        );
    }

    // Treat an empty/unknown body as "not found" so callers don't act on a
    // transaction that Midtrans doesn't know about.
    if (!body || typeof body !== "object" || !body.transaction_status) {
        return null;
    }

    return body;
}
