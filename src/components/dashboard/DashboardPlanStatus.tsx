"use client";

import React from "react";
import Link from "next/link";
import { WorkspaceCreditInfo } from "@/lib/billing/credits";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Zap,
  CreditCard,
  Calendar,
  Share2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface DashboardPlanStatusProps {
  credits: WorkspaceCreditInfo;
  connectedCount: number;
}

function formatResetDate(dateStr?: string | null): string {
  if (!dateStr) return "End of period";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "End of period";
  }
}

export function DashboardPlanStatus({
  credits,
  connectedCount,
}: DashboardPlanStatusProps) {
  const isFree = credits.plan === "FREE";
  const resetFormatted = formatResetDate(credits.resetDate);
  const percentUsed = credits.isUnlimited ? 100 : Math.min(100, Math.max(0, credits.percentUsed));
  const isDepleted = !credits.isUnlimited && credits.creditsLeft <= 0;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-xs transition-all">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {credits.planName} Plan
              </h3>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                title="Current active billing cycle"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active Cycle
              </span>
            </div>
            <p
              className="text-[11px] text-muted-foreground mt-0.5 cursor-help"
              title="Includes AI generation credits, media quota, and connected channel allowances"
            >
              AI quota &amp; multi-channel status
            </p>
          </div>
        </div>

        <Link href="/dashboard/billing">
          <Button size="sm" className="h-8 gap-1.5 text-xs shadow-2xs font-medium">
            <CreditCard className="h-3.5 w-3.5" />
            {isFree ? "Upgrade to Pro" : "Manage Subscription"}
          </Button>
        </Link>
      </div>

      {/* 4 Stat Boxes: Remaining, Total, Used, Reset Date */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 mb-3">
        {/* Remaining Credits */}
        <div
          className="rounded-lg border bg-muted/20 p-2.5 cursor-help"
          title="Credits currently available to spend on AI copywriting and image generation"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Remaining
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`text-xl font-bold tabular-nums ${isDepleted ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {credits.isUnlimited ? "Unlimited" : credits.creditsLeft.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">pts</span>
          </div>
        </div>

        {/* Total Monthly Grant */}
        <div
          className="rounded-lg border bg-muted/20 p-2.5 cursor-help"
          title="Total monthly credit allocation for your current workspace tier"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Total Limit
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-bold tabular-nums text-foreground">
              {credits.isUnlimited ? "Unlimited" : credits.creditsTotal.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">pts</span>
          </div>
        </div>

        {/* Used Credits */}
        <div
          className="rounded-lg border bg-muted/20 p-2.5 cursor-help"
          title="Credits consumed by AI generation during this billing window"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Used
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-bold tabular-nums text-foreground">
              {credits.creditsUsed.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({percentUsed}%)
            </span>
          </div>
        </div>

        {/* Period Reset / Expiry Date */}
        <div
          className="rounded-lg border bg-muted/20 p-2.5 cursor-help"
          title="Date your monthly credit allowance will automatically refresh"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            Renews On
          </span>
          <div className="mt-1">
            <span className="text-sm font-semibold text-foreground">
              {resetFormatted}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar & Channel Pill */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>Usage:</span>
            <span className="font-semibold tabular-nums text-foreground">
              {credits.isUnlimited
                ? "Unlimited Usage"
                : `${credits.creditsUsed.toLocaleString()} / ${credits.creditsTotal.toLocaleString()} used`}
            </span>
          </div>

          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground border cursor-help"
            title="Connected social channels ready to publish"
          >
            <Share2 className="h-3 w-3 text-primary" />
            {connectedCount} of 6 Channels Active
          </span>
        </div>

        <Progress
          value={credits.isUnlimited ? 100 : percentUsed}
          className="h-2 bg-muted"
        />

        {isFree && isDepleted && (
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Free monthly credits exhausted (0 remaining). Upgrade for unlimited generation.</span>
            </div>
            <Link href="/dashboard/billing" className="shrink-0 font-semibold hover:underline inline-flex items-center gap-0.5">
              Upgrade Now <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
