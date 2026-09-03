"use client";

import React, { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { PluginSetupStep } from "@/lib/plugins/catalog";

// ============================================================================
// SETUP STEPS
//
// Every connector needs to answer one question — "where do I get this key?" —
// and the old answer was a paragraph of help text nobody read. This renders the
// catalog's steps as a numbered rail instead: one line each, the link to the
// exact page as a chip, and any value worth copying (scopes, a route path) as a
// copy button rather than something to select by hand.
// ============================================================================

/** Copy button that confirms itself and goes quiet again. */
function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard blocked (insecure context, denied permission): the value is
          // on screen and selectable, so there is nothing useful to report.
        }
      }}
      title={copied ? "Copied" : "Copy"}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2 py-1 text-left font-mono text-[11px] text-foreground/80 transition-colors hover:bg-muted"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
      )}
    </button>
  );
}

export function PluginSetupSteps({
  steps,
  accent = "indigo",
}: {
  steps: PluginSetupStep[];
  /** Matches the dialog it sits in: connectors are indigo, MCP servers violet. */
  accent?: "indigo" | "violet" | "emerald";
}) {
  if (!steps || steps.length === 0) return null;

  const badge =
    accent === "violet"
      ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
      : accent === "emerald"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";

  const link =
    accent === "violet"
      ? "text-violet-600 hover:text-violet-500 dark:text-violet-400"
      : accent === "emerald"
        ? "text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
        : "text-indigo-600 hover:text-indigo-500 dark:text-indigo-400";

  return (
    <ol className="space-y-3">
      {steps.map((step, idx) => (
        <li key={`${idx}-${step.title}`} className="flex gap-3">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${badge}`}
          >
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[13px] font-semibold leading-snug text-foreground">{step.title}</p>
            {step.detail && (
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">{step.detail}</p>
            )}
            {step.copy && <CopyChip value={step.copy} />}
            {step.href && (
              <a
                href={step.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${link}`}
              >
                {step.linkLabel || "Open"} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The "what the AI CEO can do with this" chips. Capability, not tool names. */
export function PluginCanChips({ can }: { can: string[] }) {
  if (!can || can.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {can.map((item) => (
        <span
          key={item}
          className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
