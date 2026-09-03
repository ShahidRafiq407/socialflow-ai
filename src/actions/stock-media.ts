"use server";

/**
 * PIXABAY STOCK SEARCH
 *
 * The key is read from the environment here and never reaches the browser.
 *
 * One behaviour is worth knowing about before reading the code: when a niche
 * term returns nothing, this used to quietly re-run the search as "business"
 * and hand back generic office photography as if it had answered the question.
 * It still runs that fallback — an empty grid is useless — but now it says so,
 * via `fallback` and `requestedQuery`, so the UI can tell the user their term
 * found nothing instead of implying these are the results for it.
 */

import { getPixabayKeys, PIXABAY_MISSING_MESSAGE } from "@/lib/apiKeys";

export interface StockHit {
  id: string;
  url: string;
  previewUrl: string;
  thumbnailUrl?: string;
  tags: string;
  type: "image" | "video";
  width?: number;
  height?: number;
  aspectRatio?: number;
  isVertical?: boolean;
  duration?: number;
  user?: string;
  userImageURL?: string;
  views?: number;
  likes?: number;
}

export interface StockSearchResult {
  success: boolean;
  hits: StockHit[];
  totalHits: number;
  /** The term these hits actually answer. */
  query?: string;
  /** Set only when the requested term found nothing and the generic set ran. */
  requestedQuery?: string;
  /** True when `hits` answer `query` rather than `requestedQuery`. */
  fallback?: boolean;
  /** False only when no Pixabay key is set — a different fix from a failed request. */
  configured?: boolean;
  error?: string;
}

type MediaType = "image" | "video";
type Orientation = "all" | "horizontal" | "vertical";
type Order = "popular" | "latest";

/** The term used when a search finds nothing. Labelled in the result, never silent. */
const GENERIC_FALLBACK = "business";

function mapImage(item: any): StockHit | null {
  const url = item.largeImageURL || item.fullHDURL || item.webformatURL;
  if (!url) return null;
  const width = Number(item.imageWidth || item.webformatWidth || 1920);
  const height = Number(item.imageHeight || item.webformatHeight || 1080);
  return {
    id: String(item.id),
    url: String(url),
    previewUrl: item.webformatURL || item.previewURL || String(url),
    thumbnailUrl: item.previewURL || item.webformatURL || undefined,
    tags: item.tags || "stock photo",
    type: "image",
    width,
    height,
    aspectRatio: height ? width / height : undefined,
    isVertical: height > width,
    user: item.user || undefined,
    userImageURL: item.userImageURL || undefined,
    views: Number(item.views || 0),
    likes: Number(item.likes || 0),
  };
}

function mapVideo(item: any): StockHit | null {
  const v =
    item.videos?.medium || item.videos?.large || item.videos?.small || item.videos?.tiny;
  if (!v?.url) return null;
  const width = Number(v.width || 1280);
  const height = Number(v.height || 720);
  return {
    id: String(item.id),
    url: String(v.url),
    previewUrl: item.videos?.tiny?.url || item.videos?.small?.url || "",
    thumbnailUrl: v.thumbnail || item.videos?.tiny?.thumbnail || undefined,
    tags: item.tags || "stock video",
    type: "video",
    width,
    height,
    aspectRatio: height ? width / height : undefined,
    isVertical: height > width,
    duration: Number(item.duration || 0),
    user: item.user || undefined,
    userImageURL: item.userImageURL || undefined,
    views: Number(item.views || 0),
    likes: Number(item.likes || 0),
  };
}

function matchesOrientation(hit: StockHit, orientation: Orientation): boolean {
  if (orientation === "all") return true;
  const width = hit.width || 0;
  const height = hit.height || 0;
  if (!width || !height) return true;
  return orientation === "vertical" ? height >= width : width >= height;
}

/**
 * One page from Pixabay. `null` means the request itself failed, which reads
 * differently to the user than a term that legitimately has no photos.
 */
async function fetchPage(args: {
  apiKey: string;
  term: string;
  mediaType: MediaType;
  page: number;
  perPage: number;
  order: Order;
  orientation: Orientation;
}): Promise<{ hits: StockHit[]; totalHits: number } | null> {
  const { apiKey, term, mediaType, page, perPage, order, orientation } = args;
  const base = `key=${apiKey}&q=${encodeURIComponent(term)}&page=${page}&order=${order}&safesearch=true`;

  // The video endpoint ignores `orientation`, so vertical/horizontal is filtered
  // here — which is why it asks for more rows than it needs.
  const endpoint =
    mediaType === "video"
      ? `https://pixabay.com/api/videos/?${base}&per_page=${Math.min(200, Math.max(perPage * 2, 20))}`
      : `https://pixabay.com/api/?${base}&image_type=all&per_page=${Math.min(200, Math.max(perPage, 3))}` +
        (orientation === "all" ? "" : `&orientation=${orientation}`);

  const res = await fetch(endpoint, { cache: "no-store" });
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.hits)) return null;

  const mapped = (data.hits as any[])
    .map((item) => (mediaType === "video" ? mapVideo(item) : mapImage(item)))
    .filter((hit): hit is StockHit => hit !== null)
    .filter((hit) => (mediaType === "video" ? matchesOrientation(hit, orientation) : true))
    .slice(0, perPage);

  return { hits: mapped, totalHits: Number(data.total || data.totalHits || mapped.length) };
}

export async function searchStockMedia(
  query: string = GENERIC_FALLBACK,
  mediaType: MediaType = "image",
  page: number = 1,
  perPage: number = 50,
  order: Order = "popular",
  orientation: Orientation = "all"
): Promise<StockSearchResult> {
  const term = (query || "").trim() || GENERIC_FALLBACK;

  // Environment only. A literal key here would spend somebody else's quota.
  const apiKey = getPixabayKeys()[0];
  if (!apiKey) {
    return {
      success: false,
      configured: false,
      error: PIXABAY_MISSING_MESSAGE,
      hits: [],
      totalHits: 0,
    };
  }

  const shared = { apiKey, mediaType, perPage, orientation };

  try {
    const primary = await fetchPage({ ...shared, term, page, order });
    if (!primary) {
      return {
        success: false,
        configured: true,
        error: "Pixabay did not answer. Try again in a moment.",
        hits: [],
        totalHits: 0,
      };
    }
    if (primary.hits.length > 0) {
      return { success: true, configured: true, query: term, fallback: false, ...primary };
    }

    // Nothing for this term. Fall back to the generic set so the grid is usable,
    // and say which term the results are really for.
    if (term.toLowerCase() === GENERIC_FALLBACK) {
      return { success: true, configured: true, query: term, fallback: false, hits: [], totalHits: 0 };
    }
    const generic = await fetchPage({
      ...shared,
      term: GENERIC_FALLBACK,
      page: 1,
      order: "popular",
    });
    if (!generic || generic.hits.length === 0) {
      return { success: true, configured: true, query: term, fallback: false, hits: [], totalHits: 0 };
    }
    return {
      success: true,
      configured: true,
      query: GENERIC_FALLBACK,
      requestedQuery: term,
      fallback: true,
      ...generic,
    };
  } catch (error: any) {
    console.error("Stock media search error:", error);
    return {
      success: false,
      configured: true,
      error: error?.message || "The stock library could not be reached.",
      hits: [],
      totalHits: 0,
    };
  }
}



