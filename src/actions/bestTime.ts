"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";
import { vertexProvider, MODELS } from "@/lib/agents/llm";
import {
  BestTimeSpec,
  PlatformTimeEntry,
  getBestTimeSpec,
  normalizeAiBestTime,
} from "@/lib/bestPublishTime";

// Industry-level cache: every workspace in the same industry shares one AI
// analysis for 24h, so heavy traffic never re-triggers the LLM per user.
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function industryCacheKey(industry: string): string {
  return `socialflow:besttime:${industry.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
}

export interface BestTimeAnalysis {
  industry: string;
  audience: string;
  times: Record<string, PlatformTimeEntry>;
}

/**
 * AI Best-Time Analysis — the scheduler's brain.
 * Chain (never sticks, never throws for missing data):
 *   1. Redis industry-level cache (24h TTL)
 *   2. Fresh Gemini analysis for uncached platforms (25s hard timeout)
 *   3. Built-in industry-standard windows as final fallback
 */
export async function analyzeBestTimes(platforms: string[]): Promise<BestTimeAnalysis> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    include: { brandDNA: true },
  });

  const industry = workspace?.industry || "Technology & Automation";
  const audience =
    workspace?.brandDNA?.targetAudience || "General business decision makers";

  const uniquePlatforms = Array.from(new Set(platforms.map((p) => p.toLowerCase())));
  const times: Record<string, PlatformTimeEntry> = {};
  const missing: string[] = [];

  // 1. Redis industry-level cache
  const cached = await cacheGet<Record<string, any>>(industryCacheKey(industry));
  for (const p of uniquePlatforms) {
    const c = cached?.[p];
    if (c && Number.isFinite(Number(c.hour))) {
      times[p] = { spec: normalizeAiBestTime(c, p), source: "ai_cached" };
    } else {
      missing.push(p);
    }
  }

  // 2. Fresh AI analysis (only for platforms the cache didn't cover)
  if (missing.length > 0) {
    try {
      const prompt = `You are a social media audience-activity analyst.
Determine the BEST posting windows for maximum organic reach on each platform.

INDUSTRY: ${industry}
TARGET AUDIENCE: ${audience}
PLATFORMS: ${missing.join(", ")}

Base your answer on real audience-behavior patterns for this specific industry and
audience (work schedules, commute times, browsing habits, timezone spread of typical
buyers in this niche). Return times in the user's LOCAL timezone.

Return strictly JSON:
{
  "platforms": {
    "platformKey": {
      "hour": 17,
      "minute": 0,
      "days": [2, 3, 4],
      "reason": "One short sentence: why this audience is most active here at this time"
    }
  }
}
Constraints: hour = 0-23 (24h format), minute = 0-59, days = array of weekday numbers
(0=Sunday ... 6=Saturday, pick 2-4 best days). platformKey must match the requested platform keys exactly.`;

      const res = (await Promise.race([
        vertexProvider.generateJSON([{ role: "user", content: prompt }], {
          modelName: MODELS.TREND_RESEARCHER,
          temperature: 0.2,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Best-time analysis timed out")), 25000)
        ),
      ])) as any;

      const freshCache: Record<string, any> = { ...(cached || {}) };
      for (const p of missing) {
        const raw = res?.platforms?.[p] || res?.platforms?.[p.toLowerCase()];
        if (raw && Number.isFinite(Number(raw.hour))) {
          const spec = normalizeAiBestTime(raw, p);
          times[p] = { spec, source: "ai_fresh" };
          freshCache[p] = spec;
        }
      }
      // Persist the fresh analysis at industry level for all workspaces
      await cacheSet(industryCacheKey(industry), freshCache, CACHE_TTL_SECONDS);
    } catch (e) {
      console.warn("[BestTime] AI analysis unavailable, using industry standard:", e);
    }
  }

  // 3. Industry-standard fallback for anything still uncovered
  for (const p of uniquePlatforms) {
    if (!times[p]) {
      times[p] = { spec: getBestTimeSpec(p), source: "industry_standard" };
    }
  }

  return { industry, audience, times };
}
