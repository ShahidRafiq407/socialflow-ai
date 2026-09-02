/**
 * TRACE SUITE — controller content outcomes (what the user keeps vs throws away)
 *
 * WHY THIS EXISTS: every draft that goes live is a "kept" signal and every draft
 * deleted before going live is a "discarded" one. Aggregated over a workspace's
 * own actions that becomes an honest read on its taste, which biases the next
 * round of generation. Two invariants matter most and are pinned here: (1) the
 * HONESTY FLOOR — a value with fewer than MIN_OUTCOME_SAMPLE events is not a
 * pattern and must never be surfaced, and a value with no clear lean lands on
 * neither side; and (2) the renderer returns "" when nothing qualifies, so the
 * prompt omits the section rather than announce a track record that isn't there.
 * The rest pins the wire round-trip and the per-dimension tally shape.
 */
import { describe, it, expect } from "vitest";
import {
  OUTCOME_CATEGORY,
  MIN_OUTCOME_SAMPLE,
  KEEP_RATE_HIGH,
  KEEP_RATE_LOW,
  buildOutcomeContent,
  parseOutcomeEvent,
  tallyOutcomes,
  summarizeOutcomes,
  formatOutcomesForPrompt,
  type OutcomeEvent,
} from "@/lib/agents/controller/outcomes";

/** n events with the same dimensions and outcome. */
function many(n: number, event: OutcomeEvent): OutcomeEvent[] {
  return Array.from({ length: n }, () => ({ ...event }));
}

function find(tallies: ReturnType<typeof tallyOutcomes>, dimension: string, value: string) {
  return tallies.find((t) => t.dimension === dimension && t.value === value);
}

describe("buildOutcomeContent", () => {
  it("writes a compact JSON payload with only the dimensions present", () => {
    const content = buildOutcomeContent({ outcome: "published", platform: "LinkedIn", mediaType: "image" });
    expect(JSON.parse(content)).toEqual({ outcome: "published", platform: "LinkedIn", mediaType: "image" });
  });

  it("returns '' for an outcome it does not recognise", () => {
    expect(buildOutcomeContent({ outcome: "maybe" as any, platform: "LinkedIn" })).toBe("");
  });

  it("returns '' when no dimension is usable (nothing could be learned)", () => {
    expect(buildOutcomeContent({ outcome: "published" })).toBe("");
    expect(buildOutcomeContent({ outcome: "discarded", platform: "   ", format: null })).toBe("");
  });

  it("collapses whitespace and caps each dimension", () => {
    const content = buildOutcomeContent({ outcome: "published", platform: "  Linked   In  ", format: "x".repeat(90) });
    const parsed = JSON.parse(content);
    expect(parsed.platform).toBe("Linked In");
    expect(parsed.format).toHaveLength(60);
  });
});

describe("parseOutcomeEvent", () => {
  it("round-trips content built by buildOutcomeContent", () => {
    const content = buildOutcomeContent({ outcome: "discarded", platform: "Instagram", format: "Carousel" });
    expect(parseOutcomeEvent(content)).toEqual({
      outcome: "discarded",
      platform: "Instagram",
      format: "Carousel",
      mediaType: undefined,
    });
  });

  it("returns null for anything that isn't an outcome event", () => {
    expect(parseOutcomeEvent("The user's brand tone is playful.")).toBeNull();
    expect(parseOutcomeEvent("")).toBeNull();
    expect(parseOutcomeEvent("{not json")).toBeNull();
    expect(parseOutcomeEvent('{"outcome":"rejected","platform":"X"}')).toBeNull();
    expect(parseOutcomeEvent('{"outcome":"published"}')).toBeNull();
  });
});

describe("tallyOutcomes", () => {
  it("counts every dimension of one event independently", () => {
    const tallies = tallyOutcomes([{ outcome: "published", platform: "LinkedIn", format: "Reel", mediaType: "video" }]);
    expect(find(tallies, "platform", "linkedin")!.published).toBe(1);
    expect(find(tallies, "format", "reel")!.published).toBe(1);
    expect(find(tallies, "media", "video")!.published).toBe(1);
  });

  it("aggregates case-insensitively but keeps the first casing for display", () => {
    const tallies = tallyOutcomes([
      { outcome: "published", platform: "LinkedIn" },
      { outcome: "discarded", platform: "linkedin" },
    ]);
    const t = find(tallies, "platform", "linkedin")!;
    expect(t.total).toBe(2);
    expect(t.published).toBe(1);
    expect(t.discarded).toBe(1);
    expect(t.display).toBe("LinkedIn");
    expect(t.keepRate).toBe(0.5);
  });

  it("ignores events with an unrecognised outcome", () => {
    expect(tallyOutcomes([{ outcome: "pending" as any, platform: "X" }])).toEqual([]);
  });

  it("tolerates an empty or missing list", () => {
    expect(tallyOutcomes([])).toEqual([]);
    expect(tallyOutcomes(undefined as any)).toEqual([]);
  });
});

describe("summarizeOutcomes — the honesty floor", () => {
  it("says nothing about a value below the sample floor", () => {
    expect(MIN_OUTCOME_SAMPLE).toBe(3);
    const events = many(MIN_OUTCOME_SAMPLE - 1, { outcome: "discarded", platform: "TikTok" });
    expect(summarizeOutcomes(events)).toEqual({ kept: [], discarded: [] });
  });

  it("calls a value kept once it clears the floor with a high keep-rate", () => {
    const events = [...many(2, { outcome: "published", platform: "LinkedIn" }), { outcome: "discarded" as const, platform: "LinkedIn" }];
    const { kept, discarded } = summarizeOutcomes(events);
    expect(kept.map((t) => t.value)).toContain("linkedin");
    expect(discarded).toHaveLength(0);
    expect(kept[0].keepRate).toBeGreaterThanOrEqual(KEEP_RATE_HIGH);
  });

  it("calls a value discarded once it clears the floor with a low keep-rate", () => {
    const events = [...many(3, { outcome: "discarded", platform: "TikTok" }), { outcome: "published" as const, platform: "TikTok" }];
    const { kept, discarded } = summarizeOutcomes(events);
    expect(discarded.map((t) => t.value)).toContain("tiktok");
    expect(kept).toHaveLength(0);
    expect(discarded[0].keepRate).toBeLessThanOrEqual(KEEP_RATE_LOW);
  });

  it("leaves a value with no clear lean on neither side", () => {
    const events = [
      ...many(2, { outcome: "published", platform: "X" }),
      ...many(2, { outcome: "discarded", platform: "X" }),
    ];
    expect(summarizeOutcomes(events)).toEqual({ kept: [], discarded: [] });
  });

  it("leads with the most decisive pattern, then the biggest sample", () => {
    const events = [
      ...many(4, { outcome: "published", platform: "LinkedIn" }), // 1.0
      ...many(3, { outcome: "published", platform: "Instagram" }), // 0.75
      { outcome: "discarded" as const, platform: "Instagram" },
    ];
    const { kept } = summarizeOutcomes(events);
    expect(kept.map((t) => t.value)).toEqual(["linkedin", "instagram"]);
  });

  it("honours a caller-supplied floor", () => {
    const events = many(2, { outcome: "published", platform: "LinkedIn" });
    expect(summarizeOutcomes(events, 2).kept.map((t) => t.value)).toEqual(["linkedin"]);
  });
});

describe("formatOutcomesForPrompt", () => {
  it("returns '' when there are no events at all", () => {
    expect(formatOutcomesForPrompt([])).toBe("");
  });

  it("returns '' when nothing clears the floor (never announces a pattern it lacks)", () => {
    expect(formatOutcomesForPrompt(many(2, { outcome: "discarded", platform: "TikTok" }))).toBe("");
  });

  it("renders the keeps and the discards with their real counts", () => {
    const block = formatOutcomesForPrompt([
      ...many(3, { outcome: "published", platform: "LinkedIn", mediaType: "image" }),
      ...many(3, { outcome: "discarded", platform: "TikTok", mediaType: "image" }),
    ]);
    expect(block).toContain("You publish most LinkedIn drafts (3 of 3 kept).");
    expect(block).toContain("You usually discard TikTok drafts (0 of 3 kept).");
    // media:image is 3 kept / 3 discarded — a 0.5 lean, so it stays out.
    expect(block).not.toContain("image");
  });

  it("caps how many lines each side can contribute", () => {
    const events: OutcomeEvent[] = [];
    for (const platform of ["A", "B", "C", "D", "E", "F"]) {
      events.push(...many(3, { outcome: "discarded", platform }));
    }
    expect(formatOutcomesForPrompt(events).split("\n")).toHaveLength(4);
  });
});

describe("constants", () => {
  it("stores outcome events under their own category", () => {
    expect(OUTCOME_CATEGORY).toBe("content_outcome");
  });

  it("leaves a genuine dead zone between the two verdicts", () => {
    expect(KEEP_RATE_LOW).toBeLessThan(KEEP_RATE_HIGH);
  });
});
