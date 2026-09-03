"use client";

/**
 * THE PROGRESS LIST, DRAWN FROM ROWS
 *
 * Every mark on this list is a database row. A tick means a stage wrote `done` and
 * an artifact came back with it; a spinner means a row currently says `running`.
 * There is no timer here, no estimate and no stage that gets ahead of the server —
 * the previous build animated a fixed list of six sentences against a countdown,
 * so the screen could show a step the server had never reached.
 *
 * The three states that are not progress are kept visibly apart, because they read
 * completely differently to the person waiting:
 *
 *   blocked — a stage did its job and refused the page. The reason is its own words.
 *   failed  — a stage threw. The row stays claimable, so Continue retries that stage.
 *   skipped — this run did not need the step, and the reason says why.
 */

import {
  Check,
  ChevronRight,
  CircleDashed,
  Loader2,
  Minus,
  ShieldAlert,
  Square,
  TriangleAlert,
} from "lucide-react";
import { stageSpec, stagesFor } from "@/lib/article/stages";
import type { ArticleRunView, ArticleStageStatus, ArticleStageView } from "@/lib/article/types";

export interface RunProgressProps {
  run: ArticleRunView;
  /** True while the browser is walking the run — the only thing the spinner follows. */
  walking: boolean;
  onStop?: () => void;
  onContinue?: () => void;
  /** A sentence about the run as a whole, when there is one to say. */
  note?: string | null;
}

/** Real elapsed time as the row recorded it. Never a projection. */
function duration(ms?: number): string {
  if (!ms || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}
const ICONS: Record<ArticleStageStatus, { icon: typeof Check; className: string }> = {
  done: { icon: Check, className: "text-primary" },
  running: { icon: Loader2, className: "text-primary animate-spin" },
  blocked: { icon: ShieldAlert, className: "text-destructive" },
  failed: { icon: TriangleAlert, className: "text-destructive" },
  skipped: { icon: Minus, className: "text-muted-foreground" },
  pending: { icon: CircleDashed, className: "text-muted-foreground/60" },
};

/** One row. The label and the sentence under it are the pipeline's own, from `stages.ts`. */
function StageRow({ view }: { view: ArticleStageView }) {
  const spec = stageSpec(view.stage);
  const { icon: Icon, className } = ICONS[view.status];
  const finished = view.status === "done";
  const problem = view.status === "blocked" || view.status === "failed";

  return (
    <li className="flex gap-2 py-1">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${className}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={`text-[11px] font-semibold ${
              view.status === "pending" ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {spec.label}
          </span>
          {finished && (
            <span className="text-[10px] text-muted-foreground">
              {[duration(view.durationMs), view.modelCalls ? `${view.modelCalls} model call${view.modelCalls === 1 ? "" : "s"}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {view.status === "running" && (
            <span className="text-[10px] text-primary">running now</span>
          )}
        </div>
        {view.status === "pending" || view.status === "running" ? (
          <p className="text-[10px] leading-snug text-muted-foreground">{spec.detail}</p>
        ) : null}
        {view.error && (
          <p
            className={`mt-0.5 text-[10px] leading-snug ${
              problem ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {view.error}
          </p>
        )}
      </div>
    </li>
  );
}
export default function RunProgress({
  run,
  walking,
  onStop,
  onContinue,
  note,
}: RunProgressProps) {
  // Every stage this mode intends to run, in pipeline order, whether or not it has
  // a row yet. A stage with no row is `pending` — which is what it is.
  const rows = stagesFor(run.mode).map(
    (spec) =>
      run.stages.find((stage) => stage.stage === spec.key) ?? {
        stage: spec.key,
        order: spec.order,
        status: "pending" as ArticleStageStatus,
        hasArtifact: false,
        modelCalls: 0,
      }
  );
  const finished = rows.filter((row) => row.status === "done" || row.status === "skipped").length;
  const calls = rows.reduce((sum, row) => sum + row.modelCalls, 0);
  const stalled = run.status === "blocked" || run.status === "failed";

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-foreground">
            {finished} of {run.total} stages
            <span className="ml-1.5 font-medium text-muted-foreground">
              · {run.mode === "deep" ? "deep pipeline" : "quick pipeline"}
              {calls > 0 ? ` · ${calls} model call${calls === 1 ? "" : "s"}` : ""}
            </span>
          </p>
          {run.scores && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Content Quality Score {run.scores.quality}/100 · differentiation{" "}
              {run.scores.differentiation}/100 · trust {run.scores.trust}/100 · business
              relevance {run.scores.relevance}/100
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {walking && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-semibold text-foreground hover:bg-muted"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          )}
          {!walking && stalled && onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"
            >
              Continue
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {/* A bar over finished rows, not over seconds. It cannot run ahead of the
          server because there is nothing in it but the count above. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            stalled ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${Math.round((finished / Math.max(1, run.total)) * 100)}%` }}
        />
      </div>

      {run.status === "blocked" && run.blockedReason && (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-snug text-destructive">
          <span className="font-bold">
            Stopped at {run.blockedBy ? stageSpec(run.blockedBy).label : "a check"}.
          </span>{" "}
          {run.blockedReason} Everything the run produced before this is saved.
        </p>
      )}
      {note && (
        <p className="mt-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {note}
        </p>
      )}

      <ul className="mt-1.5 divide-y divide-border/50">
        {rows.map((row) => (
          <StageRow key={row.stage} view={row} />
        ))}
      </ul>

      <p className="mt-1.5 text-[10px] italic leading-snug text-muted-foreground">
        One request per stage — the platform stops a function at five minutes, so a
        tick here is a stage the server finished and saved, not a step on a timer.
      </p>
    </div>
  );
}
