// ============================================================================
// THIRD-PARTY PROVIDER KEYS — one place, read from the environment only.
//
// Nothing in this file falls back to a literal key. A missing key makes the
// feature that needs it report "not configured" instead of silently borrowing
// somebody else's quota or, worse, fabricating data so the UI looks healthy.
//
// Server-only by convention: never import from a "use client" component. The
// browser gets provider results through server actions / route handlers.
// ============================================================================

function clean(value: string | undefined): string {
  return (value || "").trim();
}

/** Serper.dev — Google SERP + Videos search. */
export function getSerperKey(): string {
  return clean(process.env.SERPER_API_KEY) || clean(process.env.SERPER_DEV_API_KEY);
}

export function hasSerperKey(): boolean {
  return getSerperKey().length > 0;
}

export const SERPER_MISSING_MESSAGE =
  "SERP analysis is not configured. Add SERPER_API_KEY to your environment variables (Vercel → Project → Settings → Environment Variables) to enable live Google competitor data.";

/**
 * Pixabay stock media. Returns every configured key in priority order so a
 * rate-limited key can fall through to the next one instead of failing the
 * whole request.
 */
export function getPixabayKeys(): string[] {
  const keys = [
    clean(process.env.PIXABAY_API_KEY),
    clean(process.env.PIXABAY_API_KEY_FALLBACK),
  ].filter(Boolean);
  return Array.from(new Set(keys));
}

export function hasPixabayKey(): boolean {
  return getPixabayKeys().length > 0;
}

export const PIXABAY_MISSING_MESSAGE =
  "Stock image search is not configured. Add PIXABAY_API_KEY to your environment variables to enable free stock photography.";

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
