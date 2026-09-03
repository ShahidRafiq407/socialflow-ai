/**
 * INTERNAL LINK DISCOVERY
 *
 * The article writer is only allowed to link to URLs that exist, so this module
 * goes and finds them. Nothing here guesses a URL: every candidate comes back
 * from the site's own WordPress search endpoint or its own sitemap.
 *
 * Two sources, in order of quality:
 *   1. `/wp-json/wp/v2/search` — the site's own relevance ranking for the
 *      keyword, and it returns the page title, which makes a better anchor.
 *   2. `sitemap.xml` (and the index / robots.txt variants) — works for any CMS,
 *      including a hand-coded site, but has to be ranked locally by slug.
 *
 * A site that answers neither returns an empty list and a note explaining why.
 * An empty list is correct behaviour: the article then ships with no internal
 * links and says so, instead of linking to a URL that 404s.
 */

/** Words too common to signal relevance in a slug. */
const STOPWORDS = new Set([
  "with", "from", "that", "this", "your", "have", "will", "what", "when",
  "which", "about", "into", "they", "them", "their", "there", "here", "been",
  "best", "guide", "complete", "ultimate", "https", "http", "html", "index",
  "page", "post", "blog", "www",
]);

/** URL shapes that are never a useful link target from inside an article. */
const SKIP_PATTERNS = [
  /\/wp-(content|admin|includes|json)\//i,
  /\/(feed|rss|atom|comments|trackback)\/?$/i,
  /\/(category|tag|author|tags|categories|topics)\//i,
  /\/page\/\d+\/?$/i,
  /[?&](replytocom|share|utm_)/i,
  /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|xml)$/i,
  /\/(cart|checkout|account|login|register|wp-login\.php|privacy|terms|cookie)/i,
];

export interface InternalLinkCandidate {
  url: string;
  title?: string;
  source: "wp-search" | "sitemap";
}

export interface DiscoverInternalLinksInput {
  siteUrl: string;
  keyword: string;
  /** Article title, used for relevance scoring only. */
  context?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface DiscoverInternalLinksResult {
  candidates: InternalLinkCandidate[];
  /** Why the list is short or empty. Surfaced to the editor, never swallowed. */
  note?: string;
}

export function originOf(siteUrl: string): string | null {
  const raw = String(siteUrl || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url.host) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Meaningful words from a phrase, for slug matching. */
export function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      String(value || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
    )
  );
}

/** True for URLs on this site that a reader could usefully be sent to. */
export function isContentUrl(url: string, origin: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const home = originOf(origin);
  if (!home || `${parsed.protocol}//${parsed.host}` !== home) return false;
  if (parsed.pathname === "/" || parsed.pathname === "") return false;
  return !SKIP_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Relevance of one page to the keyword. Slug matches count double: a word in the
 * URL is a stronger topical signal than the same word in a long title, and it is
 * the only signal a sitemap-only site gives us.
 */
export function scoreCandidate(url: string, title: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  let score = 0;
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  const heading = String(title || "").toLowerCase();
  for (const token of tokens) {
    if (path.includes(token)) score += 2;
    else if (heading.includes(token)) score += 1;
  }
  // A shallower URL is usually a more important page.
  const depth = path.split("/").filter(Boolean).length;
  return score - Math.max(0, depth - 2) * 0.25;
}

/** `<loc>` values from a sitemap or sitemap index, in document order. */
export function parseSitemapLocations(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(xml || ""))) !== null) {
    const url = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (url) out.push(url);
  }
  return out;
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(String(xml || ""));
}

/**
 * Ranks and trims discovered pages.
 *
 * Pages that match the keyword come first. When nothing matches, the list is
 * still returned in discovery order rather than dropped — a relevant-enough
 * "related reading" link from the same site is legitimate, and the model still
 * has to write an anchor phrase that fits the sentence.
 */
export function rankCandidates(
  candidates: InternalLinkCandidate[],
  keyword: string,
  context: string | undefined,
  limit: number
): InternalLinkCandidate[] {
  const tokens = tokenize(`${keyword} ${context || ""}`);
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = c.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const scored = unique
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidate(candidate.url, candidate.title || "", tokens),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.slice(0, Math.max(1, limit)).map((s) => s.candidate);
}

// ---------------------------------------------------------------------------
// FETCHERS
// ---------------------------------------------------------------------------

const USER_AGENT = "PostloomArticleWriter/1.0 (+internal-link-discovery)";

async function getText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** The site's own relevance ranking, with real page titles for anchors. */
async function wordPressSearch(
  origin: string,
  keyword: string,
  limit: number,
  timeoutMs: number
): Promise<InternalLinkCandidate[]> {
  const endpoint =
    `${origin}/wp-json/wp/v2/search` +
    `?search=${encodeURIComponent(keyword)}` +
    `&subtype=post,page&per_page=${Math.min(20, Math.max(3, limit * 2))}&_fields=url,title,subtype`;

  const body = await getText(endpoint, timeoutMs);
  if (!body) return [];

  let rows: any[];
  try {
    rows = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => ({
      url: String(row?.url || "").trim(),
      title: String(row?.title || "").replace(/<[^>]+>/g, "").trim() || undefined,
      source: "wp-search" as const,
    }))
    .filter((row) => isContentUrl(row.url, origin));
}

/** Sitemap URLs advertised in robots.txt, plus the conventional locations. */
async function sitemapEntryPoints(origin: string, timeoutMs: number): Promise<string[]> {
  const found: string[] = [];
  const robots = await getText(`${origin}/robots.txt`, Math.min(4000, timeoutMs));
  if (robots) {
    for (const line of robots.split(/\r?\n/)) {
      const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
      if (match?.[1]) found.push(match[1].trim());
    }
  }
  for (const path of ["/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml", "/sitemap-index.xml"]) {
    found.push(`${origin}${path}`);
  }
  return Array.from(new Set(found)).slice(0, 6);
}

/** Real page URLs from the site's sitemap. Works for any CMS, including none. */
async function sitemapPages(
  origin: string,
  limit: number,
  timeoutMs: number
): Promise<InternalLinkCandidate[]> {
  const out: InternalLinkCandidate[] = [];
  const wanted = Math.max(limit * 6, 40);

  for (const entry of await sitemapEntryPoints(origin, timeoutMs)) {
    const xml = await getText(entry, timeoutMs);
    if (!xml) continue;

    const locations = parseSitemapLocations(xml);
    if (locations.length === 0) continue;

    if (isSitemapIndex(xml)) {
      // Prefer child sitemaps whose name suggests posts or pages over product feeds.
      const children = locations
        .sort((a, b) => {
          const rank = (u: string) => (/(post|page|article|blog)/i.test(u) ? 0 : 1);
          return rank(a) - rank(b);
        })
        .slice(0, 3);
      for (const child of children) {
        const childXml = await getText(child, timeoutMs);
        if (!childXml) continue;
        for (const url of parseSitemapLocations(childXml)) {
          if (isContentUrl(url, origin)) out.push({ url, source: "sitemap" });
          if (out.length >= wanted) break;
        }
        if (out.length >= wanted) break;
      }
    } else {
      for (const url of locations) {
        if (isContentUrl(url, origin)) out.push({ url, source: "sitemap" });
        if (out.length >= wanted) break;
      }
    }

    if (out.length > 0) break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// PUBLIC ENTRY POINT
// ---------------------------------------------------------------------------

/**
 * Finds real pages on the user's own site that the new article can link to.
 *
 * Never throws and never invents: an unreachable site, a site with no sitemap and
 * no WordPress API, or a brand-new site with one page all return an empty list
 * and a note. The generator turns that into a visible warning on the article.
 */
export async function discoverInternalLinkCandidates(
  input: DiscoverInternalLinksInput
): Promise<DiscoverInternalLinksResult> {
  const limit = Math.max(1, Math.min(20, input.limit ?? 8));
  const timeoutMs = Math.max(2000, Math.min(15000, input.timeoutMs ?? 6000));
  const origin = originOf(input.siteUrl);

  if (!origin) {
    return { candidates: [], note: "No publishing website is set, so no internal links were found." };
  }

  try {
    const fromWp = await wordPressSearch(origin, input.keyword, limit, timeoutMs);
    if (fromWp.length > 0) {
      return { candidates: rankCandidates(fromWp, input.keyword, input.context, limit) };
    }

    const fromSitemap = await sitemapPages(origin, limit, timeoutMs);
    if (fromSitemap.length > 0) {
      return { candidates: rankCandidates(fromSitemap, input.keyword, input.context, limit) };
    }

    return {
      candidates: [],
      note: `No pages could be read from ${origin}. Check that its sitemap is reachable, or connect it as a publishing target.`,
    };
  } catch (err) {
    console.warn("[internalLinks] discovery failed:", (err as any)?.message || err);
    return { candidates: [], note: "Internal link discovery failed, so none were added." };
  }
}
