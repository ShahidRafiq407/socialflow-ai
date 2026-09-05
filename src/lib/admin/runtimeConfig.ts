// ============================================================================
// RUNTIME CONFIG — WHAT THE ADMIN CHANGED, APPLIED WITHOUT A DEPLOY
//
// Every knob the back office exposes lands in the `AppSetting` table as one
// row per dotted key. This module is the only reader and the only writer.
//
// Reads are served from an in-process cache that is refreshed from the database
// when it is older than CACHE_TTL_MS. Every path that spends money or answers a
// request calls `ensureRuntimeConfig()` first (the Vertex provider, the plan
// resolver, the dashboard layout), so on a serverless fleet a change made on
// one instance is live everywhere within the TTL — and immediately on the
// instance that made it, because `setSetting` writes through to its own cache.
//
// Secret rows are encrypted with APP_ENCRYPTION_KEY through `encryptSecret`.
// `peekSecret` decrypts for the code that needs the real value (an API client);
// `describeSecret` masks for the screen. Nothing else can read a secret back.
//
// Applying: some settings are not looked up by name at use time — the plan
// catalogue and the model rate card are plain objects read all over the
// codebase. For those, `applyOverrides()` pushes the current values into the
// override hooks each module exposes (`setPlanOverrides`, `setModelRateOverrides`,
// `setChatModelCatalog`), so the rest of the product keeps calling the functions
// it always did.
// ============================================================================

import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { setPlanOverrides, type PlanOverrides } from "@/lib/billing/plans";
import { setModelRateOverrides, type ModelRate } from "@/lib/billing/modelPricing";
import { setChatModelCatalog, type ChatModelInfo } from "@/lib/agents/controller/models";
import { PROVIDERS } from "@/lib/providers/registry";
import { setModelRouting, type ModelRouting } from "@/lib/providers/gateway";
import { ensureAdminSchema } from "./schema";

/** How stale the cache may be before a request pays for a re-read. */
const CACHE_TTL_MS = 10_000;

export type SettingValue = string | number | boolean | null | SettingValue[] | { [k: string]: SettingValue };

interface SettingRow {
  key: string;
  value: SettingValue;
  secret: boolean;
  updatedAt: Date;
  updatedBy: string | null;
}

interface CacheState {
  loadedAt: number;
  rows: Map<string, SettingRow>;
  models: ChatModelInfo[];
  /**
   * Where each custom model's traffic goes. Kept next to `models` rather than
   * inside it because it holds a base URL and a key name, and `models` is
   * serialised to the browser.
   */
  routing: ModelRouting[];
  /** Bumped on every write so a client can tell "the config changed" cheaply. */
  version: number;
}

let cache: CacheState = { loadedAt: 0, rows: new Map(), models: [], routing: [], version: 0 };
let inflight: Promise<void> | null = null;
/**
 * When the last load FAILED. Kept apart from `cache.loadedAt` on purpose: the
 * back-off used to be implemented by stamping `loadedAt` on the failed cache,
 * which made an empty cache indistinguishable from a freshly loaded one — so
 * `getFlags()` returned code defaults and the caller could not tell that the
 * admin's maintenance switch, plan overrides and model catalogue were simply
 * never read.
 */
let failedAt = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Setting keys
//
// Written down once so the admin screen, the readers and the tests agree on the
// spelling. A key not in this list can still be stored; it just has no UI.
// ─────────────────────────────────────────────────────────────────────────────

/** Model role → setting key. `MODELS.CONTENT_CREATOR` reads `ai.model.CONTENT_CREATOR`. */
export const MODEL_ROLE_KEYS = [
  "CONTENT_CREATOR",
  "TREND_RESEARCHER",
  "COMPETITOR_ANALYST",
  "CEO_SUPERVISOR",
  "ARTICLE_GENERATOR",
  "ORCHESTRATOR",
  "CHAT_CONTROLLER",
  "CHAT_UTILITY",
  "VISUALIZER",
  "VIDEO",
  "EMBEDDING",
  "SLIDE_REGENERATOR",
] as const;
export type ModelRoleKey = (typeof MODEL_ROLE_KEYS)[number];

export const MODEL_ROLE_LABELS: Record<ModelRoleKey, string> = {
  CONTENT_CREATOR: "Content writer (posts, captions, rewrites)",
  TREND_RESEARCHER: "Trend research (grounded search)",
  COMPETITOR_ANALYST: "Competitor scan (cheap classification)",
  CEO_SUPERVISOR: "CEO audit (quality gate)",
  ARTICLE_GENERATOR: "Article generator",
  ORCHESTRATOR: "Orchestrator / planner",
  CHAT_CONTROLLER: "Chat controller (default brain)",
  CHAT_UTILITY: "Chat chores (titles, summaries, suggestions)",
  VISUALIZER: "Image generation",
  VIDEO: "Video generation",
  EMBEDDING: "Embeddings (memory) — changing this leaves existing memories in the old vector space",
  SLIDE_REGENERATOR: "Carousel slide rewrite",
};

/** Third-party keys the admin may set from the dashboard. */
export const MANAGED_KEYS = [
  // Model providers. Generated from the provider registry so adding a vendor
  // there gives it a key field here without a second edit.
  ...PROVIDERS.filter((p) => p.keyName).map((p) => ({
    name: p.keyName,
    label: `${p.label} API key`,
    group: "AI providers",
    secret: true,
  })),
  { name: "SERPER_API_KEY", label: "Serper.dev (Google SERP)", group: "Search", secret: true },
  { name: "PIXABAY_API_KEY", label: "Pixabay (stock media)", group: "Media", secret: true },
  { name: "PIXABAY_API_KEY_FALLBACK", label: "Pixabay fallback key", group: "Media", secret: true },
  { name: "LEMONSQUEEZY_API_KEY", label: "Lemon Squeezy API key", group: "Billing", secret: true },
  { name: "LEMONSQUEEZY_STORE_ID", label: "Lemon Squeezy store id", group: "Billing", secret: false },
  { name: "LEMONSQUEEZY_WEBHOOK_SECRET", label: "Lemon Squeezy webhook secret", group: "Billing", secret: true },
  { name: "LEMONSQUEEZY_TEST_MODE", label: "Lemon Squeezy test mode (true/false)", group: "Billing", secret: false },
  {
    name: "LEMONSQUEEZY_STORE_DOMAIN",
    label: "Lemon Squeezy store domain (e.g. smb.lemonsqueezy.com) — only needed if the API cannot be reached",
    group: "Billing",
    secret: false,
  },
  {
    name: "LEMONSQUEEZY_ALLOW_TEST_ENTITLEMENTS",
    label: "Honour TEST-MODE purchases on the live site (true/false) — leave off unless you are testing",
    group: "Billing",
    secret: false,
  },
  { name: "LEMONSQUEEZY_VARIANT_TRIAL", label: "Variant: Trial", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_GO_MONTHLY", label: "Variant: Go monthly", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_GO_YEARLY", label: "Variant: Go yearly", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_PRO_MONTHLY", label: "Variant: Pro monthly", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_PRO_YEARLY", label: "Variant: Pro yearly", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_AGENCY_MONTHLY", label: "Variant: Agency monthly", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_AGENCY_YEARLY", label: "Variant: Agency yearly", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_TOPUP_1000", label: "Variant: 1,000 credit top-up", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_TOPUP_5000", label: "Variant: 5,000 credit top-up", group: "Billing variants", secret: false },
  { name: "LEMONSQUEEZY_VARIANT_TOPUP_15000", label: "Variant: 15,000 credit top-up", group: "Billing variants", secret: false },
  { name: "IPQUALITYSCORE_KEY", label: "IPQualityScore (trial fraud)", group: "Trial guard", secret: true },
  { name: "VPNAPI_IO_KEY", label: "vpnapi.io (trial fraud)", group: "Trial guard", secret: true },
  { name: "PROXYCHECK_IO_KEY", label: "proxycheck.io (trial fraud)", group: "Trial guard", secret: true },
  { name: "IPAPI_IS_KEY", label: "ipapi.is (trial fraud)", group: "Trial guard", secret: true },
] as const;
export type ManagedKeyName = (typeof MANAGED_KEYS)[number]["name"];

/** Keys that are read by the Google client at construction and cannot move at runtime. */
export const ENV_ONLY_KEYS = [
  "DATABASE_URL",
  "CLERK_SECRET_KEY",
  "APP_ENCRYPTION_KEY",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CREDENTIALS_JSON",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TRIAL_HASH_SALT",
  "CRON_SECRET",
] as const;

/** Product-level switches with a fixed shape. */
export interface FeatureFlags {
  /** Shows a banner to every signed-in user; nothing is blocked. */
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  /** Hides the Affiliate tab and refuses new referral attribution. */
  affiliateEnabled: boolean;
  /** Hides the trial button even when its variant is configured. */
  trialEnabled: boolean;
  /** Hides top-up packs even when their variants are configured. */
  topUpsEnabled: boolean;
  /** Lets users pick a model in chat; off pins everyone to the default. */
  chatModelPickerEnabled: boolean;
  /** Shows the thumbs up/down under assistant messages. */
  chatFeedbackEnabled: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  maintenanceEnabled: false,
  maintenanceMessage: "",
  affiliateEnabled: true,
  trialEnabled: true,
  topUpsEnabled: true,
  chatModelPickerEnabled: true,
  chatFeedbackEnabled: true,
};

export interface AffiliateTerms {
  commissionPercent: number;
  flatCommissionCents: number;
  minPayoutCents: number;
  lockDays: number;
}

export const DEFAULT_AFFILIATE_TERMS: AffiliateTerms = {
  commissionPercent: 20,
  flatCommissionCents: 1_000,
  minPayoutCents: 5_000,
  lockDays: 30,
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

function toRow(row: { key: string; value: Prisma.JsonValue; secret: boolean; updatedAt: Date; updatedBy: string | null }): SettingRow {
  return {
    key: row.key,
    value: row.value as SettingValue,
    secret: row.secret,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

async function loadFromDatabase(): Promise<void> {
  await ensureAdminSchema();
  const [settings, models] = await Promise.all([
    prisma.appSetting.findMany(),
    prisma.aiModel.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  const rows = new Map<string, SettingRow>();
  for (const row of settings) rows.set(row.key, toRow(row));

  cache = {
    loadedAt: Date.now(),
    rows,
    models: models.map(toChatModelInfo),
    routing: models.map(toModelRouting),
    version: cache.version + 1,
  };
  failedAt = 0;
  applyOverrides();
}

/**
 * Makes sure the cache is fresh enough. Never throws: a database that cannot be
 * read leaves the last good values in place, or the code defaults on a cold
 * start, both of which are safe directions.
 */
export async function ensureRuntimeConfig(force = false): Promise<void> {
  if (!force && Date.now() - cache.loadedAt < CACHE_TTL_MS) return;
  // A failed load backs off for one TTL, without pretending the cache is fresh.
  if (!force && failedAt > 0 && Date.now() - failedAt < CACHE_TTL_MS) return;
  if (!inflight) {
    inflight = loadFromDatabase()
      .catch((err) => {
        console.warn("[runtimeConfig] reload failed (keeping last values):", err instanceof Error ? err.message : err);
        failedAt = Date.now();
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * True once this instance has actually read the settings out of the database.
 *
 * Callers that act on the ABSENCE of a value — "no maintenance banner", "this
 * model is not in the catalogue", "the affiliate programme is off" — must check
 * this first, because every one of those reads answers with a code default on a
 * cache that never loaded.
 */
export function runtimeConfigLoaded(): boolean {
  return cache.loadedAt > 0;
}

/** The cache version, for "has anything changed" checks. */
export function runtimeConfigVersion(): number {
  return cache.version;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

/** Sync read of a non-secret value from the cache. Undefined when unset. */
export function peekSetting<T extends SettingValue = SettingValue>(key: string): T | undefined {
  const row = cache.rows.get(key);
  if (!row || row.secret) return undefined;
  return row.value as T;
}

/** Sync read of a secret's plaintext, for the client that needs it. Empty when unset. */
export function peekSecret(key: string): string {
  const row = cache.rows.get(key);
  if (!row || !row.secret || typeof row.value !== "string") return "";
  return decryptSecret(row.value);
}

/** Awaited read, for callers that may run before anything warmed the cache. */
export async function getSetting<T extends SettingValue = SettingValue>(key: string): Promise<T | undefined> {
  await ensureRuntimeConfig();
  return peekSetting<T>(key);
}

/**
 * The value of a managed key: the dashboard override when set, the environment
 * otherwise. Sync so the existing `getSerperKey()`-style getters keep their
 * shape; callers on a cold path await `ensureRuntimeConfig()` first.
 */
export function managedKey(name: string): string {
  const row = cache.rows.get(`keys.${name}`);
  if (row) {
    const value = row.secret ? decryptSecret(String(row.value ?? "")) : String(row.value ?? "");
    if (value.trim()) return value.trim();
  }
  return (process.env[name] || "").trim();
}

export function getFlags(): FeatureFlags {
  const raw = peekSetting<Record<string, SettingValue>>("flags");
  return { ...DEFAULT_FLAGS, ...(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<FeatureFlags>) : {}) };
}

export function getAffiliateTerms(): AffiliateTerms {
  const raw = peekSetting<Record<string, SettingValue>>("affiliate.terms");
  const merged = { ...DEFAULT_AFFILIATE_TERMS, ...(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<AffiliateTerms>) : {}) };
  return {
    commissionPercent: clampInt(merged.commissionPercent, 0, 100, DEFAULT_AFFILIATE_TERMS.commissionPercent),
    flatCommissionCents: clampInt(merged.flatCommissionCents, 0, 1_000_000, DEFAULT_AFFILIATE_TERMS.flatCommissionCents),
    minPayoutCents: clampInt(merged.minPayoutCents, 0, 10_000_000, DEFAULT_AFFILIATE_TERMS.minPayoutCents),
    lockDays: clampInt(merged.lockDays, 0, 365, DEFAULT_AFFILIATE_TERMS.lockDays),
  };
}

/** The model id an agent role runs on right now, or undefined for the code default. */
export function modelForRole(role: string): string | undefined {
  const value = peekSetting(`ai.model.${role}`);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Plan fields the admin changed, keyed by tier. */
export function getPlanOverrides(): PlanOverrides {
  const raw = peekSetting<Record<string, SettingValue>>("billing.plans");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as unknown as PlanOverrides) : {};
}

/** Admin-added chat models, merged over the built-in list by the catalogue. */
export function getCustomModels(): ChatModelInfo[] {
  return cache.models;
}

/** Where each custom model's traffic goes. Server-only: holds key names. */
export function getModelRoutingRows(): ModelRouting[] {
  return cache.routing;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Applying to the modules that hold their own tables
// ─────────────────────────────────────────────────────────────────────────────

function toChatModelInfo(row: {
  id: string;
  label: string;
  blurb: string | null;
  kind: string;
  provider: string;
  contextWindow: number | null;
  supportsThinking: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  tier: string;
  enabledForChat: boolean;
  chatCredits: number | null;
  minPlan: string | null;
  isDefaultChat: boolean;
  inputPerMTok: number;
  outputPerMTok: number;
  cachedPerMTok: number | null;
  perImage: number | null;
  perVideoSecond: number | null;
  sortOrder: number;
}): ChatModelInfo {
  return {
    id: row.id,
    label: row.label,
    blurb: row.blurb || "",
    supportsThinking: row.supportsThinking,
    supportsTools: row.supportsTools,
    supportsVision: row.supportsVision,
    tier: (["frontier", "fast", "legacy"].includes(row.tier) ? row.tier : "frontier") as ChatModelInfo["tier"],
    recommended: row.isDefaultChat,
    enabledForChat: row.enabledForChat,
    chatCredits: row.chatCredits ?? undefined,
    minPlan: (row.minPlan as ChatModelInfo["minPlan"]) ?? undefined,
    kind: row.kind,
    custom: true,
    provider: row.provider || "vertex",
    contextWindow: row.contextWindow ?? undefined,
    rate: {
      inputPerMTok: row.inputPerMTok,
      outputPerMTok: row.outputPerMTok,
      cachedPerMTok: row.cachedPerMTok ?? undefined,
      perImage: row.perImage ?? undefined,
      perVideoSecond: row.perVideoSecond ?? undefined,
    },
    sortOrder: row.sortOrder,
  };
}

function toModelRouting(row: {
  id: string;
  provider: string;
  baseUrl: string | null;
  apiKeyRef: string | null;
  maxOutputTokens: number | null;
}): ModelRouting {
  return {
    modelId: row.id,
    provider: row.provider || "vertex",
    baseUrl: row.baseUrl,
    apiKeyRef: row.apiKeyRef,
    maxOutputTokens: row.maxOutputTokens,
  };
}

function applyOverrides(): void {
  setPlanOverrides(getPlanOverrides());

  const rates: Record<string, ModelRate> = {};
  for (const model of cache.models) {
    if (!model.rate) continue;
    rates[model.id] = { ...model.rate, role: `Custom: ${model.label}` };
  }
  setModelRateOverrides(rates);

  setChatModelCatalog(cache.models, modelForRole("CHAT_CONTROLLER"));
  // `managedKey` is passed rather than the keys themselves so the gateway never
  // holds a credential of its own — it asks for one at the moment of the call.
  setModelRouting(cache.routing, managedKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing
// ─────────────────────────────────────────────────────────────────────────────

export class SecretStorageError extends Error {
  constructor() {
    super("APP_ENCRYPTION_KEY is not set, so secrets cannot be stored from the dashboard. Set it in the environment first.");
    this.name = "SecretStorageError";
  }
}

/** Writes one setting and updates this instance's cache in the same breath. */
export async function setSetting(
  key: string,
  value: SettingValue,
  options: { secret?: boolean; updatedBy?: string | null } = {}
): Promise<void> {
  await ensureAdminSchema();
  const secret = options.secret === true;

  let stored: SettingValue = value;
  if (secret) {
    if (!isEncryptionConfigured()) throw new SecretStorageError();
    const encrypted = encryptSecret(String(value ?? ""));
    if (encrypted === null) throw new SecretStorageError();
    stored = encrypted;
  }

  const row = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: stored as Prisma.InputJsonValue, secret, updatedBy: options.updatedBy ?? null },
    update: { value: stored as Prisma.InputJsonValue, secret, updatedBy: options.updatedBy ?? null },
  });

  cache.rows.set(key, toRow(row));
  cache = { ...cache, version: cache.version + 1 };
  applyOverrides();
}

export async function deleteSetting(key: string): Promise<void> {
  await ensureAdminSchema();
  await prisma.appSetting.deleteMany({ where: { key } });
  cache.rows.delete(key);
  cache = { ...cache, version: cache.version + 1 };
  applyOverrides();
}

/** Forces every instance-local table back to a fresh read on the next call. */
export async function refreshRuntimeConfig(): Promise<void> {
  await ensureRuntimeConfig(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Describing, for the admin screen
// ─────────────────────────────────────────────────────────────────────────────

export interface ManagedKeyStatus {
  name: string;
  label: string;
  group: string;
  secret: boolean;
  /** Where the live value comes from. */
  source: "dashboard" | "env" | "unset";
  /** "••••••ab12" for secrets, the value itself otherwise. */
  preview: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function maskValue(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (v.length <= 6) return "••••";
  return `${"•".repeat(Math.min(10, v.length - 4))}${v.slice(-4)}`;
}

export function describeManagedKeys(): ManagedKeyStatus[] {
  return MANAGED_KEYS.map((spec) => {
    const row = cache.rows.get(`keys.${spec.name}`);
    const fromRow = row ? (row.secret ? decryptSecret(String(row.value ?? "")) : String(row.value ?? "")) : "";
    const fromEnv = (process.env[spec.name] || "").trim();
    const live = fromRow.trim() || fromEnv;
    return {
      name: spec.name,
      label: spec.label,
      group: spec.group,
      secret: spec.secret,
      source: fromRow.trim() ? "dashboard" : fromEnv ? "env" : "unset",
      preview: live ? (spec.secret ? maskValue(live) : live) : "",
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

export function describeEnvOnlyKeys(): Array<{ name: string; configured: boolean }> {
  return ENV_ONLY_KEYS.map((name) => ({ name, configured: (process.env[name] || "").trim().length > 0 }));
}

/** Every non-secret setting row, for the raw settings view and the audit trail. */
export function listSettingRows(): Array<{ key: string; value: SettingValue; secret: boolean; updatedAt: string; updatedBy: string | null }> {
  return [...cache.rows.values()]
    .map((row) => ({
      key: row.key,
      value: row.secret ? maskValue(decryptSecret(String(row.value ?? ""))) : row.value,
      secret: row.secret,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Test hook. */
export function resetRuntimeConfigForTests(): void {
  cache = { loadedAt: 0, rows: new Map(), models: [], routing: [], version: 0 };
  inflight = null;
  applyOverrides();
}
