/**
 * READING A PAGE, ONCE, FOR EVERYONE
 *
 * Five stages need to look at a web page: the business stage reads the site, the
 * evidence gate fetches the source behind a claim, the links stage checks a
 * destination resolves, the inventory stage crawls, and the overlap stage compares
 * against pages that already exist. They all need the same three things — a
 * timeout, a public-address check, and readable text rather than markup.
 *
 * Nothing here throws. A page that cannot be read comes back with the reason on
 * it, because every one of those stages has something honest to say about a
 * failed fetch and none of them should collapse the run over it.
 */

import * as cheerio from "cheerio";
import { assertPublicHttpUrl } from "@/lib/cms/types";

export interface FetchedPage {
  url: string;
  /** 0 when the request never completed. */
  status: number;
  ok: boolean;
  title: string;
  /** Readable text: script, style, nav and footer removed, whitespace collapsed. */
  text: string;
  /** The page's own dateline, when it publishes one. */
  publishedAt?: string;
  headings: string[];
  /** Same-origin links found on the page, absolute and de-duplicated. */
  links: string[];
  /** Why it could not be read. Present only on failure. */
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_CHARS = 20_000;

/** A browser user agent, because a plain fetch is blocked by most edge providers. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function fail(url: string, status: number, error: string): FetchedPage {
  return { url, status, ok: false, title: "", text: "", headings: [], links: [], error };
}
export async function fetchPage(
  rawUrl: string,
  options: { timeoutMs?: number; maxChars?: number; signal?: AbortSignal } = {}
): Promise<FetchedPage> {
  let url: URL;
  try {
    url = assertPublicHttpUrl(rawUrl, "The page URL");
  } catch (error: any) {
    return fail(String(rawUrl || ""), 0, error?.message || "That URL cannot be fetched.");
  }

  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (error: any) {
    const aborted = error?.name === "AbortError" || error?.name === "TimeoutError";
    return fail(
      url.toString(),
      0,
      aborted
        ? `No response within ${Math.round((options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000)} seconds.`
        : `The request failed: ${error?.message || "unknown network error"}.`
    );
  }

  if (!response.ok) {
    return fail(url.toString(), response.status, `The page returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
    return fail(url.toString(), response.status, `That URL is ${contentType.split(";")[0]}, not a readable page.`);
  }
  let raw: string;
  try {
    raw = await response.text();
  } catch (error: any) {
    return fail(url.toString(), response.status, `The page body could not be read: ${error?.message || "unknown error"}.`);
  }

  const $ = cheerio.load(raw);

  // Links are collected before the chrome is stripped: the nav is exactly where a
  // site lists its own service pages, which is what the crawl needs to follow.
  const links = new Set<string>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      const resolved = new URL(href, url);
      if (resolved.hostname === url.hostname && links.size < 200) {
        resolved.hash = "";
        links.add(resolved.toString());
      }
    } catch {
      // A malformed href is not a link. Nothing to record.
    }
  });

  $("script, style, noscript, template, svg, nav, header, footer, aside, form").remove();

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    "";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text && headings.length < 60) headings.push(text);
  });

  // The dateline, from the places a page actually states one. A URL with a year
  // in it is not a date, so it is not read as one.
  const publishedAt =
    $('meta[property="article:published_time"]').attr("content")?.trim() ||
    $("time[datetime]").first().attr("datetime")?.trim() ||
    $('meta[itemprop="datePublished"]').attr("content")?.trim() ||
    undefined;

  const body = $("main").text() || $("article").text() || $("body").text() || "";
  const text = body.replace(/\s+/g, " ").trim().slice(0, options.maxChars ?? DEFAULT_MAX_CHARS);

  return {
    url: url.toString(),
    status: response.status,
    ok: true,
    title,
    text,
    publishedAt,
    headings,
    links: Array.from(links),
  };
}

/** Several pages at once, with a cap so a crawl cannot fan out without limit. */
export async function fetchPages(
  urls: string[],
  options: { timeoutMs?: number; maxChars?: number; signal?: AbortSignal; limit?: number } = {}
): Promise<FetchedPage[]> {
  const unique = Array.from(new Set(urls.map((url) => String(url || "").trim()).filter(Boolean)));
  const capped = unique.slice(0, Math.max(1, options.limit ?? 6));
  return Promise.all(capped.map((url) => fetchPage(url, options)));
}

