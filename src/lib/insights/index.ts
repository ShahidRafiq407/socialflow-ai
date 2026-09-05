import type {
  InsightAccount,
  PlatformInsightSnapshot,
} from "./types";
import { fetchFacebookInsights, fetchInstagramInsights } from "./meta";
import { fetchYouTubeInsights } from "./youtube";

/**
 * Platform insights router.
 *
 * Implemented providers:
 *   FACEBOOK  — page followers + impressions + post engagements (30d)
 *   INSTAGRAM — business account followers + impressions + interactions (30d)
 *   YOUTUBE   — subscriber count + views/likes/comments on the last 30 days
 *               of uploads (refresh_token aware)
 *
 * Not yet available, with the honest reason (never invented numbers):
 *   LINKEDIN  — member/company insights need r_* social/analytics access from
 *               LinkedIn's Marketing Developer Program (app review).
 *   TIKTOK    — video/user insights need the user.insights scope, which TikTok
 *               grants only after app review; adding it today would break the
 *               connect flow for everyone.
 *   PINTEREST — the v5 API has no follower/impression reporting for user
 *               accounts on the scopes this app uses.
 */

export async function fetchPlatformInsights(account: InsightAccount): Promise<PlatformInsightSnapshot> {
  const platform = String(account.platform || "").toUpperCase();

  switch (platform) {
    case "FACEBOOK":
      return fetchFacebookInsights(account);
    case "INSTAGRAM":
      return fetchInstagramInsights(account);
    case "YOUTUBE":
      return fetchYouTubeInsights(account);
    case "LINKEDIN":
      return {
        platform,
        state: "unavailable",
        message: "LinkedIn insights need organization analytics access (Marketing Developer Program).",
        fetchedAt: new Date().toISOString(),
        followers: null,
        impressions30d: null,
        views30d: null,
        likes30d: null,
        comments30d: null,
        shares30d: null,
        engagementRate: null,
      };
    case "TIKTOK":
      return {
        platform,
        state: "unavailable",
        message: "TikTok insights need the user.insights scope (app review required).",
        fetchedAt: new Date().toISOString(),
        followers: null,
        impressions30d: null,
        views30d: null,
        likes30d: null,
        comments30d: null,
        shares30d: null,
        engagementRate: null,
      };
    default:
      return {
        platform,
        state: "unavailable",
        message: "No follower/impression reporting for this platform yet.",
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
}
