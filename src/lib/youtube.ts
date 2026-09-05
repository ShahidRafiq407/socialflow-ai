/**
 * Smart YouTube Video Embedder
 *
 * Finds a real, top-ranking YouTube video for the article keyword through the
 * Serper.dev Videos API and builds a responsive 16:9 embed.
 *
 * Returns null when nothing relevant is found or the provider is not configured.
 * It never substitutes a stand-in video: an unrelated embed hurts dwell time and
 * makes the article look machine-assembled, which is the opposite of the E-E-A-T
 * signal the article is built for.
 */

import { ensureApiKeys, getSerperKey, hasSerperKey } from "@/lib/apiKeys";

export interface YouTubeEmbedResult {
  videoId: string;
  title: string;
  url: string;
  embedHtml: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The embed is styled from theme tokens so it matches the app and the editor. */
export function buildYouTubeEmbedHtml(videoId: string, title: string): string {
  const safeTitle = escapeHtml(title);
  return `<div class="youtube-video-embed my-8 overflow-hidden rounded-2xl border shadow-lg">
  <div class="aspect-video w-full">
    <iframe
      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}"
      title="${safeTitle}"
      class="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
      loading="lazy"
    ></iframe>
  </div>
  <figcaption class="video-embed-caption p-3 text-xs font-medium">Watch: ${safeTitle}</figcaption>
</div>`;
}

export async function getSmartYouTubeEmbed(
  keyword: string,
  options?: { targetCountry?: string; context?: string }
): Promise<YouTubeEmbedResult | null> {
  // The key may only exist in the dashboard, which this instance has not read yet.
  await ensureApiKeys();
  if (!hasSerperKey()) return null;

  const topic = (keyword || "").trim();
  if (!topic) return null;

  const cleanQuery = options?.context
    ? `${topic} ${options.context}`.trim()
    : `${topic} tutorial explained`;

  const raw = (options?.targetCountry || "").trim().toUpperCase();
  const gl = /^[A-Z]{2}$/.test(raw) && raw !== "WW" ? raw.toLowerCase() : "";

  try {
    const res = await fetch("https://google.serper.dev/videos", {
      method: "POST",
      headers: {
        "X-API-KEY": getSerperKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: cleanQuery,
        ...(gl ? { gl } : {}),
        hl: "en",
        num: 5,
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = await res.json();
    const videos = Array.isArray(data.videos) ? data.videos : [];

    for (const item of videos) {
      if (!item?.link) continue;
      const match = String(item.link).match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/i
      );
      if (!match?.[1]) continue;

      const videoId = match[1];
      const title = (item.title || `${topic} — video guide`).toString().slice(0, 160);
      return {
        videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        embedHtml: buildYouTubeEmbedHtml(videoId, title),
      };
    }
  } catch (err) {
    console.warn("[youtube] video search unavailable:", (err as any)?.message || err);
  }

  return null;
}
