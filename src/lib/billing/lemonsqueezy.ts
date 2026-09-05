// ============================================================================
// LEMON SQUEEZY — THE PAYMENT SIDE OF THE HOUSE
//
// Everything this codebase knows about Lemon Squeezy lives here: the API shape,
// the variant ids, the signature algorithm, and how their vocabulary maps onto
// ours. Nothing else imports `fetch` against their host, and nothing else parses
// one of their payloads. When their API changes, this is the only file to read.
//
// Written against the v1 JSON:API as of 2026-09-04, cross-checked against the
// official `@lemonsqueezy/lemonsqueezy.js` TypeScript sources so the request
// bodies are exactly what their own client sends. We do not install that SDK:
// it is a thin wrapper over `fetch`, it would pin us to its release cadence, and
// writing the four calls we need by hand is less code than the dependency.
//
// Two facts worth knowing before reading further.
//
// 1. Payment methods are a STORE setting, not a checkout parameter. There is no
//    field anywhere in the checkout API for "offer PayPal" or "offer Apple Pay" —
//    the buyer is shown whatever the store has switched on in the Lemon Squeezy
//    dashboard, filtered by what their country and device support. So the way to
//    "accept every payment method" is to enable them all in the dashboard and to
//    never send anything here that narrows them. `LEMON_PAYMENT_METHODS` below is
//    the honest list for the UI, not a configuration.
//
// 2. Lemon Squeezy is the merchant of record. They take the payment, they collect
//    and remit the sales tax, they hold the customer relationship for chargebacks,
//    and they settle to us in USD. That is why there is no card data, no tax logic
//    and no currency conversion anywhere in this repository — and must not be.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanTier } from "./plans";
import { PLAN_CATALOG, TOPUP_PACKS, isPlanTier } from "./plans";
// Type-only, so this file still pulls in nothing at runtime but `node:crypto`.
import type { SubscriptionStatusValue } from "./entitlements";
import { getFlags, managedKey } from "@/lib/admin/runtimeConfig";

/** Every Lemon Squeezy value can be set from the back office; the env is the fallback. */
function lemonEnv(name: string): string {
  return managedKey(name);
}

export const LEMON_API_BASE = "https://api.lemonsqueezy.com/v1";

/** The JSON:API content type Lemon Squeezy requires on both sides. */
const JSON_API = "application/vnd.api+json";

/** Their signed portal links die after 24 hours, so we refetch rather than store. */
export const PORTAL_URL_TTL_MS = 20 * 60 * 60_000;

export type BillingCycleValue = "monthly" | "yearly";

/**
 * What a buyer can be shown at checkout, for UI copy only.
 *
 * Availability is decided by Lemon Squeezy per buyer: their country, their
 * currency, their browser, and which methods the store has enabled. Wallets in
 * particular only appear on a supporting device — Apple Pay needs Safari or an
 * Apple device, Google Pay needs Chrome or Android. So the UI should present
 * this as "what the checkout can offer", never as a promise for every visitor.
 *
 * Sourced from Lemon Squeezy's own material on 2026-09-04 — their PayPal
 * Subscriptions page enumerates "credit cards, ACH, debit cards, Apple Pay,
 * WeChat Pay, AliPay, and more", and their payments page claims "dozens of
 * payment methods in 150+ countries". The canonical docs page
 * (docs.lemonsqueezy.com/help/checkout/payment-methods) refuses automated
 * fetches, so this list is deliberately the set they name themselves rather than
 * a guess at the long tail. `storeGoverned` is the reason that is safe: the store
 * dashboard decides what is actually offered, so a method missing from this array
 * is a gap in our copy, never a buyer who cannot pay.
 */
export const LEMON_PAYMENT_METHODS = [
  { id: "card", label: "Credit and debit cards", detail: "Visa, Mastercard, American Express, Discover, Diners Club, JCB, China UnionPay" },
  { id: "paypal", label: "PayPal", detail: "Including PayPal subscriptions for recurring plans" },
  { id: "apple_pay", label: "Apple Pay", detail: "On Safari and Apple devices" },
  { id: "google_pay", label: "Google Pay", detail: "On Chrome and Android devices" },
  { id: "bank_debit", label: "Bank debit", detail: "ACH and local equivalents, where the buyer's country supports it" },
  { id: "alipay", label: "Alipay", detail: "Where supported" },
  { id: "wechat_pay", label: "WeChat Pay", detail: "Where supported" },
] as const;

/**
 * True because payment methods are a store setting rather than a checkout field.
 *
 * The UI reads this to caption the list honestly: the methods a given buyer sees
 * are whatever the Lemon Squeezy store has switched on, narrowed by their country
 * and device. Nothing in this codebase can widen or narrow that.
 */
export const LEMON_METHODS_STORE_GOVERNED = true;


// ─────────────────────────────────────────────────────────────────────────────
// Configuration
//
// Read at call time, never at module load. A missing key must surface as a
// handled 503 from the checkout route, not as a crash during the build.
// ─────────────────────────────────────────────────────────────────────────────

export interface LemonConfig {
  apiKey: string;
  storeId: string;
  webhookSecret: string;
  testMode: boolean;
}

/** Test mode follows the API key: `test_` keys can only create test checkouts. */
export function lemonTestMode(): boolean {
  const key = lemonEnv("LEMONSQUEEZY_API_KEY");
  if (key.startsWith("test_")) return true;
  return lemonEnv("LEMONSQUEEZY_TEST_MODE") === "true";
}

export function readLemonConfig(): LemonConfig | null {
  const apiKey = lemonEnv("LEMONSQUEEZY_API_KEY");
  const storeId = lemonEnv("LEMONSQUEEZY_STORE_ID");
  const webhookSecret = lemonEnv("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!apiKey || !storeId) return null;
  return { apiKey, storeId, webhookSecret, testMode: lemonTestMode() };
}

/** True when a real checkout can be created. */
export function lemonConfigured(): boolean {
  return readLemonConfig() !== null;
}

/** True when an incoming webhook can be verified. Checked before every handler. */
export function lemonWebhookConfigured(): boolean {
  return lemonEnv("LEMONSQUEEZY_WEBHOOK_SECRET").length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variants
//
// A variant is one buyable thing in the Lemon Squeezy catalogue: "Go, monthly"
// is a variant, "Go, yearly" is another. Their numeric ids come from the
// dashboard and differ between the test and live stores, so they are environment
// configuration — never literals in the source.
//
// The mapping is needed in both directions. Forward, to send a buyer to the
// right checkout. Backward, because a webhook tells us a variant id and we have
// to decide which plan that is. The reverse lookup is the safety net for the
// case that matters most: a subscription created or upgraded from inside Lemon
// Squeezy's own portal, where our `custom_data` was never attached.
// ─────────────────────────────────────────────────────────────────────────────

export type PurchaseKind = "subscription" | "trial" | "topup";

/**
 * A configured variant value, in whichever of the three accepted forms it was given.
 *
 * There are two different ids for the same variant in Lemon Squeezy and the
 * dashboard hands out the wrong one for our purposes. What you can copy off a
 * product page is the "buy link" — `https://store.lemonsqueezy.com/buy/<uuid>` —
 * and that uuid is the variant's `slug`, not its id. The id is numeric, it is what
 * `POST /v1/checkouts` wants, and it is the only thing a webhook ever tells us.
 *
 * Rather than make whoever sets this up go hunting for the numeric id, all three
 * forms are accepted here and reconciled at runtime: paste the number, paste the
 * uuid, or paste the whole buy link with its query string still attached.
 */
export interface VariantIdentity {
  /** Exactly as configured, for error messages and the admin screen. */
  raw: string;
  /** The numeric id, when the configured value is one. */
  numeric: string | null;
  /** The buy-link uuid — the variant's `slug` — when the value is or contains one. */
  uuid: string | null;
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function parseVariantId(value: string | null | undefined): VariantIdentity {
  const raw = (value ?? "").trim();
  if (!raw) return { raw: "", numeric: null, uuid: null };

  if (/^\d+$/.test(raw)) return { raw, numeric: raw, uuid: null };

  // A pasted buy link, with or without `?embed=1&media=0`, and either path shape
  // Lemon Squeezy serves: `/buy/<uuid>` and `/checkout/buy/<uuid>`.
  const found = UUID_PATTERN.exec(raw);
  if (found) return { raw, numeric: null, uuid: found[0].toLowerCase() };

  return { raw, numeric: null, uuid: null };
}

export interface VariantRef {
  /** The configured value, untouched. */
  variantId: string;
  /** The numeric id, either configured directly or resolved from the uuid. */
  numeric: string | null;
  uuid: string | null;
  kind: PurchaseKind;
  /** The plan the purchase grants. Top-ups carry no plan. */
  plan?: PlanTier;
  cycle?: BillingCycleValue;
  /** The `TOPUP_PACKS` id, for top-up variants. */
  packId?: string;
  envVar: string;
}

/**
 * uuid → numeric id, learned from the API and remembered for the life of the
 * process.
 *
 * A serverless instance handles many requests, so one lookup covers all of them,
 * and the mapping cannot change: a variant's slug and id are both fixed for its
 * lifetime. Cleared only by a deploy, which is also when the configuration could
 * have changed.
 */
const numericByUuid = new Map<string, string>();

function envVarForPlan(plan: PlanTier, cycle: BillingCycleValue): string {
  return `LEMONSQUEEZY_VARIANT_${plan}_${cycle.toUpperCase()}`;
}

function envVarForPack(packId: string): string {
  return `LEMONSQUEEZY_VARIANT_${packId.toUpperCase()}`;
}

/**
 * The variant behind the 3-day trial.
 *
 * HOW THIS VARIANT MUST BE SET UP IN THE DASHBOARD. The trial is a SINGLE PAYMENT
 * product priced at $1 that buys three days of full access — not a subscription
 * with a trial period. That is deliberate, and it is what makes "cancel any time,
 * remove your card any time" true without qualification: there is nothing to
 * cancel, because nothing recurs. Three days after the payment the account drops
 * to Free on its own and the buyer chooses a plan, or does not.
 *
 * So in Lemon Squeezy the variant needs:
 *
 *   - a SINGLE PAYMENT product at $1.00 — no recurring interval, no trial period,
 *     no setup fee;
 *   - the same store as every other variant, so one webhook signing secret covers
 *     all of them.
 *
 * Getting the shape wrong is caught rather than silently mispriced. The webhook
 * grants the trial from `order_created`, and only when the order's own total is
 * within a cent or two of $1 — so a variant accidentally priced at $19, or a
 * tampered checkout claiming to be the trial, grants nothing and is logged.
 */
const TRIAL_ENV_VAR = "LEMONSQUEEZY_VARIANT_TRIAL";

/** The price the trial must actually charge, in USD cents. */
export const TRIAL_PRICE_CENTS = 100;

/** Every variant this product sells, whether or not its id is configured yet. */
export function variantCatalog(): VariantRef[] {
  const refs: VariantRef[] = [];

  const push = (
    configured: string,
    rest: Omit<VariantRef, "variantId" | "numeric" | "uuid">
  ): void => {
    const identity = parseVariantId(configured);
    refs.push({
      variantId: identity.raw,
      // A uuid resolved earlier in this process counts as configured numerically
      // from here on, which is what lets the webhook name the plan behind a
      // payment when all we were ever given was a buy link.
      numeric: identity.numeric ?? (identity.uuid ? numericByUuid.get(identity.uuid) ?? null : null),
      uuid: identity.uuid,
      ...rest,
    });
  };

  push(lemonEnv(TRIAL_ENV_VAR), { kind: "trial", plan: "TRIAL", envVar: TRIAL_ENV_VAR });

  for (const plan of ["GO", "PRO", "AGENCY"] as PlanTier[]) {
    for (const cycle of ["monthly", "yearly"] as BillingCycleValue[]) {
      const envVar = envVarForPlan(plan, cycle);
      push(lemonEnv(envVar), { kind: "subscription", plan, cycle, envVar });
    }
  }

  for (const pack of TOPUP_PACKS) {
    const envVar = envVarForPack(pack.id);
    push(lemonEnv(envVar), { kind: "topup", packId: pack.id, envVar });
  }

  return refs;
}

/** The checkout variant for a paid plan, or null when it has not been set up. */
export function variantForPlan(plan: PlanTier, cycle: BillingCycleValue): string | null {
  if (plan === "FREE") return null;
  if (plan === "TRIAL") return variantForTrial();
  return lemonEnv(envVarForPlan(plan, cycle)) || null;
}

export function variantForTrial(): string | null {
  return lemonEnv(TRIAL_ENV_VAR) || null;
}

export function variantForTopUp(packId: string): string | null {
  if (!TOPUP_PACKS.some((pack) => pack.id === packId)) return null;
  return lemonEnv(envVarForPack(packId)) || null;
}

/**
 * What a variant id means. Used by the webhook to name the plan a payment bought.
 * Returns null for an id we do not sell — a store selling something else alongside
 * this product must not silently upgrade an account.
 *
 * Matches on the numeric id, on the uuid, and on the raw configured string, so it
 * works whichever of the three forms was pasted into the setting. When the config
 * holds only uuids the numeric match depends on `ensureVariantResolution()` having
 * run first; the webhook route awaits it before reading any event.
 */
export function resolveVariant(variantId: string | number | null | undefined): VariantRef | null {
  if (variantId === null || variantId === undefined) return null;
  const wanted = String(variantId).trim().toLowerCase();
  if (!wanted) return null;
  return (
    variantCatalog().find(
      (ref) =>
        (ref.numeric !== null && ref.numeric === wanted) ||
        (ref.uuid !== null && ref.uuid === wanted) ||
        (ref.variantId !== "" && ref.variantId.toLowerCase() === wanted)
    ) ?? null
  );
}

/** Which variant ids are still unset. Surfaced on the billing page in dev. */
export function missingVariantEnv(): string[] {
  return variantCatalog()
    .filter((ref) => !ref.variantId)
    .map((ref) => ref.envVar);
}

/**
 * Which billing cycles can actually be bought right now.
 *
 * Split per cycle because the two are configured independently and a store may
 * genuinely only sell one of them. This used to be a single "are all six variants
 * set?" boolean, which meant that a store selling three monthly plans and no
 * yearly ones could sell nothing at all: every checkout 503'd and every button
 * rendered disabled. A cycle nobody has set up is now simply not offered, and the
 * one that is set up works.
 */
export function cyclesPurchasable(): Record<BillingCycleValue, boolean> {
  if (!lemonConfigured()) return { monthly: false, yearly: false };
  const paid = ["GO", "PRO", "AGENCY"] as PlanTier[];
  return {
    monthly: paid.every((plan) => variantForPlan(plan, "monthly")),
    yearly: paid.every((plan) => variantForPlan(plan, "yearly")),
  };
}

/**
 * True when the three paid plans are buyable — on the given cycle, or on either
 * one when no cycle is named.
 */
export function paidPlansPurchasable(cycle?: BillingCycleValue): boolean {
  const cycles = cyclesPurchasable();
  if (cycle) return cycles[cycle];
  return cycles.monthly || cycles.yearly;
}

export function trialPurchasable(): boolean {
  return getFlags().trialEnabled && lemonConfigured() && variantForTrial() !== null;
}

export function topUpsPurchasable(): boolean {
  return getFlags().topUpsEnabled && lemonConfigured() && TOPUP_PACKS.every((pack) => variantForTopUp(pack.id) !== null);
}

/**
 * Whether a TEST-MODE purchase is allowed to grant anything on a production
 * deployment.
 *
 * Off by default and it must stay that way: a test store's checkout takes fake
 * card numbers, so anyone who found the link could mint an Agency account. The
 * switch exists because there is one legitimate reason to want it — running the
 * real payment flow end to end against the real deployment before the store goes
 * live — and the alternative is people testing with live cards.
 *
 * Read here for the billing UI's own use. The decision it feeds is made in
 * `entitlements.ts`, which keeps its own copy of this read rather than importing
 * one — that file is the authority on what a row is worth, and it must not depend
 * on the payment provider's module to answer.
 */
export function testEntitlementsAllowed(): boolean {
  return lemonEnv("LEMONSQUEEZY_ALLOW_TEST_ENTITLEMENTS").toLowerCase() === "true";
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport
//
// Every call returns a result object rather than throwing. A billing page that
// 500s because a payment provider was slow is worse than one that renders with a
// "could not reach the payment provider" notice, and a webhook that throws gets
// retried by Lemon Squeezy against state we may already have applied.
// ─────────────────────────────────────────────────────────────────────────────

export type LemonResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; detail?: string };

interface JsonApiError {
  detail?: string;
  title?: string;
  status?: string;
}

/** Their errors come back as `{errors: [{title, detail, status}]}`. */
function readApiError(body: unknown, status: number): { error: string; detail?: string } {
  const errors = (body as { errors?: JsonApiError[] })?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    return {
      error: first.title ?? `Lemon Squeezy returned ${status}`,
      detail: first.detail,
    };
  }
  return { error: `Lemon Squeezy returned ${status}` };
}

async function lemonFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = { method: "GET" }
): Promise<LemonResult<T>> {
  const config = readLemonConfig();
  if (!config) {
    return { ok: false, status: 503, error: "NOT_CONFIGURED", detail: "Lemon Squeezy credentials are not set." };
  }

  const url = path.startsWith("http") ? path : `${LEMON_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        Accept: JSON_API,
        "Content-Type": JSON_API,
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Prices, statuses and signed portal links must never come from a cache.
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const { error, detail } = readApiError(parsed, response.status);
      console.error("[lemonsqueezy]", init.method, path, response.status, detail ?? error);
      return { ok: false, status: response.status, error, detail };
    }

    return { ok: true, data: parsed as T };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error("[lemonsqueezy]", init.method, path, err);
    return {
      ok: false,
      status: aborted ? 504 : 502,
      error: aborted ? "TIMEOUT" : "NETWORK_ERROR",
      detail: err instanceof Error ? err.message : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** A JSON:API single-resource envelope. */
interface JsonApiResource<A> {
  data: { type: string; id: string; attributes: A };
}

/** A JSON:API collection, with the pagination block their list endpoints return. */
interface JsonApiCollection<A> {
  data?: Array<{ type: string; id: string; attributes: A }>;
  meta?: { page?: { currentPage?: number; lastPage?: number; perPage?: number; total?: number } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolving a buy link to a variant id
//
// The setting may hold a buy-link uuid instead of a numeric id (see
// `VariantIdentity`). Everything downstream — creating a checkout, and naming the
// plan behind an incoming webhook — needs the number. One listing call gets every
// variant in the account with its `slug`, which IS that uuid, so a single request
// reconciles the whole catalogue at once and is then cached for the process.
//
// It is best-effort on purpose. If the call fails, checkout falls back to the
// hosted buy link, which needs no numeric id at all; only the webhook's reverse
// lookup degrades, and there the amount charged is checked independently.
// ─────────────────────────────────────────────────────────────────────────────

interface VariantAttributes {
  slug?: string;
  name?: string;
  product_id?: number;
  status?: string;
}

let variantResolution: Promise<void> | null = null;

async function loadVariantSlugs(): Promise<void> {
  for (let page = 1; page <= 10; page += 1) {
    const result = await lemonFetch<JsonApiCollection<VariantAttributes>>(
      `/variants?page[size]=100&page[number]=${page}`
    );
    if (!result.ok) {
      console.error("[lemonsqueezy] could not list variants to resolve buy links:", result.error);
      return;
    }
    for (const row of result.data?.data ?? []) {
      const slug = row.attributes?.slug;
      if (typeof slug === "string" && slug && row.id) numericByUuid.set(slug.toLowerCase(), String(row.id));
    }
    const meta = result.data?.meta?.page;
    if (!meta?.lastPage || page >= meta.lastPage) return;
  }
}

/**
 * Make sure every configured buy-link uuid has its numeric id in hand.
 *
 * Awaited at the top of the checkout and webhook routes, the same way
 * `ensureRuntimeConfig()` is. A no-op when nothing needs resolving, which is the
 * case whenever the settings hold numeric ids.
 */
export async function ensureVariantResolution(): Promise<void> {
  const pending = variantCatalog().some((ref) => ref.uuid !== null && ref.numeric === null);
  if (!pending) return;
  if (!lemonConfigured()) return;
  // One in-flight load, shared: several plan buttons pressed at once must not each
  // page through the account's variants.
  if (!variantResolution) {
    variantResolution = loadVariantSlugs().finally(() => {
      variantResolution = null;
    });
  }
  await variantResolution;
}

/**
 * The numeric id for a configured value in any of the three accepted forms, or
 * null when it is a buy link the API would not name.
 */
export async function resolveNumericVariant(value: string | null | undefined): Promise<string | null> {
  const identity = parseVariantId(value);
  if (identity.numeric) return identity.numeric;
  if (!identity.uuid) return null;
  const known = numericByUuid.get(identity.uuid);
  if (known) return known;
  await ensureVariantResolution();
  return numericByUuid.get(identity.uuid) ?? null;
}

/**
 * The store's own checkout host, e.g. `smb.lemonsqueezy.com`.
 *
 * Needed only to build a hosted buy link when the numeric id could not be
 * resolved. Read from the API rather than hardcoded, with a setting to override it
 * for the case where the API is unreachable but checkout should still work.
 */
let storeDomainCache: string | null = null;

export async function storeCheckoutDomain(): Promise<string | null> {
  const override = lemonEnv("LEMONSQUEEZY_STORE_DOMAIN").trim();
  if (override) return override.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (storeDomainCache) return storeDomainCache;

  const config = readLemonConfig();
  if (!config) return null;

  const result = await lemonFetch<JsonApiResource<{ domain?: string; url?: string }>>(
    `/stores/${encodeURIComponent(config.storeId)}`
  );
  if (!result.ok) return null;

  const attributes = result.data?.data?.attributes ?? {};
  const domain =
    (typeof attributes.domain === "string" && attributes.domain) ||
    (typeof attributes.url === "string" ? attributes.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "");
  if (!domain) return null;

  storeDomainCache = domain;
  return domain;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout
//
// One call, `POST /v1/checkouts`, returns a hosted URL we redirect the buyer to.
// Three things are load-bearing:
//
//   custom_data       — comes back on every webhook for this purchase. It is how
//                       a payment finds its account. Lemon Squeezy has no idea
//                       who our users are, so if this is wrong the money arrives
//                       and nobody is upgraded.
//   enabled_variants  — pins the checkout to the one thing being bought, so the
//                       page cannot be talked into selling a different plan.
//   expires_at        — a checkout link is a bearer token for a price. Ours die.
//
// And one thing deliberately absent: anything that narrows payment methods.
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckoutCustomData {
  userId: string;
  /** The plan this purchase grants, or "TOPUP" for a credit pack. */
  purpose: PlanTier | "TOPUP";
  cycle?: BillingCycleValue;
  packId?: string;
  /** Echoed back so a webhook can tell a first purchase from a plan change. */
  intent?: "new" | "change" | "topup" | "trial";
  /**
   * The `TrialClaim` row this checkout came from, on a trial purchase.
   *
   * Carried through the payment provider and back so the guard's table can record
   * which allowed attempts turned into real subscriptions. Without it the table
   * only knows how many trials were granted, not how many were taken up — and the
   * gap between those two numbers is the thing worth watching.
   */
  claimId?: string;
}

export interface CreateCheckoutInput {
  variantId: string;
  custom: CheckoutCustomData;
  /** Prefilled on the Lemon Squeezy page; the buyer can still change it. */
  email?: string | null;
  name?: string | null;
  /** Where the buyer lands after paying. */
  redirectUrl: string;
  /** Overrides the variant price, in cents. Used only by the trial's setup fee. */
  customPriceCents?: number;
  /** Hours until the link stops working. 0 disables expiry. */
  expiresInHours?: number;
  /** Renders the checkout inside our own page instead of redirecting. */
  embed?: boolean;
  /** Prefills a discount code and hides the field. */
  discountCode?: string;
  /** Skips the free-trial period on a trial-bearing variant. */
  skipTrial?: boolean;
  darkMode?: boolean;
  receiptNote?: string;
}

export interface CheckoutSession {
  checkoutId: string;
  url: string;
  expiresAt: string | null;
  testMode: boolean;
  /**
   * True when this is the store's own permanent buy link rather than a checkout we
   * created. Only happens when the numeric variant id could not be resolved; the
   * difference that matters is that a hosted link redirects wherever the dashboard
   * says after payment, not wherever we asked.
   */
  hosted: boolean;
}

interface CheckoutAttributes {
  url?: string;
  expires_at?: string | null;
  test_mode?: boolean;
}

/** Values must reach Lemon Squeezy as strings; anything else is dropped. */
function serialiseCustom(custom: CheckoutCustomData): Record<string, string> {
  const out: Record<string, string> = {
    user_id: custom.userId,
    purpose: custom.purpose,
  };
  if (custom.cycle) out.cycle = custom.cycle;
  if (custom.packId) out.pack_id = custom.packId;
  if (custom.intent) out.intent = custom.intent;
  if (custom.claimId) out.claim_id = custom.claimId;
  return out;
}

/**
 * The store's permanent buy link, carrying our custom data.
 *
 * The fallback for a variant we only know by uuid. Everything the checkout API
 * lets us set per-session — the expiry, the pinned variant list, the redirect and
 * receipt copy — is a product setting on this path instead, so set the product's
 * "redirect after purchase" in the dashboard to the dashboard URL. What does carry
 * over is the part that cannot be lost: `checkout[custom][user_id]`, which is how
 * the payment finds its account.
 */
function hostedBuyUrl(domain: string, uuid: string, input: CreateCheckoutInput): string {
  const url = new URL(`https://${domain}/checkout/buy/${uuid}`);
  for (const [key, value] of Object.entries(serialiseCustom(input.custom))) {
    url.searchParams.set(`checkout[custom][${key}]`, value);
  }
  if (input.email) url.searchParams.set("checkout[email]", input.email);
  if (input.name) url.searchParams.set("checkout[name]", input.name);
  if (input.discountCode) {
    url.searchParams.set("checkout[discount_code]", input.discountCode);
    url.searchParams.set("discount", "0");
  }
  if (input.embed) url.searchParams.set("embed", "1");
  if (input.darkMode) url.searchParams.set("dark", "1");
  return url.toString();
}

export async function createCheckout(input: CreateCheckoutInput): Promise<LemonResult<CheckoutSession>> {
  const config = readLemonConfig();
  if (!config) {
    return { ok: false, status: 503, error: "NOT_CONFIGURED", detail: "Lemon Squeezy credentials are not set." };
  }

  // A buy-link uuid is turned into the numeric id the checkout API needs. Cached,
  // so this costs one request per deploy rather than one per purchase.
  const identity = parseVariantId(input.variantId);
  const numeric = await resolveNumericVariant(input.variantId);

  if (numeric === null) {
    // No number, but a uuid: the store's own buy link sells the same thing.
    if (identity.uuid) {
      const domain = await storeCheckoutDomain();
      if (domain) {
        return {
          ok: true,
          data: {
            checkoutId: identity.uuid,
            url: hostedBuyUrl(domain, identity.uuid, input),
            expiresAt: null,
            testMode: config.testMode,
            hosted: true,
          },
        };
      }
      return {
        ok: false,
        status: 502,
        error: "STORE_UNREACHABLE",
        detail: "Could not reach Lemon Squeezy to work out the store's checkout address.",
      };
    }
    return {
      ok: false,
      status: 400,
      error: "BAD_VARIANT",
      detail: `Not a Lemon Squeezy variant id or buy link: ${input.variantId}`,
    };
  }

  const variantNumber = Number(numeric);
  const hours = input.expiresInHours ?? 24;

  const expiresAt = hours > 0 ? new Date(Date.now() + hours * 3_600_000).toISOString() : undefined;

  const attributes: Record<string, unknown> = {
    test_mode: config.testMode,
    product_options: {
      // The buyer bought one thing. Do not let the page offer a second.
      enabled_variants: [variantNumber],
      redirect_url: input.redirectUrl,
      receipt_button_text: "Back to your dashboard",
      receipt_link_url: input.redirectUrl,
      receipt_thank_you_note:
        input.receiptNote ?? "Your credits are already on the account. Thanks for backing this.",
    },
    checkout_options: {
      embed: input.embed === true,
      media: true,
      logo: true,
      desc: true,
      // Leave the discount field visible unless we prefilled one.
      discount: !input.discountCode,
      dark: input.darkMode === true,
      // Shows the trial and setup fee broken out before the buyer commits.
      subscription_preview: true,
      skip_trial: input.skipTrial === true,
    },
    checkout_data: {
      email: input.email ?? undefined,
      name: input.name ?? undefined,
      discount_code: input.discountCode ?? undefined,
      custom: serialiseCustom(input.custom),
    },
  };

  if (typeof input.customPriceCents === "number" && input.customPriceCents >= 0) {
    attributes.custom_price = Math.round(input.customPriceCents);
  }
  if (expiresAt) attributes.expires_at = expiresAt;

  const result = await lemonFetch<JsonApiResource<CheckoutAttributes>>("/checkouts", {
    method: "POST",
    body: {
      data: {
        type: "checkouts",
        attributes,
        relationships: {
          store: { data: { type: "stores", id: String(config.storeId) } },
          variant: { data: { type: "variants", id: String(variantNumber) } },
        },
      },
    },
  });

  if (!result.ok) return result;

  const url = result.data?.data?.attributes?.url;
  if (!url) {
    return { ok: false, status: 502, error: "NO_CHECKOUT_URL", detail: "The checkout was created without a URL." };
  }

  return {
    ok: true,
    data: {
      checkoutId: result.data.data.id,
      url,
      expiresAt: result.data.data.attributes.expires_at ?? null,
      testMode: result.data.data.attributes.test_mode ?? config.testMode,
      hosted: false,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions
//
// Read for two reasons: to fetch the signed portal links (they expire, so they
// are fetched on demand and cached for less than their lifetime), and to
// reconcile — to ask Lemon Squeezy what is true when we suspect a webhook was
// missed.
// ─────────────────────────────────────────────────────────────────────────────

export type LemonSubscriptionStatus =
  | "on_trial"
  | "active"
  | "paused"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "expired";

export interface LemonSubscriptionAttributes {
  store_id?: number;
  customer_id?: number;
  order_id?: number;
  order_item_id?: number;
  product_id?: number;
  variant_id?: number;
  product_name?: string;
  variant_name?: string;
  user_name?: string;
  user_email?: string;
  status?: LemonSubscriptionStatus | string;
  status_formatted?: string;
  card_brand?: string | null;
  card_last_four?: string | null;
  pause?: { mode: "void" | "free"; resumes_at?: string | null } | null;
  cancelled?: boolean;
  trial_ends_at?: string | null;
  billing_anchor?: number | null;
  renews_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  test_mode?: boolean;
  first_subscription_item?: {
    id?: number;
    subscription_id?: number;
    price_id?: number;
    quantity?: number;
  } | null;
  urls?: {
    update_payment_method?: string;
    customer_portal?: string;
    customer_portal_update_subscription?: string;
  };
}

export interface LemonSubscription extends LemonSubscriptionAttributes {
  id: string;
}

export async function getSubscription(
  lsSubscriptionId: string
): Promise<LemonResult<LemonSubscription>> {
  const result = await lemonFetch<JsonApiResource<LemonSubscriptionAttributes>>(
    `/subscriptions/${encodeURIComponent(lsSubscriptionId)}`
  );
  if (!result.ok) return result;
  return { ok: true, data: { id: result.data.data.id, ...result.data.data.attributes } };
}

export interface PortalUrls {
  customerPortal: string | null;
  updatePaymentMethod: string | null;
  updateSubscription: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  fetchedAt: Date;
}

/**
 * The three signed links a customer needs, plus the card they are paying with.
 *
 * All of it comes from one request, and all of it goes stale together — the links
 * because Lemon Squeezy signs them for 24 hours, the card because they might have
 * changed it in the portal we just sent them to.
 */
export async function getPortalUrls(lsSubscriptionId: string): Promise<LemonResult<PortalUrls>> {
  const result = await getSubscription(lsSubscriptionId);
  if (!result.ok) return result;
  const urls = result.data.urls ?? {};
  return {
    ok: true,
    data: {
      customerPortal: urls.customer_portal ?? null,
      updatePaymentMethod: urls.update_payment_method ?? null,
      updateSubscription: urls.customer_portal_update_subscription ?? null,
      cardBrand: result.data.card_brand ?? null,
      cardLastFour: result.data.card_last_four ?? null,
      fetchedAt: new Date(),
    },
  };
}

export interface UpdateSubscriptionPatch {
  /** Move to another plan or cycle. */
  variantId?: string | number;
  /** true cancels at period end; false resumes a cancelled subscription. */
  cancelled?: boolean;
  /** `null` unpauses. `void` stops access, `free` keeps it without charging. */
  pause?: { mode: "void" | "free"; resumesAt?: string | null } | null;
  /** `null` ends a trial immediately and bills it. */
  trialEndsAt?: string | null;
  /** Day of month, 1–31, to bill on. */
  billingAnchor?: number | null;
  /** Bill the difference now rather than at the next renewal. */
  invoiceImmediately?: boolean;
  /** Charge the full new price with no credit for unused time. */
  disableProrations?: boolean;
}

export async function updateSubscription(
  lsSubscriptionId: string,
  patch: UpdateSubscriptionPatch
): Promise<LemonResult<LemonSubscription>> {
  const attributes: Record<string, unknown> = {};

  if (patch.variantId !== undefined) {
    // Accepts a buy-link uuid here too, so the same setting works for a checkout
    // and for an in-place plan change.
    const numeric = await resolveNumericVariant(String(patch.variantId));
    if (!numeric) {
      return {
        ok: false,
        status: 400,
        error: "BAD_VARIANT",
        detail: `Could not work out the Lemon Squeezy variant id behind ${patch.variantId}.`,
      };
    }
    attributes.variant_id = Number(numeric);
  }
  if (patch.cancelled !== undefined) attributes.cancelled = patch.cancelled;
  if (patch.pause !== undefined) {
    attributes.pause =
      patch.pause === null
        ? null
        : { mode: patch.pause.mode, resumes_at: patch.pause.resumesAt ?? undefined };
  }
  if (patch.trialEndsAt !== undefined) attributes.trial_ends_at = patch.trialEndsAt;
  if (patch.billingAnchor !== undefined) attributes.billing_anchor = patch.billingAnchor;
  if (patch.invoiceImmediately !== undefined) attributes.invoice_immediately = patch.invoiceImmediately;
  if (patch.disableProrations !== undefined) attributes.disable_prorations = patch.disableProrations;

  if (Object.keys(attributes).length === 0) {
    return { ok: false, status: 400, error: "EMPTY_PATCH", detail: "Nothing to change." };
  }

  const result = await lemonFetch<JsonApiResource<LemonSubscriptionAttributes>>(
    `/subscriptions/${encodeURIComponent(lsSubscriptionId)}`,
    {
      method: "PATCH",
      body: { data: { type: "subscriptions", id: String(lsSubscriptionId), attributes } },
    }
  );

  if (!result.ok) return result;
  return { ok: true, data: { id: result.data.data.id, ...result.data.data.attributes } };
}

/**
 * Cancel at period end. Lemon Squeezy has no "cancel immediately" — the customer
 * keeps what they paid for until `ends_at`, which is also what our entitlements
 * assume for a CANCELLED row.
 */
export async function cancelSubscription(lsSubscriptionId: string) {
  return updateSubscription(lsSubscriptionId, { cancelled: true });
}

/** Undo a cancellation that has not run out yet. */
export async function resumeSubscription(lsSubscriptionId: string) {
  return updateSubscription(lsSubscriptionId, { cancelled: false, pause: null });
}

/**
 * Change plan or cycle in place.
 *
 * Prorated by default and invoiced immediately on an upgrade, so the customer
 * gets the bigger allowance the moment they ask for it rather than next month.
 * A downgrade is left to the renewal: proration would mean refunding, and Lemon
 * Squeezy issues that as store credit, which is a support conversation we do not
 * want to have on a self-serve click.
 */
export async function changePlan(
  lsSubscriptionId: string,
  plan: PlanTier,
  cycle: BillingCycleValue,
  options: { upgrade: boolean; endTrial?: boolean }
): Promise<LemonResult<LemonSubscription>> {
  const variantId = variantForPlan(plan, cycle);
  if (!variantId) {
    return {
      ok: false,
      status: 503,
      error: "VARIANT_NOT_CONFIGURED",
      detail: `${PLAN_CATALOG[plan].name} (${cycle}) has no Lemon Squeezy variant id.`,
    };
  }
  return updateSubscription(lsSubscriptionId, {
    variantId,
    invoiceImmediately: options.upgrade,
    // A trialist who chooses a paid plan is choosing to pay now. Passing null ends
    // the trial and bills it, so a $1 trial cannot quietly become an Agency month.
    ...(options.endTrial ? { trialEndsAt: null } : {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook signature
//
// `X-Signature` is a hex HMAC-SHA256 of the RAW request body under the webhook's
// signing secret. Raw matters: parse the JSON first and re-serialise it and the
// bytes change, the digest changes, and every event fails verification.
//
// This is the only thing standing between a stranger with our webhook URL and a
// free Agency subscription, so it is compared in constant time and it fails
// closed — an unset secret verifies nothing.
// ─────────────────────────────────────────────────────────────────────────────

export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
  const secret = lemonEnv("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[lemonsqueezy] LEMONSQUEEZY_WEBHOOK_SECRET is not set — refusing the event");
    return false;
  }
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signature.trim().toLowerCase();
  if (received.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading an event
//
// Their payload is `{meta: {event_name, custom_data, test_mode}, data: {...}}`.
// Everything below is defensive: a webhook is untrusted input that happens to be
// signed, and a missing field must produce a null we handle rather than a throw
// that makes Lemon Squeezy retry the same event for a day.
// ─────────────────────────────────────────────────────────────────────────────

export interface LemonWebhookMeta {
  event_name?: string;
  test_mode?: boolean;
  custom_data?: Record<string, unknown>;
  webhook_id?: string;
}

export interface LemonWebhookPayload {
  meta?: LemonWebhookMeta;
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
}

/** The events this product acts on. Anything else is stored and ignored. */
export const HANDLED_EVENTS = [
  "order_created",
  "order_refunded",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
  "subscription_payment_refunded",
  "subscription_plan_changed",
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export function isHandledEvent(name: string): name is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(name);
}

/**
 * A stable id for one delivery, so a replay is a no-op.
 *
 * Lemon Squeezy does not put an event id in the body. `webhook_id` is present on
 * current deliveries and is per-event; when it is missing we compose one from the
 * event name, the resource id and the resource's own `updated_at`, which changes
 * on every real state change and is identical across retries of the same one.
 */
export function webhookEventId(payload: LemonWebhookPayload, rawBody: string): string {
  const explicit = payload.meta?.webhook_id;
  if (typeof explicit === "string" && explicit) return `ls_${explicit}`;

  const name = payload.meta?.event_name ?? "unknown";
  const id = payload.data?.id ?? "unknown";
  const updated = payload.data?.attributes?.updated_at;
  if (typeof updated === "string" && updated) return `ls_${name}_${id}_${updated}`;

  // Last resort: hash the body. Identical retries collapse, which is the point.
  const digest = createHmac("sha256", "ls-event-id").update(rawBody, "utf8").digest("hex").slice(0, 32);
  return `ls_${name}_${id}_${digest}`;
}

function readString(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function readNumber(source: Record<string, unknown> | undefined, key: string): number | null {
  const value = source?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readDate(source: Record<string, unknown> | undefined, key: string): Date | null {
  const value = source?.[key];
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readBoolean(source: Record<string, unknown> | undefined, key: string): boolean | null {
  const value = source?.[key];
  return typeof value === "boolean" ? value : null;
}

/**
 * Our own fields, back from the checkout.
 *
 * Tolerant of both spellings because a checkout link built by hand in the Lemon
 * Squeezy dashboard will use whatever the person typed, and a payment that cannot
 * find its account is the worst failure this system has.
 */
export interface ParsedCustomData {
  userId: string | null;
  purpose: PlanTier | "TOPUP" | null;
  cycle: BillingCycleValue | null;
  packId: string | null;
  intent: string | null;
  claimId: string | null;
}

export function parseCustomData(source: Record<string, unknown> | undefined): ParsedCustomData {
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return null;
  };

  const rawPurpose = pick("purpose", "plan")?.toUpperCase() ?? null;
  const purpose =
    rawPurpose === "TOPUP" ? "TOPUP" : rawPurpose && isPlanTier(rawPurpose) ? rawPurpose : null;

  const rawCycle = pick("cycle", "billingCycle", "billing_cycle")?.toLowerCase() ?? null;
  const cycle = rawCycle === "monthly" || rawCycle === "yearly" ? rawCycle : null;

  return {
    userId: pick("user_id", "userId", "clerk_user_id"),
    purpose,
    cycle,
    packId: pick("pack_id", "packId", "topup"),
    intent: pick("intent"),
    claimId: pick("claim_id", "claimId"),
  };
}

/** Lemon Squeezy's subscription vocabulary, in ours. */
export function mapSubscriptionStatus(status: string | null | undefined): SubscriptionStatusValue {
  switch ((status ?? "").toLowerCase()) {
    case "on_trial":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "paused":
      return "PAUSED";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    default:
      return "NONE";
  }
}

/**
 * Everything one event says, flattened.
 *
 * The webhook route decides what to *do*; this decides what the payload *says*.
 * Splitting it that way means the handler reads as business rules rather than as
 * a hundred lines of optional-chaining into someone else's JSON.
 */
export interface LemonEventFacts {
  eventName: string;
  testMode: boolean;
  resourceType: string | null;
  resourceId: string | null;
  custom: ParsedCustomData;

  customerId: string | null;
  subscriptionId: string | null;
  orderId: string | null;
  productId: string | null;
  variantId: string | null;
  variantName: string | null;
  productName: string | null;

  userEmail: string | null;
  userName: string | null;

  lsStatus: string | null;
  status: SubscriptionStatusValue | null;
  cancelled: boolean;
  pauseMode: "void" | "free" | null;
  pauseResumesAt: Date | null;

  trialEndsAt: Date | null;
  renewsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  billingAnchor: number | null;

  cardBrand: string | null;
  cardLastFour: string | null;

  /** What the customer was charged, in the charged currency's minor units. */
  amountCents: number | null;
  currency: string | null;
  /** The same charge converted to USD cents, which is how we settle. */
  amountUsdCents: number | null;

  /** "initial" | "renewal" | "updated" on a subscription invoice. */
  billingReason: string | null;
  refunded: boolean;
  receiptUrl: string | null;

  /** What was bought, resolved from the variant id we configured. */
  purchase: VariantRef | null;
  /** The plan this event grants, from custom data first, then the variant. */
  plan: PlanTier | null;
  cycle: BillingCycleValue | null;
  packId: string | null;
}

export function readEventFacts(payload: LemonWebhookPayload, rawBody?: string): LemonEventFacts {
  void rawBody;
  const meta = payload.meta ?? {};
  const attributes = payload.data?.attributes ?? {};
  const custom = parseCustomData(meta.custom_data);

  const firstOrderItem = (attributes.first_order_item ?? null) as Record<string, unknown> | null;
  const urls = (attributes.urls ?? {}) as Record<string, unknown>;
  const pause = (attributes.pause ?? null) as Record<string, unknown> | null;

  const resourceType = payload.data?.type ?? null;
  const resourceId = payload.data?.id ?? null;

  // A subscription event's own id IS the subscription id; an invoice event names
  // it in a field; an order event has none.
  const subscriptionId =
    resourceType === "subscriptions" && resourceId
      ? resourceId
      : readString(attributes, "subscription_id");

  const orderId =
    resourceType === "orders" && resourceId ? resourceId : readString(attributes, "order_id");

  const variantId =
    readString(attributes, "variant_id") ?? readString(firstOrderItem ?? undefined, "variant_id");

  const variantName =
    readString(attributes, "variant_name") ?? readString(firstOrderItem ?? undefined, "variant_name");

  const productId =
    readString(attributes, "product_id") ?? readString(firstOrderItem ?? undefined, "product_id");

  const productName =
    readString(attributes, "product_name") ?? readString(firstOrderItem ?? undefined, "product_name");

  const purchase = resolveVariant(variantId);

  // Custom data is what the buyer clicked. The variant is what they were actually
  // sold. They agree unless something was set up by hand, and when they disagree
  // the variant wins — it is the thing that was charged for.
  const plan =
    purchase?.plan ??
    (custom.purpose && custom.purpose !== "TOPUP" ? custom.purpose : null) ??
    null;

  const cycle = purchase?.cycle ?? custom.cycle ?? cycleFromVariantName(variantName);

  const lsStatus = readString(attributes, "status");
  const isSubscriptionShaped = resourceType === "subscriptions";

  return {
    eventName: meta.event_name ?? "",
    testMode: readBoolean(attributes, "test_mode") ?? meta.test_mode === true,
    resourceType,
    resourceId,
    custom,

    customerId: readString(attributes, "customer_id"),
    subscriptionId,
    orderId,
    productId,
    variantId,
    variantName,
    productName,

    userEmail: readString(attributes, "user_email"),
    userName: readString(attributes, "user_name"),

    lsStatus,
    status: isSubscriptionShaped ? mapSubscriptionStatus(lsStatus) : null,
    cancelled: readBoolean(attributes, "cancelled") === true,
    pauseMode: (readString(pause ?? undefined, "mode") as "void" | "free" | null) ?? null,
    pauseResumesAt: readDate(pause ?? undefined, "resumes_at"),

    trialEndsAt: readDate(attributes, "trial_ends_at"),
    renewsAt: readDate(attributes, "renews_at"),
    endsAt: readDate(attributes, "ends_at"),
    createdAt: readDate(attributes, "created_at"),
    updatedAt: readDate(attributes, "updated_at"),
    billingAnchor: readNumber(attributes, "billing_anchor"),

    cardBrand: readString(attributes, "card_brand"),
    cardLastFour: readString(attributes, "card_last_four"),

    amountCents: readNumber(attributes, "total"),
    currency: readString(attributes, "currency"),
    amountUsdCents: readNumber(attributes, "total_usd"),

    billingReason: readString(attributes, "billing_reason"),
    refunded: readBoolean(attributes, "refunded") === true,
    receiptUrl:
      (typeof urls.invoice_url === "string" ? urls.invoice_url : null) ??
      (typeof urls.receipt === "string" ? urls.receipt : null),

    purchase,
    plan,
    cycle,
    packId: purchase?.packId ?? custom.packId ?? null,
  };
}

/** Last-resort cycle detection, for a variant configured outside our env map. */
function cycleFromVariantName(name: string | null): BillingCycleValue | null {
  if (!name) return null;
  if (/year|annual/i.test(name)) return "yearly";
  if (/month/i.test(name)) return "monthly";
  return null;
}

/**
 * A live subscription read back through the same lens as a webhook.
 *
 * An invoice event says a payment succeeded but not what the subscription now
 * looks like, so the handler fetches the subscription and runs it through this.
 * Reusing `readEventFacts` is the point: the period a renewal grants for is then
 * derived by exactly the same arithmetic whether it came from a pushed event or a
 * pulled one, which is what keeps the grant key stable across both.
 */
export function factsFromSubscription(
  sub: LemonSubscription,
  custom?: Record<string, unknown>
): LemonEventFacts {
  const { id, ...attributes } = sub;
  return readEventFacts({
    meta: { event_name: "subscription_synced", custom_data: custom, test_mode: sub.test_mode },
    data: { type: "subscriptions", id, attributes: attributes as Record<string, unknown> },
  });
}

/**
 * How much of a plan's price we actually keep, in cents.
 *
 * Lemon Squeezy takes 5% + $0.50 of every transaction and remits the sales tax
 * they collected on top. Used by the internal margin view, so a plan's headline
 * price is never mistaken for revenue.
 */
export function netAfterFees(grossCents: number): number {
  if (grossCents <= 0) return 0;
  return Math.max(0, Math.round(grossCents - grossCents * 0.05 - 50));
}

export const LEMON_FEE_NOTE = "Lemon Squeezy takes 5% + $0.50 per transaction and is the merchant of record.";
