"use server";

export interface StockHit {
  id: string;
  url: string;
  previewUrl: string;
  tags: string;
  type: "image" | "video";
}

export async function searchStockMedia(query: string = "business", mediaType: "image" | "video" = "image") {
  try {
    const searchTerm = (query && query.trim()) ? query.trim() : "business";
    const apiKey = process.env.PIXABAY_API_KEY || "48747442-d6c1b3f9b2d9d95f6e80b2a75";
    
    // Construct real Pixabay endpoint
    const endpoint = mediaType === "video"
      ? `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&per_page=20`
      : `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&image_type=photo&per_page=20`;

    const res = await fetch(endpoint, { cache: "no-store" });
    
    if (res.ok) {
      const data = await res.json();
      if (data.hits && data.hits.length > 0) {
        if (mediaType === "video") {
          const hits: StockHit[] = data.hits
            .filter((item: any) => item.videos?.medium?.url || item.videos?.small?.url || item.videos?.tiny?.url)
            .map((item: any) => ({
              id: String(item.id),
              url: item.videos?.medium?.url || item.videos?.small?.url || item.videos?.large?.url || "",
              previewUrl: item.videos?.tiny?.url || item.userImageURL || "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
              tags: item.tags || "stock video",
              type: "video",
            }));
          if (hits.length > 0) return { success: true, hits };
        } else {
          const hits: StockHit[] = data.hits.map((item: any) => ({
            id: String(item.id),
            url: item.largeImageURL || item.webformatURL,
            previewUrl: item.webformatURL || item.previewURL,
            tags: item.tags || "stock photo",
            type: "image",
          }));
          if (hits.length > 0) return { success: true, hits };
        }
      }
    }

    // Fallback search with generic term if niche query yields 0 results on Pixabay
    const fallbackEndpoint = mediaType === "video"
      ? `https://pixabay.com/api/videos/?key=${apiKey}&q=business&per_page=16`
      : `https://pixabay.com/api/?key=${apiKey}&q=business&image_type=photo&per_page=16`;
    
    const fallbackRes = await fetch(fallbackEndpoint, { cache: "no-store" });
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      if (fallbackData.hits && fallbackData.hits.length > 0) {
        if (mediaType === "video") {
          const hits: StockHit[] = fallbackData.hits.map((item: any) => ({
            id: String(item.id),
            url: item.videos?.medium?.url || item.videos?.small?.url || "",
            previewUrl: item.videos?.tiny?.url || item.userImageURL || "",
            tags: item.tags || "video",
            type: "video",
          }));
          return { success: true, hits };
        } else {
          const hits: StockHit[] = fallbackData.hits.map((item: any) => ({
            id: String(item.id),
            url: item.largeImageURL || item.webformatURL,
            previewUrl: item.webformatURL || item.previewURL,
            tags: item.tags || "photo",
            type: "image",
          }));
          return { success: true, hits };
        }
      }
    }

    return { success: true, hits: [] };
  } catch (error: any) {
    console.error("Stock media search error:", error);
    return { success: false, error: error.message || "Failed to fetch Pixabay stock media" };
  }
}
