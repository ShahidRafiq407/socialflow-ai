/**
 * WHAT A STAGE IS
 *
 * One function, one stage, one artifact. A stage receives everything earlier
 * stages established and returns one of three things: it finished and here is
 * what it produced, it is blocking the run and here is exactly why, or it does
 * not apply to this run and here is why not.
 *
 * There is deliberately no fourth option. A stage cannot "partially" succeed and
 * leave the next stage guessing, and it cannot report success with an empty
 * artifact — that is how the previous build produced articles whose research
 * section was a list of plausible-looking URLs nobody had fetched.
 *
 * Server-side contract. The stage files import this; `articleGraph.ts` composes
 * them.
 */

import type { ArticleBrief } from "@/lib/article/brief";
import type { ArticleRunMode, ArticleStageKey } from "@/lib/article/stages";
import type { BrandProfile } from "@/lib/brand/profile";
import type { ModelMeter } from "./router";

/** The business, as far as it is actually known. Empty strings mean "not on file". */
export interface WorkspaceFacts {
  workspaceId: string;
  /** The workspace's own name — the real row, never a placeholder. */
  name: string;
  /** The site the business runs, when one is connected or set. */
  website: string;
  brand: BrandProfile;
}

export interface StageContext {
  runId: string;
  mode: ArticleRunMode;
  workspace: WorkspaceFacts;
  brief: ArticleBrief;
  /** Small facts earlier stages recorded for later ones. */
  state: Record<string, unknown>;
  /** Every artifact this run has produced so far, keyed by stage. */
  artifacts: Partial<Record<ArticleStageKey, unknown>>;
  /** Counts this stage's model calls. The row stores the count, not a guess. */
  meter: ModelMeter;
  signal?: AbortSignal;
  /**
   * Epoch ms this stage must be finished by. The platform kills the function at
   * 300s, so a stage that loops over sections checks this and stops.
   */
  deadline: number;
}
export type StageResult =
  | {
      kind: "done";
      /** What the stage produced. Stored on the row and read by later stages. */
      artifact?: unknown;
      /** Small facts for later stages, merged over the run's state. */
      statePatch?: Record<string, unknown>;
    }
  | {
      kind: "blocked";
      /** The blocker in its own words — what failed, and what would fix it. */
      reason: string;
      /** What it had got to before it stopped, so the user can see the evidence. */
      artifact?: unknown;
    }
  | {
      kind: "skipped";
      /** Why this run does not need this stage. Shown next to the step. */
      reason: string;
    };

export type StageRunner = (ctx: StageContext) => Promise<StageResult>;

export function done(
  artifact?: unknown,
  statePatch?: Record<string, unknown>
): StageResult {
  return { kind: "done", artifact, statePatch };
}

export function blocked(reason: string, artifact?: unknown): StageResult {
  return { kind: "blocked", reason, artifact };
}

export function skipped(reason: string): StageResult {
  return { kind: "skipped", reason };
}

/** True when there is no time left to start another model call. */
export function outOfTime(ctx: StageContext, needMs = 25_000): boolean {
  return Date.now() + needMs >= ctx.deadline;
}

/** Throws if the user pressed Stop, so a cancelled run stops paying for calls. */
export function assertLive(ctx: StageContext): void {
  if (ctx.signal?.aborted) {
    const error: any = new Error("The run was stopped.");
    error.isCancelled = true;
    throw error;
  }
}
/**
 * An earlier stage's artifact, checked before it is used.
 *
 * A stage that needs the outline asks for it through the guard it wrote, so a
 * malformed artifact from an older run is caught here instead of halfway through
 * a prompt. Returns null when the artifact is absent or the wrong shape, and the
 * caller decides whether that blocks the run or is simply nothing to work with.
 */
export function readArtifact<T>(
  ctx: StageContext,
  stage: ArticleStageKey,
  guard: (value: unknown) => T | null
): T | null {
  const found = ctx.artifacts[stage];
  if (found === undefined || found === null) return null;
  return guard(found);
}

/** The business facts a prompt should carry, as lines. Absent facts are omitted. */
export function businessLines(facts: WorkspaceFacts): string[] {
  const brand = facts.brand;
  const lines: string[] = [];
  const add = (label: string, value: string) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };
  add("Business", brand.brandName || facts.name);
  add("Website", brand.website || facts.website);
  add("Industry", brand.industry);
  add("What it does", brand.missionVision);
  add("Who it serves", brand.targetAudience);
  add("Customer problems", brand.painPoints);
  add("Why customers pick it", brand.differentiator);
  add("Offer to close towards", brand.ctaOffer);
  add("Benchmark competitors", brand.competitors);
  add("Voice", brand.tone);
  add("Writing rules", brand.writingRules);
  if (brand.forbiddenWords.length) {
    lines.push(`Never use these words: ${brand.forbiddenWords.join(", ")}`);
  }
  return lines;
}

