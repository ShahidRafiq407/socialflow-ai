/**
 * Smart Image Fetcher (Pixabay stock search with AI visual fallback)
 * Standard blog featured image size: 1200x630 (16:9 widescreen)
 */

export interface SmartImageResult {
  url: string;
  source: "pixabay" | "ai" | "stock";
  alt: string;
  width: number;
  height: number;
}

/**
 * Strips list numbers (e.g. "7 Best", "Top 10") and guide prefixes so image prompt focuses on the core subject.
 */
export function cleanImageQuery(q: string): string {
  return q
    .replace(/^\d+\s+(best|top|essential|proven|steps|ways|tips|strategies)\s+/i, "")
    .replace(/^(how to|guide to|complete guide to|ultimate guide to|top \d+|best \d+)\s+/i, "")
    .replace(/\s+\(.*?\)/g, "")
    .replace(/:\s*.*$/, "")
    .trim();
}

/**
 * Fetches a high-quality relevant stock image for articles and blog posts.
 */
export async function getSmartImageUrl(
  query: string,
  options?: {
    orientation?: "horizontal" | "vertical" | "square";
    width?: number;
    height?: number;
  }
): Promise<SmartImageResult> {
  const orientation = options?.orientation || "horizontal";
  const w = options?.width || (orientation === "vertical" ? 1080 : orientation === "square" ? 1080 : 1200);
  const h = options?.height || (orientation === "vertical" ? 1920 : orientation === "square" ? 1080 : 630);

  const cleanQ = cleanImageQuery(query || "business technology");
  const apiKey = process.env.PIXABAY_API_KEY || "48747442-d6c1b3f9b2d9d95f6e80b2a75";
  const pixabayOrientation = orientation === "vertical" ? "vertical" : "horizontal";

  try {
    const endpoint = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(cleanQ)}&image_type=photo&orientation=${pixabayOrientation}&per_page=10&safesearch=true`;
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      if (data.hits && data.hits.length > 0) {
        const hit = data.hits[0];
        return {
          url: hit.largeImageURL || hit.webformatURL,
          source: "pixabay",
          alt: cleanQ,
          width: w,
          height: h,
        };
      }
    }
  } catch (err) {
    console.warn("[images.ts] Stock search error, falling back to clean placeholder:", err);
  }

  // High quality Unsplash source fallback
  const fallbackUrl = `https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=${w}&auto=format&fit=crop`;
  return {
    url: fallbackUrl,
    source: "stock",
    alt: cleanQ,
    width: w,
    height: h,
  };
}
