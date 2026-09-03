"use server";

import { getSerperKey, hasSerperKey, SERPER_MISSING_MESSAGE } from "@/lib/apiKeys";

export interface SerpResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  /** Real word count of the competitor page, when it could be fetched. */
  wordCount?: number;
  /** Real H2 + H3 count of the competitor page, when it could be fetched. */
  headingCount?: number;
  /** Headings we actually read off the page — used to find topical gaps. */
  headings?: string[];
}

export interface SerpAnalysis {
  keyword: string;
  topResults: SerpResult[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  /** Mean word count of the competitor pages we could measure. 0 = unknown. */
  estimatedAvgWordCount: number;
  /** Mean heading count of the competitor pages we could measure. 0 = unknown. */
  estimatedHeadingCount: number;
  /** How many competitor pages the two averages above were measured from. */
  measuredPages: number;
  /** Country / language actually used for the query. */
  gl: string;
  hl: string;
}

/** ISO-3166 alpha-2 → Serper `gl`. "WW" (worldwide) has no country bias. */
function resolveGeo(targetCountry?: string): { gl: string; hl: string } {
  const raw = (targetCountry || "").trim().toUpperCase();
  if (!raw || raw === "WW" || raw === "ALL") return { gl: "", hl: "en" };
  if (!/^[A-Z]{2}$/.test(raw)) return { gl: "", hl: "en" };
  return { gl: raw.toLowerCase(), hl: "en" };
}

function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(html: string): string[] {
  const out: string[] = [];
  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripToText(m[2]).slice(0, 140);
    if (text) out.push(text);
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * Measures a competitor page for real: word count and H2/H3 structure.
 *
 * Deliberately best-effort — a page behind Cloudflare or a JS-only renderer just
 * returns null, and the caller averages over whatever did come back rather than
 * inventing a number.
 */
async function measureCompetitorPage(
  url: string,
  timeoutMs: number
): Promise<{ wordCount: number; headingCount: number; headings: string[] } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        // Some CDNs return 403 to header-less requests; a plain desktop UA is enough.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (contentType && !contentType.includes("html")) return null;

    const html = (await res.text()).slice(0, 900_000);
    // Prefer the <body> so nav/head boilerplate does not inflate the count.
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : html;

    const text = stripToText(body);
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const headings = extractHeadings(body);

    if (wordCount < 120) return null; // consent wall / redirect stub, not an article
    return { wordCount, headingCount: headings.length, headings };
  } catch {
    return null;
  }
}

export async function fetchSerpAnalysis(
  keyword: string,
  options?: {
    targetCountry?: string;
    /** Fetch competitor pages to measure real length/structure. Default true. */
    measureCompetitors?: boolean;
    /** How many competitor pages to measure. Default 5, max 8. */
    measureCount?: number;
  }
): Promise<{ success: boolean; data?: SerpAnalysis; error?: string }> {
  const key = getSerperKey();
  if (!hasSerperKey()) {
    return { success: false, error: SERPER_MISSING_MESSAGE };
  }

  const { gl, hl } = resolveGeo(options?.targetCountry);

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: keyword,
        ...(gl ? { gl } : {}),
        hl,
        num: 10,
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Serper.dev rejected the API key. Check SERPER_API_KEY.");
      }
      throw new Error(`Failed to fetch SERP analysis: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    const topResults: SerpResult[] = (json.organic || []).map((item: any, idx: number) => ({
      position: Number(item.position) || idx + 1,
      title: item.title || "",
      link: item.link || "",
      snippet: item.snippet || "",
    }));

    const peopleAlsoAsk: string[] = (json.peopleAlsoAsk || [])
      .map((item: any) => item?.question)
      .filter((q: any): q is string => typeof q === "string" && q.length > 0);
    const relatedSearches: string[] = (json.relatedSearches || [])
      .map((item: any) => item?.query)
      .filter((q: any): q is string => typeof q === "string" && q.length > 0);

    // ── Real competitor measurement ────────────────────────────────────────────
    // The old build shipped `estimatedAvgWordCount = 1800` as a constant, which
    // meant every "beat the competition" target was fiction. These numbers are
    // now read off the pages that actually rank.
    let estimatedAvgWordCount = 0;
    let estimatedHeadingCount = 0;
    let measuredPages = 0;

    const shouldMeasure = options?.measureCompetitors !== false;
    if (shouldMeasure && topResults.length > 0) {
      const limit = Math.min(8, Math.max(1, options?.measureCount ?? 5));
      const candidates = topResults
        .filter((r) => /^https?:\/\//i.test(r.link) && !/\.(pdf|docx?|pptx?)($|\?)/i.test(r.link))
        .slice(0, limit);

      const measured = await Promise.all(
        candidates.map((r) => measureCompetitorPage(r.link, 7000))
      );

      let wordSum = 0;
      let headingSum = 0;
      measured.forEach((m, i) => {
        if (!m) return;
        const target = topResults.find((r) => r.link === candidates[i].link);
        if (target) {
          target.wordCount = m.wordCount;
          target.headingCount = m.headingCount;
          target.headings = m.headings.slice(0, 15);
        }
        wordSum += m.wordCount;
        headingSum += m.headingCount;
        measuredPages++;
      });

      if (measuredPages > 0) {
        estimatedAvgWordCount = Math.round(wordSum / measuredPages);
        estimatedHeadingCount = Math.round(headingSum / measuredPages);
      }
    }

    const data: SerpAnalysis = {
      keyword,
      topResults,
      peopleAlsoAsk,
      relatedSearches,
      estimatedAvgWordCount,
      estimatedHeadingCount,
      measuredPages,
      gl: gl || "ww",
      hl,
    };

    return { success: true, data };
  } catch (error: any) {
    console.error("Error fetching SERP analysis:", error?.message || error);
    return { success: false, error: error?.message || "SERP analysis failed." };
  }
}
