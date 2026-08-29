/**
 * Payoneer Checkout client (formerly Optile / Open Payment Gateway).
 *
 * Integration: Hosted Payment Page
 * Flow:
 *   1. Merchant backend POSTs a LIST request to the Payoneer API.
 *   2. Payoneer returns a hosted checkout page URL in `links.redirect`.
 *   3. Customer pays on the hosted page; the page returns to `callback.returnUrl`
 *      with a `longId` query parameter.
 *   4. Payoneer sends a server-to-server notification to `callback.notificationUrl`.
 *   5. The server verifies the list state via GET /api/lists/{longId} and only then
 *      activates the subscription.
 *
 * Raw card data is NEVER stored by this application — it is collected and handled
 * entirely by Payoneer's hosted page.
 */

const PAYONEER_SANDBOX_BASE = "https://api.sandbox.oscato.com";
const PAYONEER_LIVE_BASE = "https://api.live.oscato.com";
const LIST_PATH = "/api/lists";

export interface PayoneerCheckoutRequest {
  transactionId: string; // unique merchant reference, e.g. pl_<workspace>_<ts>
  amount: number;
  currency: string;
  reference: string;
  customerEmail: string;
  customerNumber: string;
  returnUrl: string;
  cancelUrl: string;
  notificationUrl: string;
}

export interface PayoneerCheckoutResult {
  ok: boolean;
  checkoutUrl?: string;
  longId?: string;
  error?: string;
}

export interface PayoneerListState {
  code: string; // "listed" | "charged" | "cancelled" | ...
  reason?: string;
}

export function payoneerConfigured(): boolean {
  return Boolean(
    process.env.PAYONEER_STORE_CODE &&
      process.env.PAYONEER_API_USERNAME &&
      process.env.PAYONEER_API_PASSWORD
  );
}

export function payoneerBaseUrl(): string {
  return process.env.PAYONEER_ENVIRONMENT === "live"
    ? PAYONEER_LIVE_BASE
    : PAYONEER_SANDBOX_BASE;
}

function authHeader(): string {
  const username = process.env.PAYONEER_API_USERNAME || "";
  const password = process.env.PAYONEER_API_PASSWORD || "";
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

const JSON_MEDIA_TYPE = "application/vnd.optile.payment.enterprise-v1-extensible+json";

/**
 * Creates a hosted checkout session (LIST request).
 * Returns the hosted payment page URL when successful.
 */
export async function createPayoneerCheckout(
  req: PayoneerCheckoutRequest
): Promise<PayoneerCheckoutResult> {
  const division = process.env.PAYONEER_STORE_CODE;
  if (!division) {
    return { ok: false, error: "Payout checkout is not configured." };
  }

  const body = {
    integration: "HOSTED",
    transactionId: req.transactionId,
    division,
    country: "US",
    customer: {
      number: req.customerNumber,
      email: req.customerEmail,
    },
    payment: {
      amount: req.amount,
      currency: req.currency,
      reference: req.reference,
    },
    callback: {
      returnUrl: req.returnUrl,
      cancelUrl: req.cancelUrl,
      notificationUrl: req.notificationUrl,
    },
  };

  try {
    const res = await fetch(`${payoneerBaseUrl()}${LIST_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": JSON_MEDIA_TYPE,
        Accept: JSON_MEDIA_TYPE,
        Authorization: authHeader(),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error:
          data?.resultInfo ||
          data?.error?.message ||
          `Payoneer checkout failed (HTTP ${res.status}).`,
      };
    }

    const redirectUrl = data?.links?.redirect;
    if (!redirectUrl) {
      return {
        ok: false,
        error: "Payoneer did not return a hosted checkout URL.",
      };
    }

    return {
      ok: true,
      checkoutUrl: redirectUrl,
      longId: data?.id || data?.links?.self?.split("/").pop(),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Payoneer checkout unavailable." };
  }
}

/**
 * Fetches the current state of a LIST resource to verify a payment server-side.
 * This is the trusted source of truth for webhook/return-URL verification.
 */
export async function getPayoneerListState(longId: string): Promise<PayoneerListState | null> {
  if (!longId) return null;
  try {
    const res = await fetch(`${payoneerBaseUrl()}${LIST_PATH}/${longId}`, {
      method: "GET",
      headers: {
        Accept: JSON_MEDIA_TYPE,
        Authorization: authHeader(),
      },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.status ? { code: data.status.code, reason: data.status.reason } : null;
  } catch {
    return null;
  }
}