/**
 * THE PIPELINE, COMPOSED
 *
 * `stages.ts` says what the pipeline is. This file says who does each step: one
 * map from stage key to runner, and one function that advances a run by exactly
 * one stage — claim it, build its context out of the database, run it, record
 * what came back.
 *
 * Two things it deliberately will not do.
 *
 * A stage with no agent behind it is never skipped. `skipped` means this run does
 * not need the step — media on a draft that takes no images — and a step nobody
 * has written yet is a different fact entirely. It blocks the run and names
 * itself, because a run that ticked past eleven unwritten stages would end by
 * reporting a finished article that nothing had checked.
 *
 * And nothing here chooses the mode. The mode is on the run row, fixed when the
 * run was started, and is never inferred from a plan code, a subscription tier,
 * or how much time is left in the request.
 *
 * Server-only: Prisma through the run store, models through the capability router.
 */

import { readBriefRow } from "@/lib/article/brief";
import {
  blockRun,
  claimStage,
  completeStage,
  failStage,
  loadArtifacts,
  loadArticleRun,
  readBrief,
  readState,
  saveScores,
  skipStage,
  toRunView,
} from "@/lib/article/runStore";
import {
  stageSpec,
  stagesFor,
  type ArticleRunMode,
  type ArticleStageKey,
} from "@/lib/article/stages";
import type { ArticleRunView } from "@/lib/article/types";
import { buildBrandProfile, type BrandProfileSource } from "@/lib/brand/profile";
import type { StageContext, StageResult, StageRunner, WorkspaceFacts } from "./contract";
import { newMeter } from "./router";

import { runBusinessStage } from "./business";
import { runCannibalizationStage } from "./cannibalization";
import { runContentTypeStage } from "./contentType";
import { runEditorStage } from "./editor";
import { runEeatStage } from "./eeat";
import { runEvidenceGateStage } from "./evidenceGate";
import { runFactCheckStage } from "./factcheck";
import { runGapsStage } from "./gaps";
import { runGateStage } from "./gate";
import { runIntentStage } from "./intent";
import { runInventoryStage } from "./inventory";
import { runLinksStage } from "./links";
import { runMediaStage } from "./media";
import { runOpportunityStage } from "./opportunity";
import { runOriginalityStage } from "./originality";
import { runOutlineStage } from "./outline";
import { runResearchStage } from "./research";
import { runSchemaStage } from "./schema";
import { runScoreStage } from "./score";
import { runSeoStage } from "./seo";
import { runSerpStage } from "./serp";
import { runStrategyStage } from "./strategy";
import { runWriteStage } from "./write";

/**
 * Who runs what.
 *
 * Every stage of both pipelines is here, so `unimplementedStages` is empty for
 * quick and for deep and neither mode can be started into a step nothing can
 * perform. The type stays `Partial` on purpose: it is what makes adding a
 * twenty-fourth stage to `stages.ts` a blocked run that names itself rather than a
 * `undefined is not a function` in the middle of a request somebody paid for.
 */
const STAGE_RUNNERS: Partial<Record<ArticleStageKey, StageRunner>> = {
  business: runBusinessStage,
  inventory: runInventoryStage,
  content_type: runContentTypeStage,
  intent: runIntentStage,
  serp: runSerpStage,
  gaps: runGapsStage,
  opportunity: runOpportunityStage,
  strategy: runStrategyStage,
  outline: runOutlineStage,
  research: runResearchStage,
  evidence_gate: runEvidenceGateStage,
  write: runWriteStage,
  originality: runOriginalityStage,
  factcheck: runFactCheckStage,
  eeat: runEeatStage,
  seo: runSeoStage,
  cannibalization: runCannibalizationStage,
  links: runLinksStage,
  media: runMediaStage,
  schema: runSchemaStage,
  editor: runEditorStage,
  score: runScoreStage,
  gate: runGateStage,
};

/**
 * How long one stage gets.
 *
 * The route declares `maxDuration = 300`, and the stage is not the only thing in
 * the request: the run is loaded first and the artifact is written afterwards. A
 * stage that loops over sections reads this deadline and stops while there is
 * still time to save what it has. The route passes a deadline measured from when
 * the request arrived, so the budget is real rather than restarted mid-handler.
 */
export const STAGE_BUDGET_MS = 240_000;


/** The runner for a stage, or null when this build has none. */
export function stageRunner(stage: ArticleStageKey): StageRunner | null {
  return STAGE_RUNNERS[stage] ?? null;
}

/** The stages this mode would need and this build cannot run, in pipeline order. */
export function unimplementedStages(mode: ArticleRunMode): ArticleStageKey[] {
  return stagesFor(mode)
    .filter((spec) => !STAGE_RUNNERS[spec.key])
    .map((spec) => spec.key);
}

/**
 * Why a run in this mode cannot be started, or null when it can.
 *
 * Checked at the door rather than discovered halfway through. A deep run that
 * stopped at stage two would already have been paid for, and the person who
 * started it would have a blocked run to clear up instead of a message telling
 * them which pipeline to pick.
 */
export function modeUnavailableReason(mode: ArticleRunMode): string | null {
  const missing = unimplementedStages(mode);
  if (missing.length === 0) return null;
  const labels = missing.map((key) => stageSpec(key).label);
  const complete = (["quick", "deep"] as ArticleRunMode[]).filter(
    (candidate) => candidate !== mode && unimplementedStages(candidate).length === 0
  );
  const alternative = complete.length
    ? ` The ${complete.join(" and ")} pipeline runs end to end and is what to use in the meantime.`
    : "";
  return `${labels.length} of this pipeline's stages have no agent behind them in this build — ${labels.join(
    ", "
  )} — so a run started in ${mode} mode would stop at the first of them rather than finish.${alternative}`;
}

/**
 * A stage the pipeline lists and this build cannot perform.
 *
 * Blocked, not skipped, and the difference is the whole point: skipping it would
 * tell the user the step was considered and found unnecessary. The run keeps
 * every artifact it has already produced.
 */
function noRunnerReason(stage: ArticleStageKey): string {
  const spec = stageSpec(stage);
  return `“${spec.label}” has no agent behind it in this build, so the run stops here instead of ticking the step past. What it would have done: ${spec.detail} Every stage before this one is recorded and nothing it produced is lost.`;
}

/**
 * The business, as the stages receive it.
 *
 * Built from the workspace row the route already resolved and re-checked against
 * the signed-in user, so no stage ever loads a workspace by an id it was handed.
 * Absent facts stay as empty strings: `businessLines` omits them, and the
 * business stage reports what it could not prove.
 */
export function workspaceFacts(
  row: BrandProfileSource & { id: string; website?: string | null }
): WorkspaceFacts {
  return {
    workspaceId: row.id,
    name: (row.name || "").trim(),
    website: (row.website || "").trim(),
    brand: buildBrandProfile(row),
  };
}

/**
 * The four numbers, onto the run row.
 *
 * They are inside the score artifact as well, but the run list shows a score
 * without loading an artifact, so the row carries them too. All four or none:
 * `readScores` refuses a partial object, so writing one would put a score on the
 * row that nothing will ever read.
 */
async function persistScores(
  runId: string,
  patch: Record<string, unknown> | undefined
): Promise<void> {
  const num = (key: string): number | null => {
    const found = patch?.[key];
    return typeof found === "number" && Number.isFinite(found) ? found : null;
  };
  const quality = num("qualityTotal");
  const differentiation = num("differentiationScore");
  const trust = num("trustScore");
  const relevance = num("relevanceScore");
  if (quality === null || differentiation === null || trust === null || relevance === null) {
    return;
  }
  await saveScores(runId, { quality, differentiation, trust, relevance });
}

// ---------------------------------------------------------------------------
// ADVANCE ONE STAGE
// ---------------------------------------------------------------------------

export interface AdvanceInput {
  /** Already resolved by id and re-checked against the signed-in user. */
  workspace: WorkspaceFacts;
  runId: string;
  signal?: AbortSignal;
  /** Epoch ms the stage must finish by. Defaults to this request's own budget. */
  deadline?: number;
}

/** What happened to the one stage this request ran. */
export interface AdvanceOutcome {
  /** The run after the row was written, which is the only progress the UI draws. */
  view: ArticleRunView;
  stage: ArticleStageKey;
  /**
   * - `done`     — it finished; `next` is what to ask for.
   * - `blocked`  — the run stops here and `message` is the blocker's own words.
   * - `skipped`  — this run does not need the stage, and `message` says why.
   * - `failed`   — it threw. The row stays claimable, so continue retries it.
   * - `busy`     — another request already holds this stage. Nothing was run.
   * - `finished` — the run had already reached the end. Nothing was run.
   */
  outcome: "done" | "blocked" | "skipped" | "failed" | "busy" | "finished";
  /** The stage to advance to next, or null when there is nothing left to run. */
  next: ArticleStageKey | null;
  message?: string;
  /** True when the user pressed Stop. Recorded as a failure, but not one. */
  stopped?: boolean;
  /** Counted, not estimated: what this stage actually spent. */
  modelCalls: number;
}

/**
 * Advance a run by exactly one stage.
 *
 * One stage per request, because twenty-three of them cannot share a function the
 * platform kills at 300 seconds. The stage to run is read from the row, never
 * from the request: a browser holding stale state cannot re-run a stage that has
 * already been paid for, and two tabs pressing continue cannot both run one.
 *
 * Returns null when there is no such run for this workspace. The caller says the
 * same thing for a run that does not exist and a run that belongs to somebody
 * else, so this cannot be used to find out which.
 */
export async function advanceArticleRun(input: AdvanceInput): Promise<AdvanceOutcome | null> {
  const run = await loadArticleRun(input.workspace.workspaceId, input.runId);
  if (!run) return null;

  const runId = String(run.id);
  const view = toRunView(run);
  const { mode, currentStage: stage } = view;

  if (view.status === "done") {
    return {
      view,
      stage,
      outcome: "finished",
      next: null,
      modelCalls: 0,
      message: "This run has already been through every stage of its pipeline.",
    };
  }

  const runner = STAGE_RUNNERS[stage];
  if (!runner) {
    const reason = noRunnerReason(stage);
    return {
      view: await blockRun({ runId, stage, reason }),
      stage,
      outcome: "blocked",
      next: null,
      message: reason,
      modelCalls: 0,
    };
  }

  // The lease. A stage nobody else holds moves to `running` here and nowhere
  // else, so the second tab is told the stage is busy instead of buying it twice.
  if (!(await claimStage(runId, stage))) {
    return {
      view,
      stage,
      outcome: "busy",
      next: stage,
      modelCalls: 0,
      message: `“${stageSpec(stage).label}” is already running — another tab or an earlier request is doing it. This one did nothing.`,
    };
  }

  const meter = newMeter();
  const ctx: StageContext = {
    runId,
    mode,
    workspace: input.workspace,
    brief: readBriefRow(readBrief(run)),
    state: readState(run),
    artifacts: await loadArtifacts(runId),
    meter,
    signal: input.signal,
    deadline: input.deadline ?? Date.now() + STAGE_BUDGET_MS,
  };

  const startedAt = Date.now();
  let result: StageResult;
  try {
    result = await runner(ctx);
  } catch (error) {
    const stopped = Boolean((error as { isCancelled?: boolean })?.isCancelled) || Boolean(input.signal?.aborted);
    const message = stopped
      ? "You stopped the run before this stage finished, so nothing was saved for it. Continue runs this stage again from the start."
      : (error as Error)?.message ||
        "The stage threw an error with no message. Continue runs it again.";
    return {
      view: await failStage({ runId, stage, error: message }),
      stage,
      outcome: "failed",
      next: stage,
      message,
      stopped: stopped || undefined,
      modelCalls: meter.calls,
    };
  }

  if (result.kind === "skipped") {
    const skip = await skipStage({ runId, mode, stage, reason: result.reason });
    return {
      view: skip.view,
      stage,
      outcome: "skipped",
      next: skip.next,
      message: result.reason,
      modelCalls: meter.calls,
    };
  }

  if (result.kind === "blocked") {
    // Whatever it had got to is stored with the block, so the panel can show the
    // evidence the stage stopped on rather than only the sentence about it.
    return {
      view: await blockRun({ runId, stage, reason: result.reason, artifact: result.artifact }),
      stage,
      outcome: "blocked",
      next: null,
      message: result.reason,
      modelCalls: meter.calls,
    };
  }

  // The four numbers go on the run row before the stage is completed, because the
  // view returned by `completeStage` is what the client renders — writing them
  // afterwards would show a finished score stage with no score beside it.
  if (stage === "score") await persistScores(runId, result.statePatch);

  const finished = await completeStage({
    runId,
    mode,
    stage,
    artifact: result.artifact,
    statePatch: result.statePatch,
    modelCalls: meter.calls,
    durationMs: Date.now() - startedAt,
  });
  return {
    view: finished.view,
    stage,
    outcome: "done",
    next: finished.next,
    modelCalls: meter.calls,
  };
}
