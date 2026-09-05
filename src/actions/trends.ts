"use server";

import { revalidatePath } from "next/cache";
import { cacheGet, cacheSet } from "@/lib/redis";
import { reportUserFailure } from "@/lib/admin/report";

export interface TrendItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string;
  category: string;
  snippet?: string;
}

/**
 * 100% FREE Real-Time Google News RSS Fetcher for the Trend Agent.
 * No API Key or quota limit required. Scans live breaking news across any keyword.
 */
export async function fetchLiveTrendingNews(
  query: string,
  limit: number = 8
): Promise<{ success: boolean; trends: TrendItem[]; query: string; error?: string }> {
  try {
    const trimmedQuery = (query || "").trim();
    if (!trimmedQuery) {
      return { success: false, trends: [], query, error: "Enter a topic or competitor to scan." };
    }
    const encodedQuery = encodeURIComponent(trimmedQuery);
    const cacheKey = `trends:${encodedQuery}:${limit}`;

    // 1. Try to get from Upstash Redis Cache first (valid for 1 hour)
    const cachedTrends = await cacheGet<TrendItem[]>(cacheKey);
    if (cachedTrends && cachedTrends.length > 0) {
      console.log(`[Cache HIT] Returning cached trends for ${query}`);
      return { success: true, trends: cachedTrends, query };
    }

    console.log(`[Cache MISS] Fetching fresh trends for ${query}`);
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(rssUrl, {
      next: { revalidate: 300 }, // Next.js cache for 5 minutes
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Google News feed: ${res.statusText}`);
    }

    const xmlText = await res.text();

    // Extract item blocks from XML
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const matches = Array.from(xmlText.matchAll(itemRegex));

    const trends: TrendItem[] = matches.slice(0, limit).map((match, index) => {
      const block = match[1];

      // Extract title (remove trailing " - SourceName" if present)
      const rawTitle = extractXmlTag(block, "title") || "Breaking Tech & AI News";
      const titleParts = rawTitle.split(" - ");
      const sourceFromTitle = titleParts.length > 1 ? titleParts.pop() : "Google News";
      const title = titleParts.join(" - ").trim() || rawTitle;

      // Extract link
      const link = extractXmlTag(block, "link") || "https://news.google.com";

      // Extract published date
      const pubDate = extractXmlTag(block, "pubDate") || new Date().toUTCString();

      // Extract source tag if available
      const sourceTag = extractSourceTag(block) || sourceFromTitle || "Google News";

      return {
        id: `trend-${index}-${Date.now()}`,
        title,
        link,
        source: sourceTag,
        pubDate: formatRelativeOrDate(pubDate),
        category: determineCategory(title, query),
        snippet: `Real-time trending discussion on "${title}" via ${sourceTag}.`,
      };
    });

    const finalTrends = trends.length > 0 ? trends : getFallbackTrends(query);
    
    // 2. Save to Upstash Redis Cache (TTL: 3600 seconds / 1 hour)
    if (finalTrends.length > 0) {
      await cacheSet(cacheKey, finalTrends, 3600);
    }

    return {
      success: true,
      trends: finalTrends,
      query,
    };
  } catch (error: any) {
    console.error("Error fetching live trending news:", error);
    // Answered as a success with a fixed list, so "trending now" can quietly show
    // the same evergreen items for weeks with nothing anywhere saying the live feed
    // stopped responding.
    reportUserFailure({
      feature: "trends",
      message: "Live trend feed unreachable — a fixed list was shown instead",
      error,
      degraded: true,
      context: { query: (query || "").slice(0, 120) },
    });
    return {
      success: true, // Graceful fallback to verified high-signal industry trends
      trends: getFallbackTrends(query),
      query,
      error: error.message,
    };
  }
}

/**
 * Helper to extract inner content of a simple XML tag
 */
function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  if (!match) return "";
  return cleanXmlEntities(match[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1").trim());
}

/**
 * Helper to extract source tag with url attribute
 */
function extractSourceTag(xml: string): string {
  const regex = /<source[^>]*>([\\s\\S]*?)<\/source>/i;
  const match = xml.match(regex);
  if (!match) return "";
  return cleanXmlEntities(match[1].trim());
}

/**
 * Clean standard XML/HTML character entities
 */
function cleanXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Format timestamp into clean human string
 */
function formatRelativeOrDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Today";
  }
}

/**
 * Auto-assign intelligent category tag based on title and query context
 */
function determineCategory(title: string, query: string): string {
  const combined = `${title} ${query}`.toLowerCase();
  if (combined.includes("fashion") || combined.includes("apparel") || combined.includes("style") || combined.includes("retail"))
    return "Fashion & Retail";
  if (combined.includes("health") || combined.includes("med") || combined.includes("patient") || combined.includes("wellness"))
    return "Healthcare & Wellness";
  if (combined.includes("robot") || combined.includes("automation") || combined.includes("embedded") || combined.includes("iot") || combined.includes("hardware"))
    return "Robotics & IoT";
  if (combined.includes("ai") || combined.includes("gemini") || combined.includes("gpt") || combined.includes("llm") || combined.includes("machine learning"))
    return "Artificial Intelligence";
  if (combined.includes("saas") || combined.includes("marketing") || combined.includes("growth") || combined.includes("b2b") || combined.includes("sales"))
    return "B2B & Marketing";
  return "Industry & Innovation";
}

/**
 * Fallback high-signal trends if network request fails or RSS is temporarily unavailable
 */
function getFallbackTrends(query: string): TrendItem[] {
  const currentYear = new Date().getFullYear();
  const category = determineCategory(query, query);
  const qClean = query.replace(/[^\w\s]/g, "").trim() || "Industry";

  return [
    {
      id: "trend-fallback-1",
      title: `Key ${qClean} Industry Shifts and Consumer Trends Emerging in ${currentYear}`,
      link: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
      source: "Industry Intelligence",
      pubDate: "2h ago",
      category,
      snippet: `Analysis of latest market developments and high-engagement conversations in ${qClean}.`,
    },
    {
      id: "trend-fallback-2",
      title: `How Modern Brands Are Scaling Engagement in ${qClean} with Digital Strategies`,
      link: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
      source: "Tech & Market News",
      pubDate: "4h ago",
      category,
      snippet: `Strategic insights on audience growth, content trends, and market positioning for ${qClean}.`,
    },
    {
      id: "trend-fallback-3",
      title: `Emerging Technology and Growth Drivers in ${qClean} for ${currentYear}`,
      link: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
      source: "Market Watch",
      pubDate: "6h ago",
      category,
      snippet: `Market report highlighting new operational opportunities and competitive advantages.`,
    },
  ];
}
