/**
 * WHAT THE CLIENT IS ALLOWED TO SEE OF A RUN
 *
 * The row has more on it than the browser needs — and in the artifacts it has
 * things the browser must not be handed as truth without the stage that produced
 * them. These are the serialisable views, and they are the only shapes the
 * Article Writer screen reads.
 *
 * Client-safe: no Prisma, no model SDK, no fetch. `stages.ts` is the only import.
 */

import { stagesFor } from "./stages";
import type { ArticleRunMode, ArticleRunStatus, ArticleStageKey } from "./stages";

/** Per-stage status as it is stored. `skipped` only ever means "not in this mode". */
export type ArticleStageStatus =
  | "pending"
  | "running"
  | "done"
  | "blocked"
  | "failed"
  | "skipped";

export interface ArticleStageView {
  stage: ArticleStageKey;
  order: number;
  status: ArticleStageStatus;
  /** True when this stage wrote an artifact. The payload itself is fetched on demand. */
  hasArtifact: boolean;
  error?: string;
  durationMs?: number;
  modelCalls: number;
  finishedAt?: string;
}

/** The four numbers the plan puts on the run row. Absent until `score` has run. */
export interface ArticleRunScores {
  quality: number;
  /** Reported on its own, never folded into `quality`. */
  differentiation: number;
  trust: number;
  relevance: number;
}

export interface ArticleRunView {
  id: string;
  mode: ArticleRunMode;
  status: ArticleRunStatus;
  currentStage: ArticleStageKey;
  /** 1-based, within this mode's list. */
  position: number;
  total: number;
  stages: ArticleStageView[];
  scores?: ArticleRunScores;
  blockedBy?: ArticleStageKey;
  blockedReason?: string;
  startedAt?: string;
  finishedAt?: string;
}

/**
 * One stage's status, as a panel has to ask about it.
 *
 * `unavailable` is a seventh answer that no row can hold, and it is the reason
 * this is a function rather than a lookup: a stage this mode never runs has no
 * row at all, and reporting it as `pending` would promise the person a step
 * nothing in their pipeline intends to take. Quick mode does not crawl the site.
 *
 * A stage that is in the mode and has no row yet is `pending`, which is what it
 * is — the row is written when the stage is claimed, not when the run starts.
 */
export function stageStatusIn(
  run: ArticleRunView,
  stage: ArticleStageKey
): ArticleStageStatus | "unavailable" {
  if (!stagesFor(run.mode).some((spec) => spec.key === stage)) return "unavailable";
  return run.stages.find((row) => row.stage === stage)?.status ?? "pending";
}
