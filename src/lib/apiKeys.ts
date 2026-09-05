// ============================================================================
// THIRD-PARTY PROVIDER KEYS — one place, dashboard first, environment second.
//
// Nothing in this file falls back to a literal key. A missing key makes the
// feature that needs it report "not configured" instead of silently borrowing
// somebody else's quota or, worse, fabricating data so the UI looks healthy.
//
// An admin can set or rotate any of these from the back office; that value is
// stored encrypted and wins over the environment. `managedKey` reads the
// runtime-config cache, which is per-instance and empty until something loads
// it — so a caller awaits `ensureApiKeys()` before reading. Nothing warms the
// cache implicitly: a server action and a background job are each their own
// request, and on a cold instance an unloaded cache reads as "not configured"
// even when the key is set in the dashboard.
//
// Server-only by convention: never import from a "use client" component. The
// browser gets provider results through server actions / route handlers.
// ============================================================================

import { ensureRuntimeConfig, managedKey } from "@/lib/admin/runtimeConfig";

/**
 * Loads the dashboard's key overrides into this instance's runtime-config cache.
 * Cheap to call repeatedly — the cache has its own TTL — so every entry point
 * that is about to read a key can simply await it first.
 */
export async function ensureApiKeys(): Promise<void> {
  await ensureRuntimeConfig();
}

function clean(value: string | undefined): string {
  return (value || "").trim();
}

/** Serper.dev — Google SERP + Videos search. */
export function getSerperKey(): string {
  return managedKey("SERPER_API_KEY") || clean(process.env.SERPER_DEV_API_KEY);
}

export function hasSerperKey(): boolean {
  return getSerperKey().length > 0;
}

export const SERPER_MISSING_MESSAGE =
  "SERP analysis is not configured. Add SERPER_API_KEY in Admin → Keys (or your environment variables) to enable live Google competitor data.";

/**
 * Pixabay stock media. Returns every configured key in priority order so a
 * rate-limited key can fall through to the next one instead of failing the
 * whole request.
 */
export function getPixabayKeys(): string[] {
  const keys = [managedKey("PIXABAY_API_KEY"), managedKey("PIXABAY_API_KEY_FALLBACK")].filter(Boolean);
  return Array.from(new Set(keys));
}

export function hasPixabayKey(): boolean {
  return getPixabayKeys().length > 0;
}

export const PIXABAY_MISSING_MESSAGE =
  "Stock image search is not configured. Add PIXABAY_API_KEY in Admin → Keys (or your environment variables) to enable free stock photography.";

/**
 * Shopify Admin API version used in every REST path. Shopify supports a version
 * for 12 months, so this is pinned (not "latest") and overridable per
 * deployment rather than being decided at call sites.
 */
export const SHOPIFY_DEFAULT_API_VERSION = "2026-01";

export function getShopifyApiVersion(): string {
  const v = clean(process.env.SHOPIFY_API_VERSION);
  return /^\d{4}-\d{2}$/.test(v) ? v : SHOPIFY_DEFAULT_API_VERSION;
}
