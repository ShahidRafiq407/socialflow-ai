"use server";

import { auth } from "@clerk/nextjs/server";

export async function searchStockMedia(query: string, mediaType: "image" | "video" = "image") {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const apiKey = process.env.PIXABAY_API_KEY || "48747442-d6c1b3f9b2d9d95f6e80b2a75"; // Public fallback key or env
    const endpoint = mediaType === "video"
      ? `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=12`
      : `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=12`;

    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) {
      throw new Error(`Pixabay API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (mediaType === "video") {
      const hits = (data.hits || []).map((item: any) => ({
        id: item.id,
        url: item.videos?.small?.url || item.videos?.medium?.url || "",
        previewUrl: item.videos?.tiny?.url || item.userImageURL || "",
        tags: item.tags,
        type: "video",
      }));
      return { success: true, hits };
    } else {
      const hits = (data.hits || []).map((item: any) => ({
        id: item.id,
        url: item.largeImageURL || item.webformatURL,
        previewUrl: item.previewURL || item.webformatURL,
        tags: item.tags,
        type: "image",
      }));
      return { success: true, hits };
    }
  } catch (error: any) {
    console.error("Stock media search error:", error);
    return { success: false, error: error.message || "Failed to fetch stock media" };
  }
}
