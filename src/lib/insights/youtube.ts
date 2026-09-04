import prisma from "@/lib/db";
import type {
  InsightAccount,
  PlatformInsightSnapshot,
  PlatformInsightMetrics,
} from "./types";
import { INSIGHT_FETCH_TIMEOUT_MS, pctRate, truncateMessage } from "./types";

/**
 * YouTube channel + recent video statistics.
 *
 * Works with the OAuth token already stored for publishing (youtube.readonly
 * scope is part of the connect flow). Access tokens live ~1h, so the stored
 * refresh_token is used exactly like the YouTube publisher does when the
 * token is expired or a call comes back 401 — and the DB row is updated so
 * publishing keeps working with the same token.
 */

const YT = "https://www.googleapis.com/youtube/v3";

type JsonObj = Record<string, unknown>;

const jsonObj = (v: unknown): JsonObj => (typeof v === "object" && v !== null ? (v as JsonObj) : {});
const jsonArr = (v: unknown): JsonObj[] =>
  Array.isArray(v) ? (v as unknown[]).map((item) => jsonObj(item)) : [];
const asNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

class YtApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function ytError(body: JsonObj): { code: string; message: string } | null {
  const err = jsonObj(body.error);
  if (!err || Object.keys(err).length === 0) return null;
  return {
    code: String(err.code ?? ""),
    message: truncateMessage(String(err.message ?? "YouTube API error")),
  };
}

async function ytGet(path: string, token: string): Promise<JsonObj> {
  const res = await fetch(`${YT}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(INSIGHT_FETCH_TIMEOUT_MS),
  });
  const body: JsonObj = await res.json().catch(() => ({}));
  const err = ytError(body);
  if (!res.ok || err) {
    throw new YtApiError(err?.code ?? String(res.status), err?.message ?? `YouTube API error ${res.status}`);
  }
  return body;
}

async function refreshYouTubeAccessToken(account: InsightAccount): Promise<string | null> {
  if (!account.refreshToken) return null;
  const clientId = process.env.YOUTUBE_CLIENT_ID || "";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(INSIGHT_FETCH_TIMEOUT_MS),
    });
    const data: JsonObj = await res.json().catch(() => ({}));
    const token = typeof data.access_token === "string" ? data.access_token : null;
    if (!res.ok || !token) return null;
    await prisma.socialAccount
      .update({
        where: { id: account.id },
        data: {
          accessToken: token,
          tokenExpiresAt: new Date(Date.now() + asNum(data.expires_in || 3600) * 1000),
        },
      })
      .catch(() => {});
    return token;
  } catch {
    return null;
  }
}

async function currentToken(account: InsightAccount): Promise<string | null> {
  const token = account.accessToken || "";
  const expired =
    account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000;
  if (expired) {
    const refreshed = await refreshYouTubeAccessToken(account);
    if (refreshed) return refreshed;
    if (!token) return null;
  }
  return token;
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

export async function fetchYouTubeInsights(account: InsightAccount): Promise<PlatformInsightSnapshot> {
  const channelId = account.accountId || "";
  if (!channelId) {
    return fail("YOUTUBE", "unavailable", "YouTube channel id missing — reconnect the account.");
  }

  const token = await currentToken(account);
  if (!token) {
    return fail("YOUTUBE", "unavailable", "YouTube token expired and could not be refreshed — reconnect the account.");
  }

  const fetchWithRetry = async (path: string): Promise<JsonObj> => {
    try {
      return await ytGet(path, token);
    } catch (err) {
      const retriable =
        err instanceof YtApiError &&
        (err.code === "401" || (err.code === "403" && /expired|invalid/i.test(err.message)));
      if (!retriable) throw err;
      const refreshed = await refreshYouTubeAccessToken(account);
      if (!refreshed) throw err;
      return ytGet(path, refreshed);
    }
  };

  try {
    // 1. Channel statistics (subscribers, lifetime views, video count)
    const statsBody = await fetchWithRetry(
      `/channels?part=statistics,contentDetails&id=${encodeURIComponent(channelId)}`
    );
    const channel = jsonArr(statsBody.items)[0];
    if (!channel) {
      return fail("YOUTUBE", "unavailable", "YouTube channel not found — reconnect the account.");
    }

    const stat = jsonObj(channel.statistics);
    const details = jsonObj(channel.contentDetails);
    const followers = asNum(stat.subscriberCount);
    const uploadsPlaylist =
      typeof jsonObj(details.relatedPlaylists).uploads === "string"
        ? (jsonObj(details.relatedPlaylists).uploads as string)
        : null;
    const sinceTs = Date.now() - 30 * 24 * 60 * 60 * 1000;

    let likes30d = 0;
    let comments30d = 0;
    let views30d = 0;

    // 2. Recent uploads (up to 50) and their engagement
    if (uploadsPlaylist) {
      const listBody = await fetchWithRetry(
        `/playlistItems?part=contentDetails,snippet&playlistId=${encodeURIComponent(uploadsPlaylist)}&maxResults=50`
      );
      const recent: { id: string }[] = [];
      for (const item of jsonArr(listBody.items)) {
        const snippet = jsonObj(item.snippet);
        const content = jsonObj(item.contentDetails);
        const published = typeof snippet.publishedAt === "string" ? new Date(snippet.publishedAt).getTime() : 0;
        if (typeof content.videoId === "string" && published >= sinceTs) {
          recent.push({ id: content.videoId });
        }
      }

      if (recent.length > 0) {
        const ids = recent.slice(0, 50).map((v) => v.id).join(",");
        const vidBody = await fetchWithRetry(`/videos?part=statistics&id=${encodeURIComponent(ids)}`);
        for (const video of jsonArr(vidBody.items)) {
          const vs = jsonObj(video.statistics);
          views30d += asNum(vs.viewCount);
          likes30d += asNum(vs.likeCount);
          comments30d += asNum(vs.commentCount);
        }
      }
    }

    return live("YOUTUBE", {
      followers,
      impressions30d: null,
      views30d,
      likes30d,
      comments30d,
      shares30d: null,
      engagementRate: pctRate(likes30d + comments30d, views30d),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube insights fetch failed";
    return fail("YOUTUBE", "error", message);
  }
}
