"use client";

import React from "react";
import { ArrowRight, Check, Loader2, Minus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlanTier } from "@/lib/billing/plans";
import type { BillingCatalogPlan, BillingCycle, BillingPlanState, BillingStore } from "./types";
import { daysUntil } from "./format";

/**
 * The plan grid.
 *
 * Five things are on sale and they are not the same kind of thing, so they are not
 * drawn the same way: four ongoing plans sit in the grid, and the 3-day trial —
 * one payment, one clock, one per person — gets its own strip above them. Every
 * card's price, bullet list and button label comes from the catalogue in the status
 * payload, so this file decides layout and nothing else.
 */
interface PlanGridProps {
  plans: BillingCatalogPlan[];
  planState: BillingPlanState;
  store: BillingStore;
  cycle: BillingCycle;
  onCycleChange: (cycle: BillingCycle) => void;
  /** The tier currently mid-request, so only its own button spins. */
  busy: string | null;
  onChoose: (plan: PlanTier) => void;
  onTrial: () => void;
  onCancel: () => void;
}

function priceLine(plan: BillingCatalogPlan, cycle: BillingCycle): string {
  if (plan.oneTimePrice !== undefined) return `$${plan.oneTimePrice}`;
  if (plan.priceMonthly === 0) return "$0";
  return `$${cycle === "yearly" ? Math.round(plan.priceYearly / 12) : plan.priceMonthly}`;
}

function priceNote(plan: BillingCatalogPlan, cycle: BillingCycle): string {
  if (plan.oneTimePrice !== undefined) return `once · ${plan.trialDays ?? 3} days`;
  if (plan.priceMonthly === 0) return "free forever";
  return cycle === "yearly" ? `per month · $${plan.priceYearly} billed yearly` : "per month";
}

export function PlanGrid({
  plans,
  planState,
  store,
  cycle,
  onCycleChange,
  busy,
  onChoose,
  onTrial,
  onCancel,
}: PlanGridProps) {
  const trial = plans.find((plan) => plan.id === "TRIAL");
  const ongoing = plans.filter((plan) => plan.id !== "TRIAL");
  const topSaving = Math.max(0, ...ongoing.map((plan) => plan.yearlySaving));

  // The strip is an offer, and an offer that cannot be taken is noise. It goes when
  // the trial has been used, when a subscription already exists, or when the store
  // has no trial variant configured.
  const showTrial = Boolean(trial) && store.trialPurchasable && !planState.hasSubscription;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Each plan includes everything in the one before it. Change or cancel whenever you like.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => onCycleChange("monthly")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              cycle === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => onCycleChange("yearly")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              cycle === "yearly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Yearly
            {topSaving > 0 && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                −{topSaving}%
              </span>
            )}
          </button>
        </div>
      </div>

      {planState.isTrial && (
        <div className="rounded-2xl border border-secondary/40 bg-secondary/5 px-5 py-4">
          <p className="text-sm font-semibold text-foreground">
            Your trial is running — {daysUntil(planState.trialEndsAt)} day
            {daysUntil(planState.trialEndsAt) === 1 ? "" : "s"} left.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick a plan below and it starts straight away, replacing the trial. Do nothing and the
            trial simply ends — cancel first and you are never charged again.
          </p>
        </div>
      )}

      {showTrial && trial && (
        <div className="relative overflow-hidden rounded-2xl border border-secondary/50 bg-secondary/[0.06] p-5 sm:p-6">
          <Badge className="absolute right-5 top-5 bg-secondary text-secondary-foreground text-[10px]">
            {trial.badge ?? "Try everything"}
          </Badge>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <h3 className="text-xl font-bold text-foreground">{trial.name}</h3>
            <span className="text-3xl font-extrabold text-foreground">
              ${trial.oneTimePrice ?? 1}
            </span>
            <span className="pb-1 text-xs text-muted-foreground">
              once · cancel any time in {trial.trialDays ?? 3} days
            </span>
          </div>

          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{trial.blurb}</p>

          <ul className="mt-4 grid gap-2 text-xs text-foreground/90 sm:grid-cols-2 lg:grid-cols-3">
            {trial.features.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <Button
            className="mt-5 gap-2 text-xs font-semibold"
            onClick={onTrial}
            disabled={busy !== null}
          >
            {busy === "TRIAL" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>{trial.ctaLabel}</span>
              </>
            )}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ongoing.map((plan) => {
          const isCurrent = plan.current;
          const isFree = plan.id === "FREE";
          // Leaving a paid plan is a cancellation, not a purchase. Saying "choose
          // Free" for it would hide what the click actually does.
          const leaveToFree = isFree && !isCurrent && planState.hasSubscription;
          const blocked = plan.purchasable && !store.plansPurchasable;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                isCurrent
                  ? "border-primary bg-primary/[0.05] shadow-sm"
                  : plan.highlight
                    ? "border-secondary/60 bg-card shadow-sm"
                    : "border-border bg-card"
              }`}
            >
              {(isCurrent || plan.badge) && (
                <Badge
                  className={`absolute -top-2.5 left-5 text-[10px] ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {isCurrent ? "Current plan" : plan.badge}
                </Badge>
              )}

              <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground">
                  {priceLine(plan, cycle)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{priceNote(plan, cycle)}</p>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{plan.blurb}</p>

              <ul className="mt-4 flex-1 space-y-2 text-xs text-foreground/90">
                {plan.features.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{line}</span>
                  </li>
                ))}
                {/* Where the plan stops, said plainly. A buyer who finds this out
                    after paying is a refund; a buyer who reads it here is a fit. */}
                {plan.notIncluded?.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-muted-foreground">
                    <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-5 w-full gap-2 text-xs font-semibold"
                variant={isCurrent || !plan.purchasable ? "outline" : "default"}
                onClick={() => (leaveToFree ? onCancel() : onChoose(plan.id))}
                disabled={isCurrent || blocked || busy !== null || (isFree && !leaveToFree)}
                title={
                  blocked
                    ? "Payments are not fully configured on this deployment yet."
                    : undefined
                }
              >
                {busy === plan.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  "Your current plan"
                ) : leaveToFree ? (
                  "Cancel and move to Free"
                ) : isFree ? (
                  "Included by default"
                ) : (
                  <>
                    <span>{plan.ctaLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
