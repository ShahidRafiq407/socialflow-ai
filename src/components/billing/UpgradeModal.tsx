"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Lock, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FEATURE_LABELS,
  PLAN_CATALOG,
  PURCHASABLE_PLANS,
  lowestPlanWith,
  planRank,
  type FeatureKey,
  type PlanConfig,
  type PlanTier,
} from "@/lib/billing/plans";

/**
 * The upgrade prompt a gate opens when a feature is not on the current plan.
 *
 * Every word, price and bullet is read from the plan catalogue. That is the whole
 * point of the file: a modal carrying its own copy is a modal that will one day
 * advertise a feature the plan no longer includes, or a price nobody is charged.
 * These are the same cards the billing page renders, and the button posts to the
 * same checkout route — so what is promised here is what is sold there.
 *
 * The catalogue itself comes in as `plans`. This is a client component, and the
 * copy of `PLAN_CATALOG` compiled into the browser bundle is the code default: the
 * admin's plan overrides are applied to the table in the server process only, so
 * reading it here quoted a price the checkout would not charge. `plans` should be
 * the `catalog.plans` array from `GET /api/billing/status`, which is serialised on
 * the server after the settings have been read. The module tables remain as a
 * fallback so a gate that has no status payload to hand still renders.
 */
interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The feature the user just hit a wall on. Decides the copy and which card leads. */
  feature?: FeatureKey;
  /** The plan to lead with. Defaults to the cheapest one that includes `feature`. */
  highlightPlan?: PlanTier;
  /** What the account is on now, so its own card reads "current" and not an upsell. */
  currentPlan?: PlanTier;
  /**
   * The plans as the server resolved them, admin overrides included — normally
   * `catalog.plans` from the billing status read. Extra tiers are ignored and
   * missing ones fall back, so passing the whole catalogue is fine.
   */
  plans?: PlanConfig[];
  title?: string;
  description?: string;
}

/** Yearly is quoted per month, because that is the number being compared. */
function perMonth(plan: PlanConfig, cycle: "monthly" | "yearly"): number {
  return cycle === "yearly" ? Math.round(plan.priceYearly / 12) : plan.priceMonthly;
}

/**
 * The yearly discount for one plan, from that plan's own two prices.
 *
 * Deliberately not `yearlySavingPercent(tier)`: that reads the module catalogue,
 * which in the browser is the un-overridden default, so an admin who edited the
 * yearly price would have seen the old saving advertised beside the new price.
 */
function savingPercent(plan: PlanConfig): number {
  if (!plan.priceMonthly || !plan.priceYearly) return 0;
  const full = plan.priceMonthly * 12;
  return Math.round(((full - plan.priceYearly) / full) * 100);
}

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  highlightPlan,
  currentPlan = "FREE",
  plans,
  title,
  description,
}: UpgradeModalProps) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The three cards, in catalogue order, taken from the server's copy where one was
  // supplied. A tier the caller did not send falls back to the bundled default, so a
  // partial payload degrades one card instead of emptying the grid.
  const cards: PlanConfig[] = React.useMemo(
    () =>
      PURCHASABLE_PLANS.map(
        (tier) => plans?.find((entry) => entry.id === tier) ?? PLAN_CATALOG[tier]
      ),
    [plans]
  );

  // The cheapest plan that actually unlocks what they tried to do. Leading with the
  // most expensive one is how a paywall starts reading as a shakedown.
  const suggested: PlanTier = highlightPlan ?? (feature ? lowestPlanWith(feature) : "PRO");
  const featureName = feature ? FEATURE_LABELS[feature] : null;
  const suggestedName =
    plans?.find((entry) => entry.id === suggested)?.name ?? PLAN_CATALOG[suggested].name;

  const heading = title ?? (featureName ? `${featureName} needs a plan` : "Unlock the rest of it");
  const blurb =
    description ??
    (featureName
      ? `${featureName} is included from ${suggestedName} upwards. Nothing you have already made is affected, and it works on the next click.`
      : "Each plan includes everything in the one before it. Change or cancel whenever you like.");

  // Said as "up to" and computed from the prices actually on screen, so a plan
  // repriced in the back office cannot make this line a lie.
  const topSaving = Math.max(0, ...cards.map(savingPercent));

  async function choose(plan: PlanTier) {
    setBusy(plan);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "subscribe", plan, cycle }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        message?: string;
      };

      if (!res.ok || !json.ok) {
        setError(json.message || "We could not start the checkout. Please try again.");
        setBusy(null);
        return;
      }

      // A first subscription returns a hosted checkout to send them to. An existing
      // subscriber's plan change returns only what will happen, because the webhook
      // is what applies it — so there is nothing to redirect to, only to report.
      if (json.url) {
        window.location.href = json.url;
        return; // leave the spinner running; the page is on its way out
      }

      setNotice(json.message || "Your plan has been changed.");
      setBusy(null);
    } catch {
      setError("We could not reach the checkout. Check your connection and try again.");
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-6 font-sans">
        <DialogHeader className="space-y-2 pb-4 text-center border-b border-border">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-2xl font-bold">{heading}</DialogTitle>
          <DialogDescription className="mx-auto max-w-xl text-sm text-muted-foreground">
            {blurb}
          </DialogDescription>

          <div className="flex items-center justify-center gap-1 pt-2">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                cycle === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                cycle === "yearly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              {topSaving > 0 && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Save up to {topSaving}%
                </span>
              )}
            </button>
          </div>
        </DialogHeader>

        {(error || notice) && (
          <div
            className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
              error
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-primary/30 bg-primary/10 text-primary"
            }`}
          >
            {error || notice}
          </div>
        )}

        <div className="grid gap-4 pt-4 md:grid-cols-3">
          {cards.map((plan) => {
            const tier = plan.id;
            const leads = tier === suggested;
            const isCurrent = tier === currentPlan;
            const isDowngrade = planRank(tier) < planRank(currentPlan);
            const shown = plan.features.slice(0, 6);
            const rest = plan.features.length - shown.length;

            return (
              <div
                key={tier}
                className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                  leads
                    ? "border-primary bg-primary/[0.04] shadow-sm"
                    : "border-border bg-card"
                }`}
              >
                {leads && (
                  <Badge className="absolute -top-2.5 left-5 bg-primary text-primary-foreground text-[10px]">
                    {isCurrent ? "Your plan" : featureName ? "Unlocks this" : plan.badge || "Recommended"}
                  </Badge>
                )}

                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-foreground">
                    ${perMonth(plan, cycle)}
                  </span>
                  <span className="text-xs text-muted-foreground">/ month</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {cycle === "yearly"
                    ? `Billed $${plan.priceYearly} once a year`
                    : "Billed monthly, cancel any time"}
                </p>

                <ul className="mt-4 mb-5 flex-1 space-y-2 text-xs text-foreground/90">
                  {shown.map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{line}</span>
                    </li>
                  ))}
                  {rest > 0 && (
                    <li className="pl-5 text-[11px] text-muted-foreground">
                      + {rest} more on the billing page
                    </li>
                  )}
                </ul>

                <Button
                  className="w-full gap-2 text-xs font-semibold"
                  variant={leads ? "default" : "outline"}
                  onClick={() => choose(tier)}
                  disabled={isCurrent || busy !== null}
                >
                  {busy === tier ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    "Your current plan"
                  ) : (
                    <>
                      {/* A downgrade is not an upgrade, and saying so avoids the
                          support ticket that starts "I thought I was getting more". */}
                      <span>{isDowngrade ? `Move to ${plan.name}` : plan.ctaLabel}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-emerald-500" />
            Payments are handled by Lemon Squeezy — we never see your card.
          </span>
          <Link
            href="/dashboard/billing"
            onClick={() => onOpenChange(false)}
            className="font-medium text-foreground hover:underline"
          >
            Compare every plan &rarr;
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
