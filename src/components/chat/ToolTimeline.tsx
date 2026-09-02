"use client";

// ============================================================================
// TOOL TIMELINE
//
// One row per tool the controller actually ran, in order, with live phase. This
// is the audit trail: if the answer claims a post was published, there is a row
// here showing publish_post succeeded.
// ============================================================================

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import type { ToolRun } from "@/lib/agents/controller/types";

interface ToolTimelineProps {
  runs: ToolRun[];
  /** "all" shows every row expanded-capable, "compact" one line each, "failures" only errors. */
  visibility: "all" | "compact" | "failures";
}

function PhaseIcon({ phase }: { phase: ToolRun["phase"] }) {
  if (phase === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin mkt-accent-text" />;
  if (phase === "error") return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
  return <Check className="h-3.5 w-3.5 mkt-accent-text" />;
}

function ToolRow({ run, expandable }: { run: ToolRun; expandable: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetail = expandable && (!!run.args || !!run.error || !!run.summary);

  return (
    <div className="border-b mkt-border last:border-b-0">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
          hasDetail ? "transition-colors hover:mkt-bg2" : "cursor-default"
        }`}
      >
        <span className="mt-0.5 shrink-0">
          <PhaseIcon phase={run.phase} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-[12.5px] ${run.phase === "error" ? "text-red-400" : "mkt-text"}`}>
              {run.label}
            </span>
            {run.mutating && (
              <span className="shrink-0" title="Changes something outside this chat">
                <ShieldAlert className="h-3 w-3 text-amber-400" />
              </span>
            )}
          </span>

          {run.phase === "running" && run.progress && (
            <span className="mt-0.5 block truncate text-[11.5px] mkt-faint">{run.progress}</span>
          )}
          {run.phase === "done" && run.summary && (
            <span className="mt-0.5 block truncate text-[11.5px] mkt-faint">{run.summary}</span>
          )}
          {run.phase === "error" && run.error && (
            <span className="mt-0.5 block text-[11.5px] text-red-400/80">{run.error}</span>
          )}
        </span>

        <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-[11px] mkt-faint">
          {typeof run.durationMs === "number" && run.durationMs > 0 && (
            <span>{run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`}</span>
          )}
          {hasDetail && (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
        </span>
      </button>

      {open && hasDetail && (
        <div className="border-t mkt-border mkt-bg2 px-3 py-2">
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wide mkt-faint">{run.name}</div>
          {run.args && Object.keys(run.args).length > 0 && (
            <pre className="overflow-x-auto text-[11.5px] leading-relaxed mkt-muted">
              {JSON.stringify(run.args, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolTimeline({ runs, visibility }: ToolTimelineProps) {
  const shown = visibility === "failures" ? runs.filter((r) => r.phase === "error") : runs;
  if (shown.length === 0) return null;

  const failures = runs.filter((r) => r.phase === "error").length;
  const running = runs.some((r) => r.phase === "running");

  return (
    <div className="my-3 overflow-hidden rounded-xl border mkt-border">
      <div className="flex items-center justify-between border-b mkt-border mkt-bg2 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide mkt-muted">
          {running ? "Working" : `${runs.length} step${runs.length === 1 ? "" : "s"}`}
        </span>
        {failures > 0 && (
          <span className="text-[11px] text-red-400">
            {failures} failed
          </span>
        )}
      </div>
      <div>
        {shown.map((run) => (
          <ToolRow key={run.id} run={run} expandable={visibility === "all"} />
        ))}
      </div>
    </div>
  );
}
