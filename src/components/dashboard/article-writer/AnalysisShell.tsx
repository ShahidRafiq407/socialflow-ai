"use client";

/**
 * THE SHELL THE TWO ANALYSIS PANELS SHARE
 *
 * The business panel and the evidence panel answer the same question in two
 * halves — what this run established about you, and what it established about
 * the world — and both of them have to be able to say "nothing yet, and here is
 * exactly why". That last part is why this file exists rather than being written
 * twice: an empty panel has seven different meanings and only one is a defect.
 *
 *   unavailable — this mode never runs the stage. Quick mode does not crawl your
 *                 site, so "pending" would promise a step nothing will take.
 *   pending     — it is in this pipeline and the run has not reached it.
 *   running     — it is on the wire now.
 *   blocked     — a check refused, in the row's own words.
 *   failed      — it threw, in the row's own words.
 *   skipped     — the run did not need it, and the row says why.
 *   done        — it ran and recorded nothing, which is also a real answer.
 *
 * Nothing here holds or derives data. Every number these panels show was counted
 * off an artifact by a guard in `artifacts.ts`; this file only draws it.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { stageSpec, type ArticleStageKey } from "@/lib/article/stages";
import { stageStatusIn, type ArticleRunView } from "@/lib/article/types";

export interface AnalysisCardProps {
  title: string;
  icon: typeof ChevronDown;
  /** One line under the title. A count or a fact, never an adjective. */
  subtitle?: string;
  /** Static content only — it renders inside the header button. */
  right?: ReactNode;
  defaultOpen?: boolean;
  /**
   * Fired each time the card opens. The evidence panel fetches its ledger from
   * this rather than on mount: a run's worth of sources and claims is two more
   * queries, and a panel nobody opened has no business making them.
   */
  onOpen?: () => void;
  children: ReactNode;
}

/**
 * A card whose whole header is the button.
 *
 * Closed by default. These are for reading afterwards rather than watching, and
 * a run's worth of sources opened by itself would push the draft off the screen.
 */
export function AnalysisCard({
  title,
  icon: Icon,
  subtitle,
  right,
  defaultOpen = false,
  onOpen,
  children,
}: AnalysisCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => {
          // Read and set rather than toggling inside the updater: an updater is
          // called twice under StrictMode, and `onOpen` is a fetch.
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left hover:bg-muted/40"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-foreground">
            {title}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {right}
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </section>
  );
}

export interface StageAbsenceProps {
  run: ArticleRunView;
  stage: ArticleStageKey;
  /** What to say when this pipeline never runs the stage. */
  unavailable: string;
  /** What to say when it ran and recorded nothing. */
  empty: string;
}

/**
 * Why there is nothing to show, in the run's own terms.
 *
 * A stage that blocked or failed is quoted rather than summarised: the row holds
 * the sentence the stage wrote, and rewording it here would put a second, vaguer
 * account of the same event on the screen next to the first.
 */
export function StageAbsence({ run, stage, unavailable, empty }: StageAbsenceProps) {
  const spec = stageSpec(stage);
  const status = stageStatusIn(run, stage);
  const row = run.stages.find((entry) => entry.stage === stage);

  const sentence = (): string => {
    switch (status) {
      case "unavailable":
        return unavailable;
      case "running":
        return `“${spec.label}” is running now.`;
      case "pending":
        return `“${spec.label}” has not run yet for this article. ${spec.detail}`;
      case "blocked":
      case "failed":
        return (
          row?.error ||
          `“${spec.label}” did not finish, so there is nothing from it to show.`
        );
      case "skipped":
        return row?.error || `This run did not need “${spec.label}”.`;
      default:
        return empty;
    }
  };

  return <p className="text-[11px] leading-relaxed text-muted-foreground">{sentence()}</p>;
}

/** A titled block inside an open card. */
export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

/** A counted number and the thing it counts. Never a figure nothing measured. */
export function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-1.5">
      <p className="text-[13px] font-bold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

/** Short strings as chips, capped, with the cap saying how many it hid. */
export function Chips({ items, limit = 24 }: { items: string[]; limit?: number }) {
  if (!items.length) return null;
  const shown = items.slice(0, limit);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground"
        >
          {item}
        </span>
      ))}
      {items.length > shown.length && (
        <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
          +{items.length - shown.length} more
        </span>
      )}
    </div>
  );
}

/**
 * An outbound link.
 *
 * `noopener noreferrer` on every one of them: these URLs were found on the web by
 * a research stage, so none of them is a page this app has any reason to trust
 * with a handle on the tab it was opened from.
 */
export function OutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-primary hover:underline"
    >
      {children}
    </a>
  );
}
