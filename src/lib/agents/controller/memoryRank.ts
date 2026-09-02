// ============================================================================
// MEMORY RANK — the reinforcement half of recall ordering
//
// loadMemoryContext writes hitCount / lastUsedAt back on every recall. This is
// the module that finally READS them: a fact the workspace leans on (used often,
// used recently) earns a small, bounded lift so it surfaces above a fact of
// equal importance that nobody touches.
//
// Deliberately gentle. Reinforcement is a TIEBREAKER, not a takeover:
//   - pinned  is a hard tier — pinned facts always rank above non-pinned.
//   - importance is a hard tier — importance 5 always ranks above importance 4.
//   - reinforcement only reorders facts WITHIN one importance tier, and even
//     there similarity still dominates (see engagementScore). To overturn a
//     full 1.0 similarity gap on frequency alone you'd need ~4.6M hits.
//
// Pure module — no prisma, no embeddings, no clock except the nowMs passed in —
// so it stays unit-testable in the node vitest env with zero side effects.
// ============================================================================

export interface RankableFact {
  pinned: boolean;
  importance: number;
  similarity: number;
  hitCount: number;
  lastUsedAt: Date | null;
}

/** A fact used today counts full recency weight; at 14 days it's halved. */
export const RECALL_HALF_LIFE_DAYS = 14;
/** Lift from raw usage frequency (log-damped, so it saturates gracefully). */
export const REINFORCE_FREQ_WEIGHT = 0.15;
/** Lift from how recently the fact was last recalled. */
export const REINFORCE_RECENCY_WEIGHT = 0.1;

const DAY_MS = 86_400_000;

/**
 * The bounded nudge a fact earns from being used. Frequency is log10-damped so
 * the first few hits matter and the thousandth barely moves it; recency decays
 * on a half-life so a fact goes "cold" if it stops being recalled. A brand-new
 * cold fact (0 hits, never used) scores exactly 0 and is ranked purely on its
 * own merits.
 */
export function reinforcementScore(fact: RankableFact, nowMs: number): number {
  const freq = Math.log10(1 + Math.max(0, fact.hitCount || 0));
  let recency = 0;
  if (fact.lastUsedAt) {
    const ageDays = Math.max(0, (nowMs - fact.lastUsedAt.getTime()) / DAY_MS);
    recency = Math.pow(0.5, ageDays / RECALL_HALF_LIFE_DAYS);
  }
  return REINFORCE_FREQ_WEIGHT * freq + REINFORCE_RECENCY_WEIGHT * recency;
}

/**
 * The within-tier ordering key: semantic similarity plus the reinforcement
 * nudge. Similarity is the dominant term (range 0..1); reinforcement adds at
 * most ~0.4 for a very hot fact, so it breaks near-ties and gently promotes
 * well-worn facts without ever burying a strong fresh match.
 */
export function engagementScore(fact: RankableFact, nowMs: number): number {
  return (fact.similarity || 0) + reinforcementScore(fact, nowMs);
}

/**
 * Orders recalled facts for the prompt. Hard tiers first (pinned, then
 * importance), reinforcement-aware engagement within a tier. Returns a NEW
 * array — the caller's collection is never mutated.
 */
export function rankFacts<T extends RankableFact>(facts: T[], nowMs: number): T[] {
  return [...facts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.importance !== b.importance) return b.importance - a.importance;
    return engagementScore(b, nowMs) - engagementScore(a, nowMs);
  });
}
