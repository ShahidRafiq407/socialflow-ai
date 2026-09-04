export interface PlatformFormatSpec {
  mediaType: "image" | "video" | "text_only" | "multi_image";
  aspectRatio: "1:1" | "9:16" | "16:9" | "4:5" | "1.91:1" | "2:3";
  description: string;
}

export const PLATFORM_FORMAT_MAP: Record<string, Record<string, PlatformFormatSpec>> = {
  facebook: {
    feed: { mediaType: "image", aspectRatio: "1:1", description: "Facebook Feed Post Image" },
    reel: { mediaType: "video", aspectRatio: "9:16", description: "Facebook Reel Short Video" },
    // A Story is published through the SAME 9:16 vertical video render as Reels:
    // one family (video|vertical), one render, one caption. The Facebook publisher
    // already handles video stories (video_stories upload phases), and a story
    // that arrives as a video posts natively. It was mapped "image" before, which
    // split stories into their own still-image family and rendered a SECOND,
    // different vertical asset for what the user asked to be one campaign.
    story: { mediaType: "video", aspectRatio: "9:16", description: "Facebook Story Vertical Video" },
    "multiple photos": { mediaType: "multi_image", aspectRatio: "1:1", description: "Facebook Multiple Photos Post" },
    multiple_photos: { mediaType: "multi_image", aspectRatio: "1:1", description: "Facebook Multiple Photos Post" },
  },
  instagram: {
    feed: { mediaType: "image", aspectRatio: "1:1", description: "Instagram Feed Square Image" },
    carousel: { mediaType: "multi_image", aspectRatio: "1:1", description: "Instagram Carousel Multi-Slide Post" },
    reel: { mediaType: "video", aspectRatio: "9:16", description: "Instagram Reel Vertical Video" },
    // Same as Facebook stories: one vertical video family serves Reels AND
    // Stories. The Instagram publisher publishes STORIES containers with
    // video_url natively, and stories never carry a caption anyway — so the
    // family's shared caption simply is not displayed there.
    story: { mediaType: "video", aspectRatio: "9:16", description: "Instagram Story Vertical Video" },
  },
  tiktok: {
    video: { mediaType: "video", aspectRatio: "9:16", description: "TikTok Short Video" },
    feed: { mediaType: "video", aspectRatio: "9:16", description: "TikTok Short Video" },
    photo: { mediaType: "image", aspectRatio: "9:16", description: "TikTok Photo Post" },
  },
  linkedin: {
    // 1:1, not LinkedIn's 1.91:1 link-style ratio: a LinkedIn image post belongs
    // to the same SQUARE IMAGE family as Instagram/Facebook feed. At 1.91:1 it
    // split into its own landscape family, so one campaign rendered (and wrote)
    // a DIFFERENT creative for what the user asked to be one post everywhere.
    // Square displays natively on LinkedIn too, so nothing is lost visually.
    post: { mediaType: "image", aspectRatio: "1:1", description: "LinkedIn Professional Image" },
    feed: { mediaType: "image", aspectRatio: "1:1", description: "LinkedIn Feed Post Image" },
    carousel: { mediaType: "multi_image", aspectRatio: "1:1", description: "LinkedIn PDF Carousel Document" },
    "multi-image": { mediaType: "multi_image", aspectRatio: "1:1", description: "LinkedIn Multi-Image Post" },
    multi_image: { mediaType: "multi_image", aspectRatio: "1:1", description: "LinkedIn Multi-Image Post" },
    document: { mediaType: "multi_image", aspectRatio: "1:1", description: "LinkedIn Document / PDF Carousel" },
    video: { mediaType: "video", aspectRatio: "9:16", description: "LinkedIn Reel / Video" },
    article: { mediaType: "text_only", aspectRatio: "1.91:1", description: "LinkedIn Longform Article" },
  },
  youtube: {
    short: { mediaType: "video", aspectRatio: "9:16", description: "YouTube Short Video" },
    shorts: { mediaType: "video", aspectRatio: "9:16", description: "YouTube Shorts Video" },
    video: { mediaType: "video", aspectRatio: "16:9", description: "YouTube Landscape Video" },
    community: { mediaType: "image", aspectRatio: "1:1", description: "YouTube Community Post Image" },
  },
  pinterest: {
    pin: { mediaType: "image", aspectRatio: "2:3", description: "Pinterest Vertical Pin Image" },
    "video pin": { mediaType: "video", aspectRatio: "9:16", description: "Pinterest Video Pin" },
    video_pin: { mediaType: "video", aspectRatio: "9:16", description: "Pinterest Video Pin" },
    videopin: { mediaType: "video", aspectRatio: "9:16", description: "Pinterest Video Pin" },
    ideapin: { mediaType: "multi_image", aspectRatio: "9:16", description: "Pinterest Idea Pin Multi-Slide Visual" },
    "idea pin": { mediaType: "multi_image", aspectRatio: "9:16", description: "Pinterest Idea Pin Multi-Slide Visual" },
    idea_pin: { mediaType: "multi_image", aspectRatio: "9:16", description: "Pinterest Idea Pin Multi-Slide Visual" },
    carousel: { mediaType: "multi_image", aspectRatio: "2:3", description: "Pinterest Carousel Multi-Slide Pin" },
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

  // Informational multi-slide formats (carousel / idea pin / multi-image / document)
  // render as a deck of text-rich designed slides, not one decorative image.
  if (normType.includes("document")) {
    return { mediaType: "multi_image", aspectRatio: "1:1", description: "Document / PDF Carousel Pages" };
  }

  if (
    normType.includes("carousel") ||
    normType.includes("idea") ||
    normType.includes("multi") ||
    normType.includes("multiple photos")
  ) {
    return { mediaType: "multi_image", aspectRatio: "9:16", description: "Multi-Slide Visual Post" };
  }

  return { mediaType: "image", aspectRatio: "1:1", description: "Social Media Post Image" };
}
