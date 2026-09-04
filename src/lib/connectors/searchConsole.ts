// ============================================================================
// GOOGLE SEARCH CONSOLE — server-only. Read-only, by scope.
//
// The only scope this asks for is `webmasters.readonly`, so nothing in this file
// can change a property, submit a sitemap or touch a site. It reads two things:
// which properties the connected account can see, and what a page was found for.
//
// The token minting is `googleApiRequest` next door, shared with Gmail and Drive:
// same credential shape, same in-process access-token cache, same sentence for a
// 403 that means "the API is not enabled on your Cloud project".
//
// Three things about this API that the code has to respect rather than assume:
//
//   1. Dates are Pacific Time, and recent days are incomplete. Asking with
//      `dataState: "all"` returns the fresh numbers *and* `first_incomplete_date`,
//      so the screen can say which days are still being counted instead of
//      presenting a half-counted Tuesday as a drop.
//   2. `equals` on `page` is case-sensitive and exact. A trailing slash is a
//      different URL, so a page is tried in both forms rather than guessed at.
//   3. Rows are Search Console's top rows, not an exhaustive set. A query that is
//      not here is not proof the page never appeared for it.
//
// https://developers.google.com/webmaster-tools/v1/searchanalytics/query
// ============================================================================

import { googleApiRequest, type GoogleCredentials } from "./google";

/** The one scope this connector needs. Quoted in the setup guide, so it is here once. */
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const API = "https://www.googleapis.com/webmasters/v3";

/** A property in the connected account, and whether it can actually return data. */
export interface SearchConsoleProperty {
  /** `https://example.com/` for a URL prefix, `sc-domain:example.com` for a domain. */
  siteUrl: string;
  permissionLevel: string;
  /** An unverified user is listed but has no data to read. */
  readable: boolean;
}

/** One row exactly as the API returns it: the keys in the order asked for. */
export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  /** 0..1, as reported. Never recomputed from clicks/impressions. */
  ctr: number;
  position: number;
}

// ---------------------------------------------------------------------------
// PURE HELPERS — no network, exported because they are where the mistakes are
// ---------------------------------------------------------------------------

/**
 * A page URL in the form Search Console reports and this app stores.
 *
 * Scheme and host lowercased, default port dropped, query and fragment removed.
 * The path is left exactly as written: `equals` on `page` is case-sensitive, so
 * lowercasing `/Blog/Post` here would silently ask about a URL that does not
 * exist. Returns "" for anything that is not an http(s) URL.
 */
export function normalizePageUrl(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`;
  } catch {
    return "";
  }
}

/**
 * The forms of one page worth asking about, most likely first.
 *
 * Google indexes `/guide` and `/guide/` as different URLs and this API's `equals`
 * agrees, so the alternative is tried rather than assumed away — the cost is one
 * extra request only when the first form has no data at all.
 */
export function pageMatchCandidates(page: string): string[] {
  const url = normalizePageUrl(page);
  if (!url) return [];
  const alternate = url.endsWith("/") ? url.slice(0, -1) : `${url}/`;
  // Stripping the slash off a bare origin gives "https://example.com", which is
  // the same page, so it is still worth a second ask; an empty path is not.
  return alternate && alternate !== url ? [url, alternate] : [url];
}

/**
 * Which of the account's properties covers this page.
 *
 * A workspace can have both `sc-domain:example.com` and `https://example.com/blog/`
 * verified, and the numbers are the same either way — but a property that does not
 * cover the page returns nothing at all rather than an error, which is the failure
 * mode this exists to prevent. The most specific URL prefix wins; a domain
 * property is the fallback, because it covers subdomains and both schemes.
 *
 * Unverified properties are skipped: they are listed by the API and have no data.
 */
export function resolveProperty(
  page: string,
  properties: SearchConsoleProperty[]
): SearchConsoleProperty | null {
  const url = normalizePageUrl(page);
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return null;
  }

  let prefixHit: { property: SearchConsoleProperty; length: number } | null = null;
  let domainHit: { property: SearchConsoleProperty; length: number } | null = null;

  for (const property of properties) {
    if (!property.readable) continue;
    const site = property.siteUrl.trim();

    if (site.toLowerCase().startsWith("sc-domain:")) {
      const domain = site.slice("sc-domain:".length).toLowerCase();
      if (!domain) continue;
      if (host === domain || host.endsWith(`.${domain}`)) {
        if (!domainHit || domain.length > domainHit.length) {
          domainHit = { property, length: domain.length };
        }
      }
      continue;
    }

    const prefix = normalizePageUrl(site);
    if (!prefix) continue;
    if (url === prefix || url.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)) {
      if (!prefixHit || prefix.length > prefixHit.length) {
        prefixHit = { property, length: prefix.length };
      }
    }
  }

  return prefixHit?.property ?? domainHit?.property ?? null;
}

/** `YYYY-MM-DD`, which is the only date format this API accepts. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A start/end pair covering the last `days` days, ending today.
 *
 * Today is included deliberately. Search Console's own boundary comes back as
 * `incompleteFrom`, so the caller can label the unfinished days instead of this
 * function guessing at a lag that has changed twice in the product's life.
 */
export function dayRange(days: number): { startDate: string; endDate: string } {
  const span = Math.min(Math.max(Math.round(days) || 28, 1), 480);
  const end = new Date();
  const start = new Date(end.getTime() - (span - 1) * 86_400_000);
  return { startDate: isoDay(start), endDate: isoDay(end) };
}

// ---------------------------------------------------------------------------
// NETWORK
// ---------------------------------------------------------------------------

/** The `sites.list` shape, as much of it as this file uses. */
interface SiteListResponse {
  siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
}

/**
 * Every property the connected account can see, verified or not.
 *
 * `siteUnverifiedUser` is included rather than filtered out, with `readable: false`,
 * because "you are listed on this property but cannot read it" is a different
 * problem from "this property does not exist" and the setup screen should be able
 * to say which one happened.
 */
export async function listProperties(
  creds: GoogleCredentials
): Promise<{ success: boolean; properties?: SearchConsoleProperty[]; error?: string }> {
  const res = await googleApiRequest<SiteListResponse>(creds, `${API}/sites`);
  if (!res.ok) return { success: false, error: res.error };

  const properties = (res.data?.siteEntry || [])
    .map((entry) => {
      const siteUrl = typeof entry.siteUrl === "string" ? entry.siteUrl.trim() : "";
      const permissionLevel =
        typeof entry.permissionLevel === "string" ? entry.permissionLevel.trim() : "";
      return {
        siteUrl,
        permissionLevel,
        readable: !!siteUrl && permissionLevel !== "siteUnverifiedUser",
      } satisfies SearchConsoleProperty;
    })
    .filter((property) => !!property.siteUrl)
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));

  return { success: true, properties };
}
/**
 * Verifies the credentials by listing properties, for the connector tester.
 *
 * An account with credentials that work but no readable property is treated as a
 * failure, not a warning. The connector's only job is reading performance for a
 * page, and an account verified on nothing can never do that — better to say so
 * while the person is still on the setup screen with the Cloud Console open.
 */
export async function getSearchConsoleAccount(
  creds: GoogleCredentials
): Promise<{
  success: boolean;
  accountLabel?: string;
  properties?: SearchConsoleProperty[];
  error?: string;
}> {
  const res = await listProperties(creds);
  if (!res.success) return { success: false, error: res.error };

  const all = res.properties || [];
  const readable = all.filter((property) => property.readable);

  if (readable.length === 0) {
    return {
      success: false,
      error:
        all.length === 0
          ? "The credentials work, but this Google account is not verified on any Search Console property."
          : `This account is listed on ${all.length} propert${all.length === 1 ? "y" : "ies"} as an unverified user, so none of them return data. Verify ownership in Search Console first.`,
    };
  }

  const first = readable[0].siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return {
    success: true,
    accountLabel: readable.length === 1 ? first : `${first} +${readable.length - 1} more`,
    properties: all,
  };
}
/** The `searchAnalytics.query` shape, plus the metadata that dates the fresh days. */
interface QueryResponse {
  rows?: Array<Record<string, unknown>>;
  metadata?: { first_incomplete_date?: string; first_incomplete_hour?: string };
}

/** One filter, in the API's own vocabulary. */
interface DimensionFilter {
  dimension: "page" | "query" | "country" | "device";
  operator: "equals" | "contains" | "notContains" | "notEquals";
  expression: string;
}

const MAX_ROWS = 25_000;

/** Numbers arrive as JSON numbers; anything else is a zero rather than a NaN. */
function finite(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One `searchAnalytics.query` call.
 *
 * `dataState: "all"` asks for the days that are still being counted as well as
 * the settled ones, and the response says where that boundary is. Reporting the
 * boundary is the whole reason for asking: fresh days read as a cliff otherwise.
 */
async function runQuery(
  creds: GoogleCredentials,
  property: string,
  body: {
    startDate: string;
    endDate: string;
    dimensions: string[];
    filters?: DimensionFilter[];
    rowLimit?: number;
  }
): Promise<{ ok: boolean; rows: SearchAnalyticsRow[]; incompleteFrom?: string; error?: string }> {
  const site = property.trim();
  if (!site) return { ok: false, rows: [], error: "A Search Console property is required." };

  const payload: Record<string, unknown> = {
    startDate: body.startDate,
    endDate: body.endDate,
    dimensions: body.dimensions,
    rowLimit: Math.min(Math.max(Math.round(body.rowLimit || 1000), 1), MAX_ROWS),
    dataState: "all",
  };
  if (body.filters?.length) {
    payload.dimensionFilterGroups = [{ groupType: "and", filters: body.filters }];
  }

  const res = await googleApiRequest<QueryResponse>(
    creds,
    `${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  if (!res.ok) return { ok: false, rows: [], error: res.error };

  const rows: SearchAnalyticsRow[] = (res.data?.rows || []).map((row) => ({
    keys: Array.isArray(row.keys) ? row.keys.map((key) => String(key ?? "")) : [],
    clicks: finite(row.clicks),
    impressions: finite(row.impressions),
    ctr: finite(row.ctr),
    position: finite(row.position),
  }));

  const incompleteFrom = res.data?.metadata?.first_incomplete_date;
  return {
    ok: true,
    rows,
    incompleteFrom: typeof incompleteFrom === "string" && incompleteFrom ? incompleteFrom : undefined,
  };
}
/** Query-by-day rows for one page: `keys` is `[query, date]`, in that order. */
export interface PagePerformance {
  success: boolean;
  property?: string;
  /** The candidate URL form that actually returned rows — the one to store under. */
  matchedPage?: string;
  rows?: SearchAnalyticsRow[];
  /** From this date on the numbers are still being counted, per the API. */
  incompleteFrom?: string;
  error?: string;
}

/**
 * What one page was found for, day by day.
 *
 * `equals` on `page` is exact, so both trailing-slash forms get a turn — but the
 * second only when the first returned nothing at all, because a page with data
 * under one form never has data under the other. A page with genuinely no
 * impressions is a success with no rows, not an error: a new article has none.
 */
export async function queryPagePerformance(
  creds: GoogleCredentials,
  options: {
    property: string;
    page: string;
    startDate: string;
    endDate: string;
    rowLimit?: number;
  }
): Promise<PagePerformance> {
  const candidates = pageMatchCandidates(options.page);
  if (candidates.length === 0) return { success: false, error: "That is not a valid page URL." };

  let incompleteFrom: string | undefined;

  for (const candidate of candidates) {
    const res = await runQuery(creds, options.property, {
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: ["query", "date"],
      filters: [{ dimension: "page", operator: "equals", expression: candidate }],
      rowLimit: options.rowLimit || 5000,
    });
    if (!res.ok) return { success: false, error: res.error };
    incompleteFrom = res.incompleteFrom ?? incompleteFrom;
    if (res.rows.length > 0) {
      return {
        success: true,
        property: options.property,
        matchedPage: candidate,
        rows: res.rows,
        incompleteFrom,
      };
    }
  }

  return {
    success: true,
    property: options.property,
    matchedPage: candidates[0],
    rows: [],
    incompleteFrom,
  };
}
/** One page's totals across the window, for picking which pages are worth a look. */
export interface TopPage {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * The property's pages by clicks, so a workspace can find the article it wants
 * without pasting a URL — and so a page that is getting impressions while we have
 * no publication row for it is still visible.
 *
 * The page key is normalised on the way out, which is what makes it comparable to
 * a stored `PublishResult.url`; the raw value is Search Console's own, and the two
 * differ over a query string often enough to matter.
 */
export async function queryTopPages(
  creds: GoogleCredentials,
  options: { property: string; startDate: string; endDate: string; limit?: number }
): Promise<{ success: boolean; pages?: TopPage[]; incompleteFrom?: string; error?: string }> {
  const res = await runQuery(creds, options.property, {
    startDate: options.startDate,
    endDate: options.endDate,
    dimensions: ["page"],
    rowLimit: Math.min(Math.max(Math.round(options.limit || 100), 1), 1000),
  });
  if (!res.ok) return { success: false, error: res.error };

  const pages = res.rows
    .map((row) => ({
      page: normalizePageUrl(row.keys[0]) || String(row.keys[0] || ""),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .filter((row) => !!row.page);

  return { success: true, pages, incompleteFrom: res.incompleteFrom };
}
