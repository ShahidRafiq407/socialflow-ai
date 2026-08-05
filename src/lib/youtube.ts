/**
 * Smart YouTube Video Embedder
 * Uses Serper.dev Videos API to discover a real, top-ranking YouTube video for the article keyword
 * and generates a responsive 16:9 embedded player.
 */

export interface YouTubeEmbedResult {
  videoId: string;
  title: string;
  url: string;
  embedHtml: string;
}

export async function getSmartYouTubeEmbed(keyword: string): Promise<YouTubeEmbedResult | null> {
  const cleanQuery = `${keyword || "digital marketing"} tutorial explained`;
  const serperKey = "efdd31e031ae0b380b32115cd2e9b3b1337a46b6";

  try {
    const res = await fetch("https://google.serper.dev/videos", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: cleanQuery,
        gl: "us",
        hl: "en",
        num: 5,
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      const videos = data.videos || [];
      for (const item of videos) {
        if (!item.link) continue;
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#/]+)/i);
        if (match && match[1]) {
          const videoId = match[1];
          const title = item.title || `${keyword} Complete Guide`;
          const embedHtml = `<div class="youtube-video-embed my-8 overflow-hidden rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-xl bg-slate-900/5">
  <div class="aspect-video w-full">
    <iframe
      src="https://www.youtube.com/embed/${videoId}"
      title="YouTube video player - ${title}"
      class="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      loading="lazy"
    ></iframe>
  </div>
  <div class="p-3 bg-slate-100 dark:bg-slate-900 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
    <span class="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[70%]">▶️ Featured Video: ${title}</span>
    <span class="inline-flex items-center gap-1 text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 font-bold px-2.5 py-0.5 rounded-full border border-red-500/20">🔴 YouTube Embedded</span>
  </div>
</div>`;
          return {
            videoId,
            title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            embedHtml,
          };
        }
      }
    }
  } catch (err) {
    console.warn("Failed to search Serper.dev for YouTube videos:", err);
  }

  // Safe fallback educational tech video if Serper fails
  const defaultVideoId = "8aGhZQkoFbQ"; // Reliable educational embedded systems & tech tutorial video
  const defaultTitle = `${keyword} — Technical Guide & Tutorial`;
  const fallbackHtml = `<div class="youtube-video-embed my-8 overflow-hidden rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-xl bg-slate-900/5">
  <div class="aspect-video w-full">
    <iframe
      src="https://www.youtube.com/embed/${defaultVideoId}"
      title="YouTube video player - ${defaultTitle}"
      class="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      loading="lazy"
    ></iframe>
  </div>
  <div class="p-3 bg-slate-100 dark:bg-slate-900 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
    <span class="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[70%]">▶️ Featured Video: ${defaultTitle}</span>
    <span class="inline-flex items-center gap-1 text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 font-bold px-2.5 py-0.5 rounded-full border border-red-500/20">🔴 YouTube Embedded</span>
  </div>
</div>`;

  return {
    videoId: defaultVideoId,
    title: defaultTitle,
    url: `https://www.youtube.com/watch?v=${defaultVideoId}`,
    embedHtml: fallbackHtml,
  };
}
