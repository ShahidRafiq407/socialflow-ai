"use server";

export interface StockHit {
  id: string;
  url: string;
  previewUrl: string;
  tags: string;
  type: "image" | "video";
}

export async function searchStockMedia(
  query: string = "business",
  mediaType: "image" | "video" = "image",
  page: number = 1,
  perPage: number = 50,
  order: "popular" | "latest" = "popular",
  orientation: "all" | "horizontal" | "vertical" = "all"
) {
  try {
    const searchTerm = (query && query.trim()) ? query.trim() : "business";
    const apiKey = process.env.PIXABAY_API_KEY || "48747442-d6c1b3f9b2d9d95f6e80b2a75";
    
    // Construct real Pixabay endpoint (matching website parameters)
    const orientationParam = orientation === "all" ? "" : `&orientation=${orientation}`;
    const videoPerPage = Math.min(200, perPage * 2); // fetch more videos to account for manual filtering
    const endpoint = mediaType === "video"
      ? `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&page=${page}&per_page=${videoPerPage}&order=${order}&safesearch=true`
      : `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&image_type=all&page=${page}&per_page=${perPage}&order=${order}&safesearch=true${orientationParam}`;

    const res = await fetch(endpoint, { cache: "no-store" });
    
    if (res.ok) {
      const data = await res.json();
      // data.total is the complete Pixabay database count (e.g., 10,136 on website)
      const totalHits = data.total || data.totalHits || 0;
      
      if (data.hits && data.hits.length > 0) {
        if (mediaType === "video") {
          let filteredHits = data.hits.filter((item: any) => item.videos?.medium?.url || item.videos?.small?.url || item.videos?.tiny?.url);
          
          if (orientation === "horizontal") {
            filteredHits = filteredHits.filter((item: any) => {
              const v = item.videos?.medium || item.videos?.large || item.videos?.small;
              return v && v.width > v.height;
            });
          } else if (orientation === "vertical") {
            filteredHits = filteredHits.filter((item: any) => {
              const v = item.videos?.medium || item.videos?.large || item.videos?.small;
              return v && v.height > v.width;
            });
          }

          const hits: StockHit[] = filteredHits.map((item: any) => ({
            id: String(item.id),
            url: item.videos?.medium?.url || item.videos?.small?.url || item.videos?.large?.url || item.videos?.tiny?.url || "",
            previewUrl: item.videos?.tiny?.url || item.videos?.small?.url || item.userImageURL || "",
            tags: item.tags || "stock video",
            type: "video",
          }));
          if (hits.length > 0) return { success: true, hits, totalHits };
        } else {
          const hits: StockHit[] = data.hits.map((item: any) => ({
            id: String(item.id),
            url: item.largeImageURL || item.fullHDURL || item.webformatURL,
            previewUrl: item.webformatURL || item.previewURL,
            tags: item.tags || "stock photo",
            type: "image",
          }));
          if (hits.length > 0) return { success: true, hits, totalHits };
        }
      }
    }

    // Fallback search if niche query yields 0 results
    const fallbackEndpoint = mediaType === "video"
      ? `https://pixabay.com/api/videos/?key=${apiKey}&q=business&page=1&per_page=60&order=popular&safesearch=true`
      : `https://pixabay.com/api/?key=${apiKey}&q=business&image_type=all&page=1&per_page=30&order=popular&safesearch=true${orientationParam}`;
    
    const fallbackRes = await fetch(fallbackEndpoint, { cache: "no-store" });
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      const totalHits = fallbackData.total || fallbackData.totalHits || 0;
      if (fallbackData.hits && fallbackData.hits.length > 0) {
        if (mediaType === "video") {
          const hits: StockHit[] = fallbackData.hits.map((item: any) => ({
            id: String(item.id),
            url: item.videos?.medium?.url || item.videos?.small?.url || "",
            previewUrl: item.videos?.tiny?.url || item.userImageURL || "",
            tags: item.tags || "video",
            type: "video",
          }));
          return { success: true, hits, totalHits };
        } else {
          const hits: StockHit[] = fallbackData.hits.map((item: any) => ({
            id: String(item.id),
            url: item.largeImageURL || item.webformatURL,
            previewUrl: item.webformatURL || item.previewURL,
            tags: item.tags || "photo",
            type: "image",
          }));
          return { success: true, hits, totalHits };
        }
      }
    }

    return { success: true, hits: [], totalHits: 0 };
  } catch (error: any) {
    console.error("Stock media search error:", error);
    return { success: false, error: error.message || "Failed to fetch Pixabay stock media", totalHits: 0 };
  }
}
