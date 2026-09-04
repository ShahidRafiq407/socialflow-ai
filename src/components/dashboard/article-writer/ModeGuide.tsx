"use client";

/**
 * QUICK VS DEEP, ON SCREEN
 *
 * Two pieces, both drawn from `stages.ts` and `modes.ts` rather than written here:
 * the stage list for the mode currently selected, which sits under the brief and
 * changes when the toggle changes, and the side-by-side guide behind "Which one?".
 *
 * The guide exists because the choice used to be two buttons labelled with a number
 * — "Quick 12", "Deep 23" — and nothing anywhere said what the eleven extra stages
 * were, what each mode costs, or which one a given article wants. On a Pro plan,
 * which does not include Deep, both buttons still looked available and the refusal
 * only arrived after the brief was filled in.
 *
 * No copy is invented in this file. Stage names and one-liners come from the
 * pipeline, prices and allowances come from the server's own gate, and the refusal
 * sentence is the gate's, shown exactly as it was written. The only strings here are
 * the labels on the furniture.
 */

import Link from "next/link";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CONTROL_LABEL,
  MODE_SUMMARY,
  controlsIn,
  deepOnlyStages,
} from "@/lib/article/modes";
import { stagesFor, type ArticleRunMode } from "@/lib/article/stages";
import { getPlanConfig } from "@/lib/billing/plans";
import type { ModeAvailability } from "./useArticleRun";

/** Stage names carry their own one-liner on hover, so the list stays a list. */
function StageRow({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <li title={detail} className="flex cursor-help items-start gap-1.5">
      <span className="mt-[2px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-primary/10 text-[8px] font-bold text-primary">
        {index}
      </span>
      <span className="text-[10px] font-medium leading-snug text-foreground">{label}</span>
    </li>
  );
}

/**
 * The stages the selected mode will run, and the ones it will not.
 *
 * This is the part that answers "what changes when I switch the toggle". Twelve
 * rows or twenty-three, numbered as this mode counts them, each carrying its own
 * description on hover — the descriptions are the pipeline's own, so a stage that
 * changes what it does changes this text with it.
 */
export function ModeStages({ mode }: { mode: ArticleRunMode }) {
  const stages = stagesFor(mode);
  const extra = mode === "quick" ? deepOnlyStages() : [];

  return (
    <div>
      <p className="text-xs leading-relaxed text-muted-foreground">{MODE_SUMMARY[mode].line}</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
        {stages.map((stage, at) => (
          <StageRow key={stage.key} index={at + 1} label={stage.label} detail={stage.detail} />
        ))}
      </ul>
      {extra.length > 0 && (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Deep would add {extra.length} more
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {extra.map((stage) => (
              <span
                key={stage.key}
                title={stage.detail}
                className="cursor-help rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {stage.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
      {children}
    </span>
  );
}

/**
 * One mode, as a buyer reads it: what it costs, what it runs, and what it is for.
 *
 * The two panels are not symmetrical, because the question is not symmetrical.
 * Quick's job is to show that it is a whole article, so it lists its stages flat.
 * Deep's job is to show what the extra money buys, so it lists only the eleven
 * stages Quick does not have, each with what it does.
 */
function ModePanel({
  info,
  active,
  onPick,
}: {
  info: ModeAvailability;
  active: boolean;
  onPick: () => void;
}) {
  const summary = MODE_SUMMARY[info.mode];
  const locked = info.locked === true;
  const metered = typeof info.cap === "number" && info.cap > 0;
  const quick = stagesFor("quick");
  const extra = deepOnlyStages();

  return (
    <div
      className={`rounded-xl border p-3 ${
        active ? "border-primary bg-primary/5" : "border-border bg-background"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <h3 className="text-sm font-bold text-foreground">{summary.name}</h3>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Chip>{info.stages} stages</Chip>
        {typeof info.credits === "number" && info.credits > 0 && (
          <Chip>{info.credits.toLocaleString()} credits a run</Chip>
        )}
        {metered && (
          <Chip>
            {(info.used ?? 0).toLocaleString()} of {info.cap?.toLocaleString()} used
          </Chip>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{summary.line}</p>
      <p className="mt-1.5 text-[11px] leading-snug">
        <span className="font-semibold text-foreground">Best for </span>
        <span className="text-muted-foreground">{summary.bestFor}</span>
      </p>
      {/* The gate's own sentence. It already names the limit, the plan that lifts
          it and when the allowance resets, so nothing is added to it here. */}
      {!info.pending && !info.available && info.reason && (
        <p className="mt-2 rounded-lg border border-secondary/30 bg-secondary/10 px-2 py-1.5 text-[10px] leading-snug text-secondary">
          {info.reason}
        </p>
      )}
      {info.mode === "deep" ? (
        <div className="mt-2.5 border-t border-border pt-2">
          <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Everything in Quick, plus
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {extra.map((stage) => (
              <li key={stage.key} className="text-[10px] leading-snug">
                <span className="font-semibold text-foreground">{stage.label}</span>
                <span className="text-muted-foreground"> — {stage.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-2.5 border-t border-border pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            The {quick.length} stages it runs
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {quick.map((stage) => (
              <span
                key={stage.key}
                title={stage.detail}
                className="cursor-help rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {stage.label}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3">
        {locked ? (
          <Link
            href="/dashboard/billing"
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"
          >
            Upgrade to {getPlanConfig(info.requiredPlan).name}
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onPick}
            disabled={active || info.selectable === false}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-3 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:cursor-default disabled:opacity-60"
          >
            {active ? (
              <>
                <Check className="h-3 w-3" />
                Selected
              </>
            ) : (
              `Use ${summary.name}`
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The row the server sent for this mode, or a placeholder that claims nothing.
 *
 * The fallback matters: the guide is reachable before the plan has been read and
 * would otherwise render an empty grid, which is a worse answer to "which one?"
 * than a panel with the prices left off.
 */
function rowFor(modes: ModeAvailability[], mode: ArticleRunMode): ModeAvailability {
  const found = modes.find((entry) => entry.mode === mode);
  if (found) return found;
  return { mode, stages: stagesFor(mode).length, available: false, pending: true };
}

export interface ModeGuideProps {
  open: boolean;
  onClose: () => void;
  /** Straight from the run hook, which got them from the gate. */
  modes: ModeAvailability[];
  active: ArticleRunMode;
  onPick: (mode: ArticleRunMode) => void;
}

export default function ModeGuide({ open, onClose, modes, active, onPick }: ModeGuideProps) {
  const shared = controlsIn("quick").map((control) => CONTROL_LABEL[control]);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Quick or deep research?</DialogTitle>
          <DialogDescription className="text-xs">
            One pipeline, run to two different depths. Both produce a finished,
            publishable article — Deep also proves what it says.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
          {(["quick", "deep"] as const).map((mode) => (
            <ModePanel
              key={mode}
              info={rowFor(modes, mode)}
              active={active === mode}
              onPick={() => {
                onPick(mode);
                onClose();
              }}
            />
          ))}
        </div>

        {/* The reassurance, and it is derived: these are the controls whose stage
            runs in both modes. Nothing is listed here that Quick cannot honour. */}
        <p className="shrink-0 text-[10px] leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">In both: </span>
          {shared.join(", ")} — and any image or video you add yourself in the media
          studio, which works the same in either mode.
        </p>
      </DialogContent>
    </Dialog>
  );
}
