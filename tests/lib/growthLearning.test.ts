/**
 * TRACE SUITE — growth learning from the workspace's own data
 *
 * WHY THIS EXISTS: three growth loops used to be open — timing came from a
 * hardcoded table, pillar allocation never saw which pillars converted, and
 * experiments were born PLANNED and never settled. This module closes them
 * from COUNTED data only. The invariant that matters most is honesty: when the
 * sample is too thin the timing learner must return null (so the caller falls
 * back to the industry table, not a made-up window), and every prompt block
 * must return "" rather than describe data that doesn't exist. These tests pin
 * the aggregation math AND those "not enough data → say nothing" boundaries.
 */
import { describe, it, expect } from "vitest";
import {
  learnBestTime,
  learnAllBestTimes,
  pillarPerformanceBlock,
  rankPillars,
  historicalWinnersBlock,
  rankWinners,
  closeMeasuredExperiments,
  TIMING_MIN_CLICKS,
  type ClickBucket,
  type LearnedTiming,
  type PillarPerf,
  type PostPerf,
  type MeasuredContext,
} from "@/lib/growth/learning";
import type { ExperimentItem } from "@/lib/types/growth";

function bucket(platform: string, hour: number, dayOfWeek: number, count: number): ClickBucket {
  return { platform, hour, dayOfWeek, count };
}

describe("learnBestTime", () => {
  it("returns null below the minimum sample (falls back to the industry table)", () => {
    const buckets = [bucket("instagram", 19, 3, TIMING_MIN_CLICKS - 1)];
    expect(learnBestTime("instagram", buckets)).toBeNull();
  });

  it("learns a window once the sample is large enough", () => {
    const buckets = [bucket("instagram", 19, 3, 20)];
    const learned = learnBestTime("instagram", buckets);
    expect(learned).not.toBeNull();
    expect(learned!.source).toBe("measured");
    expect(learned!.sampleClicks).toBe(20);
    expect(learned!.spec.hour).toBe(19);
    expect(learned!.spec.label).toBe("7:00 PM");
    expect(learned!.spec.days).toEqual([3]);
    expect(learned!.spec.reason).toContain("20 tracked clicks");
    expect(learned!.spec.reason).toContain("Wed");
  });

  it("smooths the peak so a lone spike loses to a genuinely busy stretch", () => {
    // Hour 9 has the single highest bar (8), but 14–16 form a heavier block.
    const buckets = [
      bucket("linkedin", 9, 2, 8),
      bucket("linkedin", 14, 2, 5),
      bucket("linkedin", 15, 2, 6),
      bucket("linkedin", 16, 2, 5),
    ];
    const learned = learnBestTime("linkedin", buckets);
    expect(learned!.spec.hour).toBe(15); // centre of the stretch, not the 9 spike
  });

  it("keeps the busiest days until they cover ~60% of clicks", () => {
    const buckets = [
      bucket("x", 9, 1, 10),
      bucket("x", 9, 2, 8),
      bucket("x", 9, 3, 6),
      bucket("x", 9, 4, 4),
      bucket("x", 9, 5, 2),
    ];
    const learned = learnBestTime("x", buckets);
    // 10 + 8 = 18 of 30 ≥ 60% → stop; sorted back into calendar order.
    expect(learned!.spec.days).toEqual([1, 2]);
  });

  it("never returns more than four days even when clicks are spread flat", () => {
    const buckets = [0, 1, 2, 3, 4, 5, 6].map((d) => bucket("facebook", 9, d, 3)); // 21 total
    const learned = learnBestTime("facebook", buckets);
    expect(learned!.spec.days).toHaveLength(4);
    expect(learned!.spec.days).toEqual([0, 1, 2, 3]);
  });

  it("counts only the platform asked for", () => {
    const buckets = [
      bucket("instagram", 19, 3, 20),
      bucket("linkedin", 9, 2, 100),
    ];
    const learned = learnBestTime("instagram", buckets);
    expect(learned!.sampleClicks).toBe(20); // linkedin's 100 clicks ignored
  });

  it("is case-insensitive on the platform key", () => {
    const buckets = [bucket("Instagram", 19, 3, 20)];
    expect(learnBestTime("INSTAGRAM", buckets)).not.toBeNull();
  });
});

describe("learnAllBestTimes", () => {
  it("includes only platforms with enough of their own data, keyed lowercase", () => {
    const buckets = [
      bucket("instagram", 19, 3, 20), // enough
      bucket("linkedin", 9, 2, 5), // too thin
    ];
    const map = learnAllBestTimes(["Instagram", "LinkedIn", "tiktok"], buckets);
    expect(map.has("instagram")).toBe(true);
    expect(map.has("linkedin")).toBe(false);
    expect(map.has("tiktok")).toBe(false);
    expect(map.size).toBe(1);
  });
});

describe("rankPillars / pillarPerformanceBlock", () => {
  const pillars: PillarPerf[] = [
    { key: "Tips", clicks: 200, leads: 3, conversionRate: 1.5 },
    { key: "Case Studies", clicks: 100, leads: 12, conversionRate: 12 },
    { key: "Empty", clicks: 0, leads: 0, conversionRate: null },
  ];

  it("ranks by leads first, then clicks, dropping zero-signal pillars", () => {
    const ranked = rankPillars(pillars);
    expect(ranked.map((p) => p.key)).toEqual(["Case Studies", "Tips"]);
  });

  it("returns '' when there is no real pillar data", () => {
    expect(pillarPerformanceBlock([])).toBe("");
    expect(pillarPerformanceBlock([{ key: "X", clicks: 0, leads: 0, conversionRate: null }])).toBe("");
  });

  it("names the top converter to weight allocation toward", () => {
    const block = pillarPerformanceBlock(pillars);
    expect(block).toContain("PILLAR PERFORMANCE");
    expect(block).toContain("Case Studies");
    expect(block).toContain('Weight allocation toward "Case Studies"');
  });
});

describe("rankWinners / historicalWinnersBlock", () => {
  const posts: PostPerf[] = [
    { platform: "instagram", format: "Reel", topic: "Behind the build", clicks: 40, leads: 1 },
    { platform: "linkedin", format: "Post", topic: "Client win", clicks: 20, leads: 5 },
    { platform: "x", topic: "Cold post", clicks: 0, leads: 0 },
  ];

  it("ranks by leads then clicks and drops posts with no measured signal", () => {
    const ranked = rankWinners(posts);
    expect(ranked.map((p) => p.topic)).toEqual(["Client win", "Behind the build"]);
  });

  it("returns '' when nothing has measurably worked", () => {
    expect(historicalWinnersBlock([])).toBe("");
    expect(historicalWinnersBlock([{ platform: "x", clicks: 0, leads: 0 }])).toBe("");
  });

  it("renders platform/format and topic for each winner", () => {
    const block = historicalWinnersBlock(posts);
    expect(block).toContain("WHAT'S ALREADY WORKED");
    expect(block).toContain("[linkedin/Post]");
    expect(block).toContain("Client win");
  });

  it("caps the number of exemplars", () => {
    const many: PostPerf[] = Array.from({ length: 10 }, (_, i) => ({
      platform: "instagram",
      topic: `p${i}`,
      clicks: i + 1,
      leads: 0,
    }));
    expect(rankWinners(many, 3)).toHaveLength(3);
  });
});

describe("closeMeasuredExperiments", () => {
  function timing(platform: string, label: string, sampleClicks: number): LearnedTiming {
    return {
      spec: { hour: 9, minute: 0, days: [2, 3, 4], label, reason: `peak ${label}` },
      source: "measured",
      sampleClicks,
    };
  }

  const ctx: MeasuredContext = {
    timingByPlatform: new Map([
      ["instagram", timing("instagram", "7:00 PM", 20)],
      ["linkedin", timing("linkedin", "9:00 AM", 50)],
    ]),
    topPillar: { key: "Case Studies", clicks: 100, leads: 12, conversionRate: 12 },
  };

  const planned = (type: ExperimentItem["type"]): ExperimentItem => ({
    id: `exp-${type}`,
    name: `${type} test`,
    hypothesis: "…",
    type,
    status: "PLANNED",
    metric: "Confirmed leads",
    sampleSize: 0,
  });

  it("settles POSTING_TIME from the most-sampled learned window", () => {
    const [out] = closeMeasuredExperiments([planned("POSTING_TIME")], ctx);
    expect(out.status).toBe("COMPLETED");
    expect(out.winner).toBe("9:00 AM"); // linkedin, 50 clicks > instagram 20
    expect(out.sampleSize).toBe(50);
    expect(out.impact).toContain("measured peak");
  });

  it("settles PILLAR from the top-converting pillar", () => {
    const [out] = closeMeasuredExperiments([planned("PILLAR")], ctx);
    expect(out.status).toBe("COMPLETED");
    expect(out.winner).toBe("Case Studies");
    expect(out.sampleSize).toBe(100);
  });

  it("leaves HOOK/CTA/FORMAT experiments PLANNED (no per-variant tracking to fake)", () => {
    const out = closeMeasuredExperiments([planned("HOOK"), planned("CTA"), planned("FORMAT")], ctx);
    expect(out.every((e) => e.status === "PLANNED")).toBe(true);
  });

  it("does not touch an already-completed experiment", () => {
    const done: ExperimentItem = { ...planned("PILLAR"), status: "COMPLETED", winner: "kept" };
    const [out] = closeMeasuredExperiments([done], ctx);
    expect(out.winner).toBe("kept");
  });

  it("leaves experiments PLANNED when the matching data is absent", () => {
    const bare: MeasuredContext = { timingByPlatform: new Map(), topPillar: null };
    const out = closeMeasuredExperiments([planned("POSTING_TIME"), planned("PILLAR")], bare);
    expect(out.every((e) => e.status === "PLANNED")).toBe(true);
  });
});
