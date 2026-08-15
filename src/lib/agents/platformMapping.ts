export interface PlatformFormatSpec {
  mediaType: "image" | "video" | "multi_image" | "text_only";
  aspectRatio: "1:1" | "9:16" | "16:9" | "4:5" | "2:3" | "1.91:1";
  description: string;
}

export const PLATFORM_FORMAT_MAP: Record<string, Record<string, PlatformFormatSpec>> = {
  facebook: {
    feed: { mediaType: "image", aspectRatio: "1:1", description: "Facebook Feed Post Image" },
    "multiple photos": { mediaType: "multi_image", aspectRatio: "1:1", description: "Facebook Multi-Photo Carousel" },
    carousel: { mediaType: "multi_image", aspectRatio: "1:1", description: "Facebook Multi-Photo Carousel" },
    reel: { mediaType: "video", aspectRatio: "9:16", description: "Facebook Reel Short Video" },
    video: { mediaType: "video", aspectRatio: "16:9", description: "Facebook Video" },
    story: { mediaType: "image", aspectRatio: "9:16", description: "Facebook Story Image" },
  },
  instagram: {
    feed: { mediaType: "image", aspectRatio: "1:1", description: "Instagram Feed Square Image" },
    carousel: { mediaType: "multi_image", aspectRatio: "1:1", description: "Instagram Carousel Multi-Slide Post" },
    reel: { mediaType: "video", aspectRatio: "9:16", description: "Instagram Reel Vertical Video" },
    story: { mediaType: "image", aspectRatio: "9:16", description: "Instagram Story Image" },
  },
  tiktok: {
    video: { mediaType: "video", aspectRatio: "9:16", description: "TikTok Short Video" },
    feed: { mediaType: "video", aspectRatio: "9:16", description: "TikTok Short Video" },
    photo: { mediaType: "multi_image", aspectRatio: "9:16", description: "TikTok Photo Mode Carousel" },
    carousel: { mediaType: "multi_image", aspectRatio: "9:16", description: "TikTok Photo Mode Carousel" },
  },
  linkedin: {
    post: { mediaType: "image", aspectRatio: "1.91:1", description: "LinkedIn Professional Image" },
    feed: { mediaType: "image", aspectRatio: "1.91:1", description: "LinkedIn Feed Post Image" },
    "multi-image": { mediaType: "multi_image", aspectRatio: "1:1", description: "LinkedIn Multiple Photos" },
    multi_image: { mediaType: "multi_image", aspectRatio: "1:1", description: "LinkedIn Multiple Photos" },
    carousel: { mediaType: "multi_image", aspectRatio: "4:5", description: "LinkedIn PDF Carousel Document" },
    document: { mediaType: "multi_image", aspectRatio: "4:5", description: "LinkedIn PDF Carousel Document" },
    video: { mediaType: "video", aspectRatio: "16:9", description: "LinkedIn Professional Video" },
    article: { mediaType: "text_only", aspectRatio: "1.91:1", description: "LinkedIn Longform Article" },
  },
  youtube: {
    short: { mediaType: "video", aspectRatio: "9:16", description: "YouTube Short Video" },
    shorts: { mediaType: "video", aspectRatio: "9:16", description: "YouTube Short Video" },
    video: { mediaType: "video", aspectRatio: "16:9", description: "YouTube Landscape Video" },
    community: { mediaType: "image", aspectRatio: "1:1", description: "YouTube Community Post Image" },
  },
  x: {
    post: { mediaType: "image", aspectRatio: "16:9", description: "X / Twitter Image Post" },
    feed: { mediaType: "image", aspectRatio: "16:9", description: "X / Twitter Feed Image" },
    video: { mediaType: "video", aspectRatio: "16:9", description: "X / Twitter Video Post" },
  },
  pinterest: {
    pin: { mediaType: "image", aspectRatio: "2:3", description: "Pinterest Standard Image Pin (2:3)" },
    "standard pin": { mediaType: "image", aspectRatio: "2:3", description: "Pinterest Standard Image Pin (2:3)" },
    standard_pin: { mediaType: "image", aspectRatio: "2:3", description: "Pinterest Standard Image Pin (2:3)" },
    video: { mediaType: "video", aspectRatio: "9:16", description: "Pinterest Vertical Video Pin (9:16)" },
    "video pin": { mediaType: "video", aspectRatio: "9:16", description: "Pinterest Vertical Video Pin (9:16)" },
    video_pin: { mediaType: "video", aspectRatio: "9:16", description: "Pinterest Vertical Video Pin (9:16)" },
    videopin: { mediaType: "video", aspectRatio: "9:16", description: "Pinterest Vertical Video Pin (9:16)" },
    carousel: { mediaType: "multi_image", aspectRatio: "2:3", description: "Pinterest Carousel Multi-Card Pin (2:3)" },
    "carousel pin": { mediaType: "multi_image", aspectRatio: "2:3", description: "Pinterest Carousel Multi-Card Pin (2:3)" },
    idea: { mediaType: "multi_image", aspectRatio: "9:16", description: "Pinterest Idea Pin Multi-Page Story (9:16)" },
    ideapin: { mediaType: "multi_image", aspectRatio: "9:16", description: "Pinterest Idea Pin Multi-Page Story (9:16)" },
    "idea pin": { mediaType: "multi_image", aspectRatio: "9:16", description: "Pinterest Idea Pin Multi-Page Story (9:16)" },
    idea_pin: { mediaType: "multi_image", aspectRatio: "9:16", description: "Pinterest Idea Pin Multi-Page Story (9:16)" },
  },
};

export function getPlatformFormatSpec(platform: string, contentType: string): PlatformFormatSpec {
  const normPlatform = platform.toLowerCase().trim();
  const normType = contentType.toLowerCase().trim();

  if (PLATFORM_FORMAT_MAP[normPlatform]?.[normType]) {
    return PLATFORM_FORMAT_MAP[normPlatform][normType];
  }

  // Check matching keys
  const platformEntry = PLATFORM_FORMAT_MAP[normPlatform];
  if (platformEntry) {
    for (const [key, spec] of Object.entries(platformEntry)) {
      if (normType.includes(key) || key.includes(normType)) {
        return spec;
      }
    }
  }

  // Fallback defaults based on naming conventions across all platforms
  if (normType.includes("reel") || normType.includes("video") || normType.includes("short")) {
    const isLandscape = normType.includes("youtube_video") || (normPlatform === "youtube" && !normType.includes("short"));
    return { mediaType: "video", aspectRatio: isLandscape ? "16:9" : "9:16", description: "Video Asset" };
  }

  if (normType.includes("carousel") || normType.includes("idea") || normType.includes("multi") || normType.includes("document")) {
    const isPinterest = normPlatform === "pinterest";
    const isIdea = normType.includes("idea") || normType.includes("story");
    const aspect = isPinterest ? (isIdea ? "9:16" : "2:3") : normPlatform === "linkedin" ? "4:5" : "1:1";
    return { mediaType: "multi_image", aspectRatio: aspect, description: "Multi-Asset Story / Carousel" };
  }

  if (normPlatform === "pinterest") {
    return { mediaType: "image", aspectRatio: "2:3", description: "Pinterest Standard Image Pin (2:3)" };
  }

  if (normPlatform === "linkedin") {
    return { mediaType: "image", aspectRatio: "1.91:1", description: "LinkedIn Image Post" };
  }

  if (normPlatform === "x") {
    return { mediaType: "image", aspectRatio: "16:9", description: "X / Twitter Post Image" };
  }

  return { mediaType: "image", aspectRatio: normType.includes("story") ? "9:16" : "1:1", description: "Social Media Post Image" };
}
