// ============================================================================
// GROWTH LEARNING — turn the workspace's OWN tracked data into strategy signals
//
// The growth engine used to be open-loop in three places the user could feel:
//   - timing came from a hardcoded industry table (bestPublishTime.ts), never
//     from when this workspace's audience actually clicks;
//   - pillar allocation never saw which pillars had already produced leads;
//   - experiments were always born "PLANNED, sampleSize 0" and never measured.
//
// Everything here closes one of those loops using COUNTED data only (real
// LinkClick / LeadEvent / PublishLog rows fetched by metrics.ts). Nothing is
// fabricated: when the sample is too small the timing learner returns null and
// the caller falls back to the honest industry default, and the prompt blocks
// return "" so the model is never told about data that doesn't exist.
//
// Pure module — no prisma, no clock, no I/O. The DB readers live in metrics.ts
// and hand pre-bucketed data in, so all of this stays unit-testable in node.
// ============================================================================

import { formatLabel, type BestTimeSpec } from "@/lib/bestPublishTime";
import type { ExperimentItem } from "@/lib/types/growth";

// ---------------------------------------------------------------------------
// 1. TIMING — learn a platform's best window from its own click history
// ---------------------------------------------------------------------------

/** One (platform, hour-of-day, day-of-week) cell with its click count. */
export interface ClickBucket {
  platform: string; // lowercased platform key
  hour: number; // 0-23, server-local hour the click happened
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  count: number;
}

export interface LearnedTiming {
  spec: BestTimeSpec;
  source: "measured";
  /** Total clicks this window was learned from. */
  sampleClicks: number;
}

/** Per-platform clicks needed before we trust the workspace over the table. */
export const TIMING_MIN_CLICKS = 15;
const MAX_BEST_DAYS = 4;
/** Keep adding busy days until they cover this share of all clicks. */
const DAY_CONCENTRATION = 0.6;

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeDays(days: number[]): string {
  if (!days.length) return "";
  return `, busiest ${days.map((d) => SHORT_DAYS[d] ?? "?").join("/")}`;
}

/**
 * Derives the best publishing window for one platform from its own click
 * buckets, or returns null when there isn't enough data to beat the industry
 * default. The peak hour is chosen with light 3-hour smoothing so one noisy
 * hour can't outrank a genuinely busy stretch; the best days are the busiest
 * ones that together cover most of the clicks.
 */
export function learnBestTime(platform: string, buckets: ClickBucket[]): LearnedTiming | null {
  const key = platform.toLowerCase();
  const mine = buckets.filter((b) => b.platform.toLowerCase() === key && b.count > 0);
  const total = mine.reduce((s, b) => s + b.count, 0);
  if (total < TIMING_MIN_CLICKS) return null;

  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);
  for (const b of mine) {
    if (b.hour >= 0 && b.hour <= 23) hourCounts[b.hour] += b.count;
    if (b.dayOfWeek >= 0 && b.dayOfWeek <= 6) dayCounts[b.dayOfWeek] += b.count;
  }

  // Peak hour via a wraparound 3-hour smoothing window (centre weighted 1,
  // neighbours 0.5). Ties resolve to the earlier hour (first to win the >).
  let bestHour = 0;
  let bestScore = -1;
  for (let h = 0; h < 24; h++) {
    const score = hourCounts[h] + 0.5 * (hourCounts[(h + 23) % 24] + hourCounts[(h + 1) % 24]);
    if (score > bestScore) {
      bestScore = score;
      bestHour = h;
    }
  }

  // Busiest days first, kept until they cover DAY_CONCENTRATION of all clicks
  // (min 1, max MAX_BEST_DAYS), then sorted back into calendar order.
  const ranked = dayCounts
    .map((count, day) => ({ day, count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count || a.day - b.day);
  const days: number[] = [];
  let covered = 0;
  for (const d of ranked) {
    days.push(d.day);
    covered += d.count;
    if (days.length >= MAX_BEST_DAYS) break;
    if (covered / total >= DAY_CONCENTRATION) break;
  }
  days.sort((a, b) => a - b);

  const label = formatLabel(bestHour, 0);
  return {
    spec: {
      hour: bestHour,
      minute: 0,
      days: days.length ? days : [2, 3, 4],
      label,
      reason: `Your own audience: ${total} tracked click${total === 1 ? "" : "s"} peak around ${label}${describeDays(days)}`,
    },
    source: "measured",
    sampleClicks: total,
  };
}

/** Learns every platform that has enough data; platforms without it are absent. */
export function learnAllBestTimes(
  platforms: string[],
  buckets: ClickBucket[]
): Map<string, LearnedTiming> {
  const out = new Map<string, LearnedTiming>();
  for (const pl of platforms) {
    const learned = learnBestTime(pl, buckets);
    if (learned) out.set(pl.toLowerCase(), learned);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. PILLAR PERFORMANCE — tell the strategist which pillars already convert
// ---------------------------------------------------------------------------

/** Shape mirrors metrics.getAttribution rows without importing the DB module. */
export interface PillarPerf {
  key: string;
  clicks: number;
  leads: number;
  conversionRate: number | null;
}

export function rankPillars(byPillar: PillarPerf[]): PillarPerf[] {
  return byPillar
    .filter((p) => p.key && (p.clicks > 0 || p.leads > 0))
    .sort((a, b) => b.leads - a.leads || b.clicks - a.clicks || a.key.localeCompare(b.key));
}

/**
 * A prompt block ranking pillars by what they've actually produced, so the
 * model reallocates toward winners. Returns "" when there is no real data —
 * the model is never handed an empty or invented performance table.
 */
export function pillarPerformanceBlock(byPillar: PillarPerf[]): string {
  const ranked = rankPillars(byPillar).slice(0, 8);
  if (ranked.length === 0) return "";
  const lines = ranked.map(
    (p) =>
      `- ${p.key}: ${p.leads} lead${p.leads === 1 ? "" : "s"} from ${p.clicks} click${p.clicks === 1 ? "" : "s"}${p.conversionRate != null ? ` (${p.conversionRate}% conv.)` : ""}`
  );
  const top = ranked[0];
  return `PILLAR PERFORMANCE (your own tracked data — lean into what already converts):
${lines.join("\n")}
Weight allocation toward "${top.key}" and trim pillars that drew clicks but produced no leads.`;
}

// ---------------------------------------------------------------------------
// 3. HISTORICAL WINNERS — few-shot exemplars of posts that actually worked
// ---------------------------------------------------------------------------

export interface PostPerf {
  platform: string;
  format?: string | null;
  topic?: string | null;
  excerpt?: string | null;
  clicks: number;
  leads: number;
}

export function rankWinners(items: PostPerf[], max = 5): PostPerf[] {
  return items
    .filter((i) => i.clicks > 0 || i.leads > 0)
    .sort((a, b) => b.leads - a.leads || b.clicks - a.clicks)
    .slice(0, Math.max(1, max));
}

/**
 * A prompt block of the workspace's own best-performing posts, used as
 * few-shot exemplars ("echo these angles"). Returns "" when nothing has
 * measurably worked yet.
 */
export function historicalWinnersBlock(items: PostPerf[], max = 5): string {
  const winners = rankWinners(items, max);
  if (winners.length === 0) return "";
  const lines = winners.map((w) => {
    const what = String(w.topic || w.excerpt || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    return `- [${w.platform}${w.format ? `/${w.format}` : ""}] "${what}" → ${w.clicks} click${w.clicks === 1 ? "" : "s"}, ${w.leads} lead${w.leads === 1 ? "" : "s"}`;
  });
  return `WHAT'S ALREADY WORKED (your own top posts — echo these winning angles, don't repeat them verbatim):
${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// 4. EXPERIMENT OUTCOMES — close the loops we can actually measure
// ---------------------------------------------------------------------------

export interface MeasuredContext {
  timingByPlatform: Map<string, LearnedTiming>;
  topPillar: PillarPerf | null;
}

/**
 * Experiments arrive from the model as PLANNED. For the two kinds we can settle
 * from data we already hold — POSTING_TIME (settled by learned timing) and
 * PILLAR (settled by pillar attribution) — mark them COMPLETED with a real
 * winner and the sample size behind it. Every other kind (HOOK/CTA/FORMAT) has
 * no per-variant tracking yet, so it is left PLANNED rather than faked.
 */
export function closeMeasuredExperiments(
  experiments: ExperimentItem[],
  ctx: MeasuredContext
): ExperimentItem[] {
  // The most-sampled learned window stands in for "when should we post".
  let bestTiming: LearnedTiming | null = null;
  for (const t of ctx.timingByPlatform.values()) {
    if (!bestTiming || t.sampleClicks > bestTiming.sampleClicks) bestTiming = t;
  }

  return experiments.map((e) => {
    if (e.status !== "PLANNED") return e;

    if (e.type === "POSTING_TIME" && bestTiming) {
      return {
        ...e,
        status: "COMPLETED",
        winner: bestTiming.spec.label,
        sampleSize: bestTiming.sampleClicks,
        impact: `Scheduling moved to your measured peak — ${bestTiming.spec.reason}.`,
      };
    }

    if (e.type === "PILLAR" && ctx.topPillar && (ctx.topPillar.clicks > 0 || ctx.topPillar.leads > 0)) {
      const p = ctx.topPillar;
      return {
        ...e,
        status: "COMPLETED",
        winner: p.key,
        sampleSize: p.clicks,
        impact: `"${p.key}" leads on your tracked data: ${p.leads} lead${p.leads === 1 ? "" : "s"} from ${p.clicks} click${p.clicks === 1 ? "" : "s"}${p.conversionRate != null ? ` (${p.conversionRate}% conv.)` : ""}.`,
      };
    }

    return e;
  });
}
