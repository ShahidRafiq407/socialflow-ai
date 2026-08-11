"use server";

export interface StockHit {
  id: string;
  url: string;
  previewUrl: string;
  tags: string;
  type: "image" | "video";
}

// Ultra-fast instant curated stock database for instantaneous 0-delay response
const INSTANT_STOCK_DATABASE: Record<string, StockHit[]> = {
  business: [
    { id: "b1", url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80", tags: "business, analytics, growth", type: "image" },
    { id: "b2", url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80", tags: "team, meeting, office", type: "image" },
    { id: "b3", url: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=400&q=80", tags: "tech, laptop, startup", type: "image" },
    { id: "b4", url: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=400&q=80", tags: "executive, discussion", type: "image" },
    { id: "b5", url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=80", tags: "corporate, skyscraper", type: "image" },
    { id: "b6", url: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=400&q=80", tags: "strategy, roadmap", type: "image" },
  ],
  tech: [
    { id: "t1", url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80", tags: "tech, microchip, ai", type: "image" },
    { id: "t2", url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=400&q=80", tags: "code, matrix, cyber", type: "image" },
    { id: "t3", url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80", tags: "hardware, setup", type: "image" },
    { id: "t4", url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80", tags: "abstract, neon, 3d", type: "image" },
  ],
  robotics: [
    { id: "r1", url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=400&q=80", tags: "robotics, automation", type: "image" },
    { id: "r2", url: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=400&q=80", tags: "engineer, factory", type: "image" },
    { id: "r3", url: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&w=400&q=80", tags: "ai face, android", type: "image" },
  ],
  ecommerce: [
    { id: "e1", url: "https://images.unsplash.com/photo-1556742049-0a670fc8077a?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1556742049-0a670fc8077a?auto=format&fit=crop&w=400&q=80", tags: "payment, shopping", type: "image" },
    { id: "e2", url: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&q=80", tags: "store, retail", type: "image" },
  ],
  lifestyle: [
    { id: "l1", url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80", tags: "beach, travel", type: "image" },
    { id: "l2", url: "https://images.unsplash.com/photo-1511988617509-a57c8a288659?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1511988617509-a57c8a288659?auto=format&fit=crop&w=400&q=80", tags: "friends, outdoor", type: "image" },
  ],
  fitness: [
    { id: "f1", url: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80", tags: "gym, workout", type: "image" },
    { id: "f2", url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=400&q=80", tags: "fitness, training", type: "image" },
  ],
  realestate: [
    { id: "re1", url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=80", tags: "luxury house, estate", type: "image" },
    { id: "re2", url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80", previewUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80", tags: "interior, modern", type: "image" },
  ]
};

export async function searchStockMedia(query: string = "business", mediaType: "image" | "video" = "image") {
  try {
    const searchTerm = (query && query.trim()) ? query.trim().toLowerCase() : "business";
    
    // 1. Check instant curated database for 0ms speed response
    let instantCategory = "business";
    if (searchTerm.includes("tech") || searchTerm.includes("ai")) instantCategory = "tech";
    else if (searchTerm.includes("robot")) instantCategory = "robotics";
    else if (searchTerm.includes("e-commerce") || searchTerm.includes("shop")) instantCategory = "ecommerce";
    else if (searchTerm.includes("lifestyle") || searchTerm.includes("travel")) instantCategory = "lifestyle";
    else if (searchTerm.includes("fitness") || searchTerm.includes("gym")) instantCategory = "fitness";
    else if (searchTerm.includes("real estate") || searchTerm.includes("house")) instantCategory = "realestate";

    const instantHits = INSTANT_STOCK_DATABASE[instantCategory] || INSTANT_STOCK_DATABASE.business;

    // 2. Fetch Pixabay with high-performance revalidate cache & 3-second timeout guard
    const apiKey = process.env.PIXABAY_API_KEY || "48747442-d6c1b3f9b2d9d95f6e80b2a75";
    const endpoint = mediaType === "video"
      ? `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&per_page=16`
      : `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(searchTerm)}&image_type=photo&per_page=16`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s max timeout guard

    try {
      const res = await fetch(endpoint, {
        signal: controller.signal,
        next: { revalidate: 86400 } // Cache API response on edge server for 24 hours!
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.hits && data.hits.length > 0) {
          if (mediaType === "video") {
            const apiHits = data.hits.map((item: any) => ({
              id: String(item.id),
              url: item.videos?.medium?.url || item.videos?.small?.url || "",
              previewUrl: item.userImageURL || item.videos?.tiny?.url || "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
              tags: item.tags,
              type: "video" as const,
            }));
            return { success: true, hits: apiHits };
          } else {
            const apiHits = data.hits.map((item: any) => ({
              id: String(item.id),
              url: item.largeImageURL || item.webformatURL,
              previewUrl: item.webformatURL || item.previewURL,
              tags: item.tags,
              type: "image" as const,
            }));
            return { success: true, hits: apiHits };
          }
        }
      }
    } catch (e) {
      console.warn("Pixabay API request timed out or failed, serving instant curated database.");
    }

    // Fallback to instant curated hits
    return { success: true, hits: instantHits };
  } catch (error: any) {
    console.error("Stock media search error:", error);
    return {
      success: true,
      hits: INSTANT_STOCK_DATABASE.business
    };
  }
}
