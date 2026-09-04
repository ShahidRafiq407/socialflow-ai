"use client";

import React from "react";
import { Coins, Database, FolderKanban, Layers } from "lucide-react";
import { FEATURE_LABELS, isUnlimited, type FeatureKey } from "@/lib/billing/plans";
import type {
  BillingCredits,
  BillingPlanState,
  BillingStorage,
  BillingUsageRow,
  BillingWorkspaces,
} from "./types";
import { fmtCredits, fmtDate } from "./format";

/**
 * What is left, and of what.
 *
 * Three different kinds of limit share this panel because a customer does not
 * separate them: the credit balance, the per-feature ceilings that apply even when
 * credits remain, and the two flat limits (storage, workspaces). Every number is
 * the number the gate enforces — this panel reads the same wallet the charge does,
 * so a full meter here means a refusal there, with no third figure in between.
 */
interface CreditPanelProps {
  credits: BillingCredits;
  usage: Record<string, BillingUsageRow>;
  storage: BillingStorage;
  workspaces: BillingWorkspaces;
  planState: BillingPlanState;
}

function bar(percent: number): string {
  return `${Math.min(100, Math.max(0, percent))}%`;
}

function Meter({ percent, tone }: { percent: number; tone?: "warn" | "full" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${
          tone === "full" ? "bg-destructive" : tone === "warn" ? "bg-amber-500" : "bg-primary"
        }`}
        style={{ width: bar(percent) }}
      />
    </div>
  );
}

function toneFor(percent: number): "warn" | "full" | undefined {
  if (percent >= 100) return "full";
  if (percent >= 80) return "warn";
  return undefined;
}

export function CreditPanel({
  credits,
  usage,
  storage,
  workspaces,
  planState,
}: CreditPanelProps) {
  // Features the plan caps by count. A cap of 0 means the plan does not include the
  // feature at all, which the plan card already says — repeating it here as "0 of 0
  // used" would read like a bug.
  const capped = Object.entries(usage).filter(([, row]) => row.cap !== 0);
  const storagePercent = isUnlimited(storage.limitMb)
    ? 0
    : (storage.usedMb / Math.max(1, storage.limitMb)) * 100;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5" />
              Credits available
            </p>
            <p className="mt-1 text-3xl font-extrabold text-foreground">
              {fmtCredits(credits.available)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {credits.monthlyGrant > 0
                ? `${fmtCredits(credits.grantBalance)} of this period's ${fmtCredits(credits.monthlyGrant)}`
                : "This plan does not include monthly credits"}
              {credits.topUpBalance > 0 &&
                ` · ${fmtCredits(credits.topUpBalance)} from packs, which never expire`}
              {credits.held > 0 && ` · ${fmtCredits(credits.held)} reserved by work in progress`}
            </p>
          </div>

          <div className="text-right text-xs text-muted-foreground">
            <p>
              {planState.cancelAtPeriodEnd
                ? `Ends ${fmtDate(planState.endsAt ?? credits.periodEnd)}`
                : `Resets ${fmtDate(credits.periodEnd)}`}
            </p>
            <p className="mt-0.5">
              Period began {fmtDate(credits.periodStart)}
            </p>
          </div>
        </div>

        {credits.monthlyGrant > 0 && (
          <div className="mt-4">
            <Meter percent={credits.percentUsed} tone={toneFor(credits.percentUsed)} />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{credits.percentUsed}% of this period used</span>
              <span>
                {fmtCredits(credits.lifetimeSpent)} used since you joined, of{" "}
                {fmtCredits(credits.lifetimeGranted)} granted
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            Media storage
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {storage.usedLabel} of {storage.limitLabel}
          </p>
          {!isUnlimited(storage.limitMb) && (
            <div className="mt-3">
              <Meter percent={storagePercent} tone={toneFor(storagePercent)} />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <FolderKanban className="h-3.5 w-3.5" />
            Workspaces
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {workspaces.used} of {workspaces.limitLabel}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            One brand per workspace. Credits are shared across all of them, because they are
            billed to your account rather than to each workspace.
          </p>
        </div>
      </div>

      {capped.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            This period's allowances
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            These apply on top of the credit balance: an allowance that is used up stays used up
            until the period resets, even with credits to spare.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capped.map(([key, row]) => {
              const unlimited = isUnlimited(row.cap);
              const percent = unlimited ? 0 : (row.used / Math.max(1, row.cap)) * 100;
              return (
                <div key={key} className="rounded-xl border border-border bg-muted/30 px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {FEATURE_LABELS[key as FeatureKey] ?? key}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {unlimited ? `${row.used} used` : `${row.used} of ${row.capLabel}`}
                  </p>
                  {!unlimited && (
                    <div className="mt-2">
                      <Meter percent={percent} tone={toneFor(percent)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
