import type {
  InsightAccount,
  PlatformInsightSnapshot,
  PlatformInsightMetrics,
} from "./types";
import { INSIGHT_FETCH_TIMEOUT_MS, pctRate, truncateMessage } from "./types";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type JsonObj = Record<string, unknown>;

const jsonObj = (v: unknown): JsonObj => (typeof v === "object" && v !== null ? (v as JsonObj) : {});
const asNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

class MetaApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function graphError(body: JsonObj): { code: string; message: string } | null {
  const err = jsonObj(body.error);
  if (!err || Object.keys(err).length === 0) return null;
  return {
    code: String(err.code ?? ""),
    message: truncateMessage(String(err.message ?? "Meta API error")),
  };
}

async function graphGet(path: string, token: string): Promise<JsonObj> {
  const res = await fetch(`${GRAPH_BASE}${path}&access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(INSIGHT_FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  const body: JsonObj = await res.json().catch(() => ({}));
  const err = graphError(body);
  if (!res.ok || err) {
    throw new MetaApiError(err?.code ?? String(res.status), err?.message ?? `Meta API error ${res.status}`);
  }
  return body;
}

function sumDailyValues(insightsBody: JsonObj, metricName: string): number | null {
  const rows = Array.isArray(insightsBody.data) ? (insightsBody.data as unknown[]) : [];
  for (const raw of rows) {
    const row = jsonObj(raw);
    if (row.name !== metricName) continue;
    const values = Array.isArray(row.values) ? (row.values as unknown[]) : [];
    let sum = 0;
    for (const rawValue of values) {
      sum += asNum(jsonObj(rawValue).value) ?? 0;
    }
    return sum;
  }
  return null;
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function live(
  platform: string,
  metrics: PlatformInsightMetrics,
  message?: string
): PlatformInsightSnapshot {
  return { platform, state: "live", message: message || null, fetchedAt: new Date().toISOString(), ...metrics };
}

function fail(platform: string, state: "unavailable" | "error", message: string): PlatformInsightSnapshot {
  return {
    platform,
    state,
    message: truncateMessage(message),
    fetchedAt: new Date().toISOString(),
    followers: null,
    impressions30d: null,
    views30d: null,
    likes30d: null,
    comments30d: null,
    shares30d: null,
    engagementRate: null,
  };
}

/** Facebook page: followers + impressions + post engagements (last 30 days). */
export async function fetchFacebookInsights(account: InsightAccount): Promise<PlatformInsightSnapshot> {
  const token = account.accessToken || "";
  const pageId = account.accountId || "";
  if (!token || !pageId) {
    return fail("FACEBOOK", "unavailable", "Facebook page token missing — reconnect the account.");
  }

  try {
    const profile = await graphGet(`/${pageId}?fields=followers_count`, token);
    const followers = Math.max(0, asNum(profile.followers_count) ?? 0);

    const until = daysAgoISO(0);
    const since = daysAgoISO(30);
    let impressions: number | null = null;
    let engagements: number | null = null;
    try {
      const insightRes = await graphGet(
        `/${pageId}/insights?metric=page_impressions,page_post_engagements&period=day&since=${since}&until=${until}`,
        token
      );
      impressions = sumDailyValues(insightRes, "page_impressions");
      engagements = sumDailyValues(insightRes, "page_post_engagements");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Facebook insights unavailable";
      if (err instanceof MetaApiError && err.code === "190") {
        return fail("FACEBOOK", "unavailable", "Facebook session expired — reconnect the account.");
      }
      // Page impressions can be blocked for new tokens; followers alone is still real.
      console.warn(`[Insights: FACEBOOK] insight metric fetch failed: ${message}`);
    }

    return live("FACEBOOK", {
      followers,
      impressions30d: impressions,
      views30d: null,
      likes30d: null,
      comments30d: null,
      shares30d: null,
      engagementRate: pctRate(engagements, impressions),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Facebook insights fetch failed";
    if (err instanceof MetaApiError && err.code === "190") {
      return fail("FACEBOOK", "unavailable", "Facebook session expired — reconnect the account.");
    }
    return fail("FACEBOOK", "error", message);
  }
}

/** Instagram business account: followers + impressions + interactions (30d). */
export async function fetchInstagramInsights(account: InsightAccount): Promise<PlatformInsightSnapshot> {
  const token = account.accessToken || "";
  const igId = account.accountId || "";
  if (!token || !igId) {
    return fail("INSTAGRAM", "unavailable", "Instagram token missing — reconnect the account.");
  }

  const businessHint = "Instagram insights need a Business/Creator account with manage_insights — reconnect to enable.";

  try {
    const profile = await graphGet(`/${igId}?fields=followers_count,media_count`, token);
    const followers = Math.max(0, asNum(profile.followers_count) ?? 0);

    const until = daysAgoISO(0);
    const since = daysAgoISO(30);
    let impressions: number | null = null;
    let interactions: number | null = null;
    try {
      const insightRes = await graphGet(
        `/${igId}/insights?metric=impressions,reach,total_interactions&period=day&since=${since}&until=${until}`,
        token
      );
      impressions = sumDailyValues(insightRes, "impressions");
      interactions = sumDailyValues(insightRes, "total_interactions");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Instagram insights unavailable";
      if (err instanceof MetaApiError && err.code === "190") {
        return fail("INSTAGRAM", "unavailable", "Instagram session expired — reconnect the account.");
      }
      if (/business|permission|insight|manage|100/i.test(message)) {
        return fail("INSTAGRAM", "unavailable", businessHint);
      }
      console.warn(`[Insights: INSTAGRAM] insight metric fetch failed: ${message}`);
    }

    return live("INSTAGRAM", {
      followers,
      impressions30d: impressions,
      views30d: null,
      likes30d: null,
      comments30d: null,
      shares30d: null,
      engagementRate: pctRate(interactions, impressions),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Instagram insights fetch failed";
    if (err instanceof MetaApiError && err.code === "190") {
      return fail("INSTAGRAM", "unavailable", "Instagram session expired — reconnect the account.");
    }
    if (/business|permission|insight|manage|100/i.test(message)) {
      return fail("INSTAGRAM", "unavailable", businessHint);
    }
    return fail("INSTAGRAM", "error", message);
  }
}
