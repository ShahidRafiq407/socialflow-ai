/**
 * Platform insights — shared types.
 *
 * One snapshot per (workspace, platform), refreshed on a schedule and lazily
 * when the dashboard is opened. Every provider reports only numbers the
 * platform API actually returned; anything else is state="unavailable" or
 * "error" with a short human message — never an estimate.
 */

export type InsightsState = "live" | "unavailable" | "error";

export interface PlatformInsightMetrics {
  followers: number | null;
  impressions30d: number | null;
  views30d: number | null;
  likes30d: number | null;
  comments30d: number | null;
  shares30d: number | null;
  /** Percentage, e.g. 3.4 = 3.4%. null when the platform did not report it. */
  engagementRate: number | null;
}

export interface PlatformInsightSnapshot extends PlatformInsightMetrics {
  platform: string;
  state: InsightsState;
  message: string | null;
  fetchedAt: string;
}

/** Minimal account shape the providers need (Prisma SocialAccount fields). */
export interface InsightAccount {
  id: string;
  platform: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  accountId?: string | null;
  handle?: string | null;
  tokenExpiresAt?: Date | null;
}

/** How old a stored snapshot may get before the lazy refresh fetches again. */
export const INSIGHT_STALENESS_MS = 12 * 60 * 60 * 1000;

/** How long a single platform API call may take. */
export const INSIGHT_FETCH_TIMEOUT_MS = 15_000;

export function pctRate(part: number | null | undefined, total: number | null | undefined): number | null {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return null;
  return Math.round((p / t) * 1000) / 10;
}

export function truncateMessage(msg: string, max = 160): string {
  if (msg.length <= max) return msg;
  return `${msg.slice(0, max - 1)}…`;
}
