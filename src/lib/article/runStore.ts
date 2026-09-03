/**
 * A RUN, ADVANCED ONE STAGE AT A TIME
 *
 * The platform kills a function at 300 seconds, so twenty-three stages cannot
 * share one request. Every stage therefore ends in a row: the caller advances
 * the run, this file records what happened, and the next request picks up from
 * the database rather than from anything the browser was holding.
 *
 * That is what stops the screen inventing progress. Each step the user sees is
 * drawn from its row, so a tick means a row said done and there is an artifact
 * behind it.
 *
 * Server-only — it imports Prisma. The shapes it hands back live in `types.ts`,
 * which a client component may import.
 */

import prisma from "@/lib/db";
import {
  firstStage,
  isArticleStageKey,
  nextStage,
  stageCount,
  stagePosition,
  stagesFor,
  type ArticleRunMode,
  type ArticleRunStatus,
  type ArticleStageKey,
} from "./stages";
import type {
  ArticleRunScores,
  ArticleRunView,
  ArticleStageStatus,
  ArticleStageView,
} from "./types";

/**
 * The four models behind a run are new, and this project has no migrations
 * directory, so a generated client can lag the schema. One alias keeps the
 * reason written down once instead of a cast at every call site.
 */
const db = prisma as any;

/**
 * A stage that claims to have been running for longer than the platform lets a
 * function live is not running: whatever claimed it is already dead.
 */
const STAGE_LEASE_MS = 300_000;

/** Whatever the brief screen collected, stored verbatim so a rerun is faithful. */
export type ArticleRunBrief = Record<string, unknown>;
/** A row as the untyped client hands it back. Read through the coercions below. */
type RunRow = Record<string, any>;
type StageRow = Record<string, any>;

const STAGE_STATUSES: ArticleStageStatus[] = [
  "pending",
  "running",
  "done",
  "blocked",
  "failed",
  "skipped",
];

const RUN_STATUSES: ArticleRunStatus[] = ["idle", "running", "blocked", "done", "failed"];

function asStageStatus(value: unknown): ArticleStageStatus {
  return STAGE_STATUSES.includes(value as ArticleStageStatus)
    ? (value as ArticleStageStatus)
    : "pending";
}

function asRunStatus(value: unknown): ArticleRunStatus {
  return RUN_STATUSES.includes(value as ArticleRunStatus)
    ? (value as ArticleRunStatus)
    : "idle";
}

/** Anything that is not the deep pipeline is the quick one. There is no third mode. */
function asMode(value: unknown): ArticleRunMode {
  return value === "deep" ? "deep" : "quick";
}

function iso(value: unknown): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
/**
 * The four numbers, or nothing.
 *
 * A half-filled score object would be drawn as a real score, so a row missing
 * any one of them reports no score at all rather than a zero the user would read
 * as a verdict.
 */
export function readScores(value: unknown): ArticleRunScores | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const num = (key: string): number | null => {
    const found = raw[key];
    return typeof found === "number" && Number.isFinite(found) ? found : null;
  };
  const quality = num("quality");
  const differentiation = num("differentiation");
  const trust = num("trust");
  const relevance = num("relevance");
  if (quality === null || differentiation === null || trust === null || relevance === null) {
    return undefined;
  }
  return { quality, differentiation, trust, relevance };
}

/** The state earlier stages accumulated, as an object even when the column is null. */
export function readState(run: RunRow): Record<string, unknown> {
  const state = run?.state;
  return state && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

/** The brief the run was started from. Same treatment: an object, or empty. */
export function readBrief(run: RunRow): ArticleRunBrief {
  const brief = run?.brief;
  return brief && typeof brief === "object" && !Array.isArray(brief)
    ? (brief as ArticleRunBrief)
    : {};
}
/**
 * The run as the browser is allowed to see it.
 *
 * Artifacts are reported as present or absent, never inlined: some of them are
 * large, and the ones that matter — the draft, the evidence table — are fetched
 * by the panel that knows how to read them.
 */
export function toRunView(run: RunRow): ArticleRunView {
  const mode = asMode(run.mode);
  const rows: StageRow[] = Array.isArray(run.stages) ? run.stages : [];
  const stages: ArticleStageView[] = rows
    .filter((row) => isArticleStageKey(row?.stage))
    .map((row) => ({
      stage: row.stage as ArticleStageKey,
      order: count(row.order),
      status: asStageStatus(row.status),
      hasArtifact: row.artifact !== null && row.artifact !== undefined,
      error: text(row.error),
      durationMs: typeof row.durationMs === "number" ? count(row.durationMs) : undefined,
      modelCalls: count(row.modelCalls),
      finishedAt: iso(row.finishedAt),
    }))
    .sort((a, b) => a.order - b.order);

  const currentStage: ArticleStageKey = isArticleStageKey(run.currentStage)
    ? run.currentStage
    : firstStage(mode).key;

  return {
    id: String(run.id),
    mode,
    status: asRunStatus(run.status),
    currentStage,
    position: Math.max(1, stagePosition(mode, currentStage)),
    total: stageCount(mode),
    stages,
    scores: readScores(run.scores),
    blockedBy: isArticleStageKey(run.blockedBy) ? run.blockedBy : undefined,
    blockedReason: text(run.blockedReason),
    startedAt: iso(run.startedAt),
    finishedAt: iso(run.finishedAt),
  };
}
// ---------------------------------------------------------------------------
// CREATE AND READ
// ---------------------------------------------------------------------------

/**
 * A new run, with one row per stage it intends to execute.
 *
 * The rows are written up front and empty, which is why the progress list is
 * honest from the first paint: every step on screen exists, and none of them
 * claims anything yet. Nothing is executed here.
 */
export async function createArticleRun(input: {
  workspaceId: string;
  mode: ArticleRunMode;
  brief: ArticleRunBrief;
}): Promise<ArticleRunView> {
  const list = stagesFor(input.mode);
  const run = await db.articleRun.create({
    data: {
      workspaceId: input.workspaceId,
      mode: input.mode,
      status: "idle",
      currentStage: firstStage(input.mode).key,
      brief: input.brief,
      stages: {
        create: list.map((stage) => ({
          stage: stage.key,
          order: stage.order,
          status: "pending",
        })),
      },
    },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  return toRunView(run as RunRow);
}

/**
 * A run, only if this workspace owns it.
 *
 * The id arrives in a request body, so ownership is part of the query rather
 * than a check someone can forget to make afterwards.
 */
export async function loadArticleRun(
  workspaceId: string,
  runId: unknown
): Promise<RunRow | null> {
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) return null;
  const run = await db.articleRun.findFirst({
    where: { id, workspaceId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  return (run as RunRow) ?? null;
}
/** One stage's artifact, for the panel that knows how to read it. */
export async function loadStageArtifact(
  workspaceId: string,
  runId: unknown,
  stage: ArticleStageKey
): Promise<unknown | null> {
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) return null;
  const row = await db.articleStage.findFirst({
    where: { runId: id, stage, run: { workspaceId } },
    select: { artifact: true },
  });
  return row?.artifact ?? null;
}

/** Every artifact this run has produced, keyed by stage, for the stages downstream. */
export async function loadArtifacts(
  runId: string
): Promise<Partial<Record<ArticleStageKey, unknown>>> {
  const rows: StageRow[] = await db.articleStage.findMany({
    where: { runId, status: "done", NOT: { artifact: null } },
    select: { stage: true, artifact: true },
  });
  const out: Partial<Record<ArticleStageKey, unknown>> = {};
  for (const row of rows) {
    if (isArticleStageKey(row.stage)) out[row.stage] = row.artifact;
  }
  return out;
}

/** The workspace's recent runs, newest first, for the "pick up where you left off" list. */
export async function listArticleRuns(
  workspaceId: string,
  limit = 10
): Promise<ArticleRunView[]> {
  const runs: RunRow[] = await db.articleRun.findMany({
    where: { workspaceId },
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(50, Math.max(1, Math.round(limit))),
  });
  return runs.map((run) => toRunView(run));
}
// ---------------------------------------------------------------------------
// ADVANCING
// ---------------------------------------------------------------------------

/**
 * Take the stage, or find it already taken.
 *
 * Two tabs pressing continue at the same moment would otherwise both run the
 * same stage and both pay for it. The claim is a conditional update: only one
 * request can move a row out of `pending`, and the loser is told so. A stage
 * already `done` is never re-claimed — that is what stops a retry rewriting an
 * artifact a later stage has already read.
 *
 * A `running` row older than the platform's own function ceiling is treated as
 * abandoned, because by then the request that claimed it cannot still be alive.
 */
export async function claimStage(runId: string, stage: ArticleStageKey): Promise<boolean> {
  const now = new Date();
  const expired = new Date(now.getTime() - STAGE_LEASE_MS);
  const claimed = await db.articleStage.updateMany({
    where: {
      runId,
      stage,
      OR: [
        { status: { in: ["pending", "failed", "blocked", "skipped"] } },
        { status: "running", startedAt: { lt: expired } },
        { status: "running", startedAt: null },
      ],
    },
    data: { status: "running", startedAt: now, finishedAt: null, error: null },
  });
  if (!count(claimed?.count)) return false;

  const existing: RunRow | null = await db.articleRun.findUnique({
    where: { id: runId },
    select: { startedAt: true },
  });
  await db.articleRun.update({
    where: { id: runId },
    data: {
      status: "running",
      currentStage: stage,
      stageStartedAt: now,
      startedAt: existing?.startedAt ?? now,
      finishedAt: null,
      blockedBy: null,
      blockedReason: null,
    },
  });
  return true;
}
/**
 * A stage finished. Write what it produced, then point the run at the next one.
 *
 * `statePatch` is merged over the run's state, never swapped for it: stage
 * eleven still needs what stage four established. When there is no next stage
 * the run is `done`, and that is the only place a run becomes done.
 */
export async function completeStage(input: {
  runId: string;
  mode: ArticleRunMode;
  stage: ArticleStageKey;
  artifact?: unknown;
  statePatch?: Record<string, unknown>;
  modelCalls?: number;
  durationMs?: number;
}): Promise<{ next: ArticleStageKey | null; view: ArticleRunView }> {
  const upcoming = nextStage(input.mode, input.stage);
  const finishedAt = new Date();

  const row: StageRow | null = await db.articleStage.findFirst({
    where: { runId: input.runId, stage: input.stage },
    select: { startedAt: true },
  });
  const measured =
    input.durationMs != null
      ? count(input.durationMs)
      : row?.startedAt instanceof Date
        ? Math.max(0, finishedAt.getTime() - row.startedAt.getTime())
        : undefined;

  await db.articleStage.updateMany({
    where: { runId: input.runId, stage: input.stage },
    data: {
      status: "done",
      artifact: input.artifact === undefined ? undefined : input.artifact,
      modelCalls: count(input.modelCalls),
      durationMs: measured,
      error: null,
      finishedAt,
    },
  });

  let state: Record<string, unknown> | undefined;
  if (input.statePatch) {
    const current: RunRow | null = await db.articleRun.findUnique({
      where: { id: input.runId },
      select: { state: true },
    });
    state = { ...readState(current ?? {}), ...input.statePatch };
  }

  await db.articleRun.update({
    where: { id: input.runId },
    data: {
      currentStage: upcoming ? upcoming.key : input.stage,
      status: upcoming ? "running" : "done",
      stageStartedAt: null,
      finishedAt: upcoming ? null : finishedAt,
      blockedBy: null,
      blockedReason: null,
      state,
    },
  });

  return { next: upcoming?.key ?? null, view: await requireRunView(input.runId) };
}
/** The run as the client reads it, straight after a write. */
async function requireRunView(runId: string): Promise<ArticleRunView> {
  const run: RunRow | null = await db.articleRun.findUnique({
    where: { id: runId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!run) throw new Error("The run disappeared while it was being advanced.");
  return toRunView(run);
}

/**
 * A stage the run legitimately cannot do — inventory with no website connected,
 * media on a draft that takes no images.
 *
 * It is recorded with its reason rather than quietly ticked, because a step the
 * user watches go past has to say what happened to it.
 */
export async function skipStage(input: {
  runId: string;
  mode: ArticleRunMode;
  stage: ArticleStageKey;
  reason: string;
}): Promise<{ next: ArticleStageKey | null; view: ArticleRunView }> {
  const upcoming = nextStage(input.mode, input.stage);
  const finishedAt = new Date();
  await db.articleStage.updateMany({
    where: { runId: input.runId, stage: input.stage },
    data: { status: "skipped", error: input.reason, finishedAt },
  });
  await db.articleRun.update({
    where: { id: input.runId },
    data: {
      currentStage: upcoming ? upcoming.key : input.stage,
      status: upcoming ? "running" : "done",
      stageStartedAt: null,
      finishedAt: upcoming ? null : finishedAt,
    },
  });
  return { next: upcoming?.key ?? null, view: await requireRunView(input.runId) };
}
/**
 * The run stops here, and the reason is the blocker's own words.
 *
 * This is the evidence gate refusing a claim its source does not support, or the
 * publish gate naming the check that failed. The run keeps everything it has
 * built: blocked is a state a person can act on and continue from, not a loss.
 */
export async function blockRun(input: {
  runId: string;
  stage: ArticleStageKey;
  reason: string;
  artifact?: unknown;
}): Promise<ArticleRunView> {
  const finishedAt = new Date();
  await db.articleStage.updateMany({
    where: { runId: input.runId, stage: input.stage },
    data: {
      status: "blocked",
      error: input.reason,
      artifact: input.artifact === undefined ? undefined : input.artifact,
      finishedAt,
    },
  });
  await db.articleRun.update({
    where: { id: input.runId },
    data: {
      status: "blocked",
      currentStage: input.stage,
      stageStartedAt: null,
      blockedBy: input.stage,
      blockedReason: input.reason,
    },
  });
  return requireRunView(input.runId);
}
/**
 * The stage threw. The message is stored on the stage, not swallowed.
 *
 * The row goes back to being claimable, so pressing continue retries this stage
 * instead of starting the whole run again.
 */
export async function failStage(input: {
  runId: string;
  stage: ArticleStageKey;
  error: string;
}): Promise<ArticleRunView> {
  await db.articleStage.updateMany({
    where: { runId: input.runId, stage: input.stage },
    data: { status: "failed", error: input.error, finishedAt: new Date() },
  });
  await db.articleRun.update({
    where: { id: input.runId },
    data: { status: "failed", currentStage: input.stage, stageStartedAt: null },
  });
  return requireRunView(input.runId);
}

/**
 * The four numbers from the scoring stage.
 *
 * Differentiation is stored beside quality, never inside it: the plan reports it
 * as its own figure, and averaging it away is how a derivative draft passes.
 */
export async function saveScores(
  runId: string,
  scores: ArticleRunScores
): Promise<void> {
  await db.articleRun.update({
    where: { id: runId },
    data: {
      scores: {
        quality: scores.quality,
        differentiation: scores.differentiation,
        trust: scores.trust,
        relevance: scores.relevance,
      },
    },
  });
}

