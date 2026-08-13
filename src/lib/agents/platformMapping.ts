export interface PlatformFormatSpec {
  mediaType: "image" | "video" | "text_only";
  aspectRatio: "1:1" | "9:16" | "16:9" | "4:5" | "1.91:1";
  description: string;
}

export const PLATFORM_FORMAT_MAP: Record<string, Record<string, PlatformFormatSpec>> = {
  facebook: {
    feed: { mediaType: "image", aspectRatio: "1:1", description: "Facebook Feed Post Image" },
    reel: { mediaType: "video", aspectRatio: "9:16", description: "Facebook Reel Short Video" },
    story: { mediaType: "image", aspectRatio: "9:16", description: "Facebook Story Image" },
  },
  instagram: {
    feed: { mediaType: "image", aspectRatio: "1:1", description: "Instagram Feed Square Image" },
    carousel: { mediaType: "image", aspectRatio: "1:1", description: "Instagram Carousel Image" },
    reel: { mediaType: "video", aspectRatio: "9:16", description: "Instagram Reel Vertical Video" },
    story: { mediaType: "image", aspectRatio: "9:16", description: "Instagram Story Image" },
  },
  tiktok: {
    video: { mediaType: "video", aspectRatio: "9:16", description: "TikTok Short Video" },
    feed: { mediaType: "video", aspectRatio: "9:16", description: "TikTok Short Video" },
  },
  linkedin: {
    post: { mediaType: "image", aspectRatio: "1.91:1", description: "LinkedIn Professional Image" },
    feed: { mediaType: "image", aspectRatio: "1.91:1", description: "LinkedIn Feed Post Image" },
    article: { mediaType: "text_only", aspectRatio: "1.91:1", description: "LinkedIn Longform Article" },
  },
  youtube: {
    short: { mediaType: "video", aspectRatio: "9:16", description: "YouTube Short Video" },
    video: { mediaType: "video", aspectRatio: "16:9", description: "YouTube Landscape Video" },
    community: { mediaType: "image", aspectRatio: "1:1", description: "YouTube Community Post Image" },
  },
  x: {
    post: { mediaType: "image", aspectRatio: "16:9", description: "X / Twitter Image Post" },
    feed: { mediaType: "image", aspectRatio: "16:9", description: "X / Twitter Feed Image" },
  },
  pinterest: {
    pin: { mediaType: "image", aspectRatio: "9:16", description: "Pinterest Vertical Pin Image" },
  },
};

export function getPlatformFormatSpec(platform: string, contentType: string): PlatformFormatSpec {
  const normPlatform = platform.toLowerCase().trim();
  const normType = contentType.toLowerCase().trim();

  if (PLATFORM_FORMAT_MAP[normPlatform]?.[normType]) {
    return PLATFORM_FORMAT_MAP[normPlatform][normType];
  }

  // Fallback defaults based on naming conventions
  if (normType.includes("reel") || normType.includes("video") || normType.includes("short")) {
    return { mediaType: "video", aspectRatio: "9:16", description: "Vertical Short Video" };
  }

  return { mediaType: "image", aspectRatio: "1:1", description: "Social Media Post Image" };
}
