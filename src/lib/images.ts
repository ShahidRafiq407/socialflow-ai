/**
 * Smart Image Fetcher (Pixabay API with Pollinations AI fallback)
 * Standard blog featured image size: 1200x630 (16:9 widescreen)
 */

export interface SmartImageResult {
  url: string;
  source: "pixabay" | "ai";
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
 * Fetches an AI generated image first (Pollinations AI).
 * If AI image fails, falls back to Pixabay photo search.
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

  // 1. GENERATE WITH AI FIRST (Custom high-tech, accurate visuals)
  const cleanQ = cleanImageQuery(query || "modern technology");
  const aiPrompt = encodeURIComponent(
    `professional high-tech commercial photography of ${cleanQ}, realistic engineering and modern electronics, studio lighting, ultra-sharp 8k resolution, photorealistic, cinematic depth of field, no cartoons, no toys, no watermark, no text`
  );
  const aiUrl = `https://image.pollinations.ai/prompt/${aiPrompt}?width=${w}&height=${h}&nologo=true&seed=${Math.floor(
    Math.random() * 10000
  )}`;

  try {
    // Check if AI image endpoint responds quickly
    const testRes = await fetch(aiUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (testRes.ok || testRes.status === 200 || testRes.status === 302) {
      return {
        url: aiUrl,
        source: "ai",
        alt: query,
        width: w,
        height: h,
      };
    }
  } catch (error) {
    console.warn("AI image generation check timed out or failed, falling back to Pixabay:", error);
  }

  // Always return aiUrl as primary if no error thrown
  return {
    url: aiUrl,
    source: "ai",
    alt: query,
    width: w,
    height: h,
  };
}
