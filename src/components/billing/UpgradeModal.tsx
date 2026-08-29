"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PlanTier } from "@/lib/billing/plans";
import { Check, Sparkles, Zap, Shield, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  highlightPlan?: PlanTier;
}

export function UpgradeModal({
  open,
  onOpenChange,
  title = "Unlock Autonomous AI Marketing",
  description = "AI generation features are available on Creator Pro and Agency plans. Upgrade your plan to generate viral multi-platform campaigns in seconds.",
  highlightPlan = "PRO",
}: UpgradeModalProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [upgradingTo, setUpgradingTo] = useState<string | null>(null);

  const handleUpgrade = (tier: PlanTier) => {
    setUpgradingTo(tier);
    // Redirect to billing dashboard with selected plan
    window.location.href = `/dashboard/billing?plan=${tier}&cycle=${billingCycle}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-sans shadow-2xl">
        <DialogHeader className="text-center space-y-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            {description}
          </DialogDescription>

          {/* Billing cycle toggle */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                billingCycle === "monthly"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                billingCycle === "yearly"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                Save 17%
              </span>
            </button>
          </div>
        </DialogHeader>

        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          {/* Creator Pro */}
          <div
            className={`relative rounded-xl border p-5 transition-all ${
              highlightPlan === "PRO"
                ? "border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-800/40 shadow-sm"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                  Most Popular
                </span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {PLANS.PRO.name}
                </h3>
              </div>
              <Badge className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs">
                Pro
              </Badge>
            </div>

            <div className="mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  ${billingCycle === "monthly" ? PLANS.PRO.priceMonthly : Math.round(PLANS.PRO.priceYearly / 12)}
                </span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{PLANS.PRO.tagline}</p>
            </div>

            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 mb-6">
              {PLANS.PRO.features.slice(0, 6).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-slate-900 dark:text-white shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full bg-slate-900 hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 font-semibold text-xs h-10 gap-2"
              onClick={() => handleUpgrade("PRO")}
              disabled={upgradingTo === "PRO"}
            >
              {upgradingTo === "PRO" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Upgrade to Creator Pro</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>

          {/* Agency & Scale */}
          <div
            className={`relative rounded-xl border p-5 transition-all ${
              highlightPlan === "AGENCY"
                ? "border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-800/40 shadow-sm"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                  Maximum Power
                </span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {PLANS.AGENCY.name}
                </h3>
              </div>
              <Badge variant="outline" className="border-slate-400 text-xs">
                All 6 Platforms
              </Badge>
            </div>

            <div className="mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  ${billingCycle === "monthly" ? PLANS.AGENCY.priceMonthly : Math.round(PLANS.AGENCY.priceYearly / 12)}
                </span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{PLANS.AGENCY.tagline}</p>
            </div>

            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 mb-6">
              {PLANS.AGENCY.features.slice(0, 6).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-slate-900 dark:text-white shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              className="w-full border-slate-900 dark:border-white text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs h-10 gap-2"
              onClick={() => handleUpgrade("AGENCY")}
              disabled={upgradingTo === "AGENCY"}
            >
              {upgradingTo === "AGENCY" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Upgrade to Agency &amp; Scale</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-emerald-500" />
            <span>Encrypted payment handling • Cancel anytime</span>
          </div>
          <Link
            href="/dashboard/billing"
            onClick={() => onOpenChange(false)}
            className="hover:underline font-medium text-slate-800 dark:text-slate-200"
          >
            Compare all plan details →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
