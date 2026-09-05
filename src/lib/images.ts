/**
 * Smart Image Fetcher (Pixabay stock search).
 *
 * Returns `null` when nothing usable is found or no key is configured. There is
 * deliberately no literal fallback photo: dropping a stock picture of a random
 * subject into an article is worse than shipping the article without it.
 *
 * Default blog featured image: 1200x630 (16:9).
 */

import { ensureApiKeys, getPixabayKeys, hasPixabayKey } from "@/lib/apiKeys";

export interface SmartImageResult {
  url: string;
  source: "pixabay";
  alt: string;
  width: number;
  height: number;
  /** Attribution info — Pixabay's licence does not require it, editors like it. */
  credit?: string;
  pageUrl?: string;
}

/**
 * Strips list numbers ("7 Best", "Top 10") and guide prefixes so the image query
 * focuses on the visual subject rather than the headline formula.
 */
export function cleanImageQuery(q: string): string {
  return q
    .replace(/^\d+\s+(best|top|essential|proven|steps|ways|tips|strategies)\s+/i, "")
    .replace(/^(how to|guide to|complete guide to|ultimate guide to|top \d+|best \d+)\s+/i, "")
    .replace(/\s+\(.*?\)/g, "")
    .replace(/:\s*.*$/, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface PixabaySearchOptions {
  orientation?: "horizontal" | "vertical" | "square";
  width?: number;
  height?: number;
  /** How many distinct results to return. Default 1. */
  count?: number;
  /** Skip this many results — used to keep in-article images distinct. */
  offset?: number;
}

function dimensionsFor(options?: PixabaySearchOptions) {
  const orientation = options?.orientation || "horizontal";
  const width =
    options?.width || (orientation === "vertical" ? 1080 : orientation === "square" ? 1080 : 1200);
  const height =
    options?.height || (orientation === "vertical" ? 1920 : orientation === "square" ? 1080 : 630);
  return { orientation, width, height };
}

async function pixabaySearch(
  query: string,
  orientation: "horizontal" | "vertical",
  perPage: number
): Promise<any[]> {
  await ensureApiKeys();
  for (const key of getPixabayKeys()) {
    try {
      const endpoint =
        `https://pixabay.com/api/?key=${key}` +
        `&q=${encodeURIComponent(query)}` +
        `&image_type=photo&orientation=${orientation}` +
        `&per_page=${Math.min(50, Math.max(3, perPage))}&safesearch=true&order=popular`;

      const res = await fetch(endpoint, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue; // rate limited or bad key — try the next one
      const data = await res.json();
      if (Array.isArray(data?.hits) && data.hits.length > 0) return data.hits;
    } catch (err) {
      console.warn("[images] Pixabay lookup failed:", (err as any)?.message || err);
    }
  }
  return [];
}

function toResult(hit: any, width: number, height: number, alt: string): SmartImageResult {
  return {
    url: hit.largeImageURL || hit.fullHDURL || hit.webformatURL,
    source: "pixabay",
    alt,
    width,
    height,
    credit: hit.user ? `Photo by ${hit.user} on Pixabay` : undefined,
    pageUrl: hit.pageURL || undefined,
  };
}

/** One relevant stock image, or null when none is available. */
export async function getSmartImageUrl(
  query: string,
  options?: PixabaySearchOptions
): Promise<SmartImageResult | null> {
  const images = await getSmartImages(query, { ...options, count: 1 });
  return images[0] || null;
}

/**
 * Several *distinct* stock images for one subject — what in-article illustration
 * needs. Falls back to a broader query only by trimming the user's own phrase,
 * never by substituting an unrelated topic.
 */
export async function getSmartImages(
  query: string,
  options?: PixabaySearchOptions
): Promise<SmartImageResult[]> {
  // Background jobs and server actions each start with an empty runtime-config
  // cache, where a key set in the dashboard is invisible.
  await ensureApiKeys();
  if (!hasPixabayKey()) return [];

  const { orientation, width, height } = dimensionsFor(options);
  const count = Math.min(12, Math.max(1, options?.count || 1));
  const offset = Math.max(0, options?.offset || 0);
  const pixabayOrientation = orientation === "vertical" ? "vertical" : "horizontal";

  const cleanQ = cleanImageQuery(query || "");
  if (!cleanQ) return [];

  // Progressive relaxation: full phrase → first three words → first two words.
  const words = cleanQ.split(" ").filter(Boolean);
  const attempts = Array.from(
    new Set([cleanQ, words.slice(0, 3).join(" "), words.slice(0, 2).join(" ")].filter(Boolean))
  );

  for (const attempt of attempts) {
    const hits = await pixabaySearch(attempt, pixabayOrientation, offset + count + 4);
    if (hits.length === 0) continue;

    const picked: SmartImageResult[] = [];
    const seen = new Set<string>();
    for (const hit of hits.slice(offset)) {
      const url = hit.largeImageURL || hit.fullHDURL || hit.webformatURL;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      picked.push(toResult(hit, width, height, cleanQ));
      if (picked.length >= count) break;
    }
    if (picked.length > 0) return picked;
  }

  return [];
}
