/**
 * TRACE SUITE — recall reinforcement ordering
 *
 * WHY THIS EXISTS: loadMemoryContext has always WRITTEN hitCount / lastUsedAt on
 * every recall, but nothing ever READ them — the "facts you lean on rank higher"
 * promise in the header comment was dead. memoryRank is the code that makes it
 * true. The danger in making it true is over-correcting: a hot but irrelevant
 * fact must never bury a strong fresh match, and reinforcement must NEVER break
 * the two guarantees the controller relies on — pinned facts and high-importance
 * identity facts always surface. So this suite pins three things: the score is a
 * bounded nudge (0 for a cold fact, log-damped, half-life-decayed), similarity
 * still dominates within a tier, and the pinned / importance tiers are strict.
 *
 * Pure math on a passed-in clock, so it runs with no db, no model, no wall time.
 */
import { describe, it, expect } from "vitest";
import {
  reinforcementScore,
  engagementScore,
  rankFacts,
  RECALL_HALF_LIFE_DAYS,
  type RankableFact,
} from "@/lib/agents/controller/memoryRank";

const NOW = 1_700_000_000_000; // fixed epoch ms so every case is deterministic
const DAY_MS = 86_400_000;

function fact(partial: Partial<RankableFact> = {}): RankableFact {
  return {
    pinned: false,
    importance: 3,
    similarity: 0,
    hitCount: 0,
    lastUsedAt: null,
    ...partial,
  };
}

/** A Date `ageDays` before NOW. */
function daysAgo(ageDays: number): Date {
  return new Date(NOW - ageDays * DAY_MS);
}

describe("reinforcementScore", () => {
  it("is exactly 0 for a brand-new cold fact (never used, never recalled)", () => {
    expect(reinforcementScore(fact(), NOW)).toBe(0);
  });

  it("rises with hit count but log-damps (diminishing returns)", () => {
    const one = reinforcementScore(fact({ hitCount: 9 }), NOW); // log10(10) = 1
    const two = reinforcementScore(fact({ hitCount: 99 }), NOW); // log10(100) = 2
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
    // 90 extra hits (9→99) add the SAME as the first 9 did — pure log damping.
    expect(two - one).toBeCloseTo(one, 6);
  });

  it("treats missing / negative hit counts as zero, never NaN", () => {
    expect(reinforcementScore(fact({ hitCount: -5 }), NOW)).toBe(0);
    expect(reinforcementScore(fact({ hitCount: NaN }), NOW)).toBe(0);
  });

  it("gives a fact recalled today near-full recency weight", () => {
    // hitCount 0 isolates the recency term: 0.1 * 0.5^(0/14) = 0.1
    expect(reinforcementScore(fact({ lastUsedAt: daysAgo(0) }), NOW)).toBeCloseTo(0.1, 6);
  });

  it("halves the recency term at exactly one half-life", () => {
    const score = reinforcementScore(fact({ lastUsedAt: daysAgo(RECALL_HALF_LIFE_DAYS) }), NOW);
    expect(score).toBeCloseTo(0.05, 6); // 0.1 * 0.5
  });

  it("keeps decaying a stale fact toward (but never to) zero", () => {
    const oneHalfLife = reinforcementScore(fact({ lastUsedAt: daysAgo(RECALL_HALF_LIFE_DAYS) }), NOW);
    const twoHalfLives = reinforcementScore(fact({ lastUsedAt: daysAgo(RECALL_HALF_LIFE_DAYS * 2) }), NOW);
    expect(twoHalfLives).toBeCloseTo(0.025, 6); // 0.1 * 0.25
    expect(twoHalfLives).toBeLessThan(oneHalfLife);
    expect(twoHalfLives).toBeGreaterThan(0);
  });

  it("does not let a lastUsedAt in the future exceed the fresh-today weight", () => {
    // Clock skew shouldn't manufacture > 0.1 of recency lift.
    const future = reinforcementScore(fact({ lastUsedAt: new Date(NOW + 5 * DAY_MS) }), NOW);
    expect(future).toBeCloseTo(0.1, 6);
  });
});

describe("engagementScore", () => {
  it("adds the reinforcement nudge on top of raw similarity", () => {
    const base = engagementScore(fact({ similarity: 0.4 }), NOW);
    const nudged = engagementScore(fact({ similarity: 0.4, hitCount: 99, lastUsedAt: daysAgo(0) }), NOW);
    expect(base).toBeCloseTo(0.4, 6);
    expect(nudged).toBeGreaterThan(base);
  });

  it("keeps similarity dominant: a perfect cold match beats a weak but red-hot one", () => {
    const freshStrong = engagementScore(fact({ similarity: 1.0 }), NOW);
    const staleHot = engagementScore(
      fact({ similarity: 0.0, hitCount: 1000, lastUsedAt: daysAgo(0) }),
      NOW
    );
    expect(freshStrong).toBeGreaterThan(staleHot);
  });
});

describe("rankFacts", () => {
  it("returns a NEW array and does not mutate the caller's list", () => {
    const input = [fact({ importance: 3, similarity: 0.2 }), fact({ importance: 5, similarity: 0.1 })];
    const snapshot = [...input];
    const out = rankFacts(input, NOW);
    expect(out).not.toBe(input);
    expect(input).toEqual(snapshot); // original order untouched
  });

  it("orders pinned above everything non-pinned, regardless of importance or heat", () => {
    const pinnedWeak = fact({ pinned: true, importance: 1, similarity: 0 });
    const hotImportant = fact({ pinned: false, importance: 5, similarity: 1, hitCount: 1000, lastUsedAt: daysAgo(0) });
    const [first] = rankFacts([hotImportant, pinnedWeak], NOW);
    expect(first).toBe(pinnedWeak);
  });

  it("treats importance as a strict tier: importance 5 cold beats importance 4 red-hot", () => {
    const coldFive = fact({ importance: 5, similarity: 0 });
    const hotFour = fact({ importance: 4, similarity: 1, hitCount: 1_000_000, lastUsedAt: daysAgo(0) });
    const [first] = rankFacts([hotFour, coldFive], NOW);
    expect(first).toBe(coldFive);
  });

  it("within one importance tier, a well-worn fact outranks an equal-similarity cold one", () => {
    const cold = fact({ importance: 3, similarity: 0.5 });
    const hot = fact({ importance: 3, similarity: 0.5, hitCount: 50, lastUsedAt: daysAgo(1) });
    const [first] = rankFacts([cold, hot], NOW);
    expect(first).toBe(hot);
  });

  it("within a tier, a recently-used fact outranks an identical-usage stale one", () => {
    const stale = fact({ importance: 3, similarity: 0.5, hitCount: 10, lastUsedAt: daysAgo(60) });
    const recent = fact({ importance: 3, similarity: 0.5, hitCount: 10, lastUsedAt: daysAgo(1) });
    const [first] = rankFacts([stale, recent], NOW);
    expect(first).toBe(recent);
  });

  it("does not let reinforcement overturn a strong fresh match within a tier", () => {
    // The whole point: a hot fact must not bury a clearly-more-relevant fresh one.
    const freshRelevant = fact({ importance: 3, similarity: 0.95 });
    const wornMarginal = fact({ importance: 3, similarity: 0.4, hitCount: 500, lastUsedAt: daysAgo(0) });
    const [first] = rankFacts([wornMarginal, freshRelevant], NOW);
    expect(first).toBe(freshRelevant);
  });
});
