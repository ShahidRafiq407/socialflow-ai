"use client";

import React, { useState, useEffect, useTransition, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Sparkles,
  Shield,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Share2,
} from "lucide-react";
import { PLANS, PlanTier, getPlanConfig } from "@/lib/billing/plans";
import { useUser } from "@clerk/nextjs";

interface BillingHistoryEvent {
  id?: string;
  type: string;
  plan?: string;
  billingCycle?: string;
  provider?: string;
  transactionId?: string;
  amount?: number;
  currency?: string;
  message?: string;
  createdAt?: string;
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const [currentPlan, setCurrentPlan] = useState<PlanTier>("FREE");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    searchParams.get("cycle") === "yearly" ? "yearly" : "monthly"
  );
  const [connectedCount, setConnectedCount] = useState<number>(0);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryEvent[]>([]);
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [isUpdating, startUpdatingTransition] = useTransition();
  const [flashMsg, setFlashMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Deep-link support: upgrade CTAs elsewhere in the app can open
  // /dashboard/billing?plan=PRO&cycle=yearly to auto-start checkout.
  const deepLinkRef = useRef<{ plan: PlanTier; cycle: "monthly" | "yearly" } | null>(null);

  const handlePlanAction = (targetPlan: PlanTier, cycleOverride?: "monthly" | "yearly") => {
    if (targetPlan === currentPlan) return;
    const cycle = cycleOverride || billingCycle;

    startUpdatingTransition(async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: targetPlan,
            billingCycle: cycle,
            email: user?.primaryEmailAddress?.emailAddress || "",
          }),
        });
        const result = await res.json();

        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
          return;
        }

        if (result.success && result.plan) {
          setCurrentPlan(result.plan);
          setFlashMsg({
            type: "success",
            text: result.test
              ? result.message
              : `Successfully switched to ${getPlanConfig(result.plan).name}!`,
          });
          return;
        }

        if (result.error === "PAYMENT_NOT_CONFIGURED") {
          setFlashMsg({
            type: "error",
            text: "Billing is being set up. Paid plans will be available as soon as the payment provider is configured.",
          });
          return;
        }

        setFlashMsg({ type: "error", text: result.message || result.error || "The plan could not be changed." });
      } catch (err: unknown) {
        setFlashMsg({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to update plan.",
        });
      }
    });
  };

  async function refreshBillingState() {
    try {
      const res = await fetch("/api/billing/status");
      const data = await res.json();
      if (data?.plan) setCurrentPlan(data.plan);
      if (typeof data?.connectedAccounts === "number") setConnectedCount(data.connectedAccounts);
      if (Array.isArray(data?.billingHistory)) setBillingHistory(data.billingHistory);
      if (data?.paymentProvider) setPaymentProvider(data.paymentProvider);
      if (typeof data?.testMode === "boolean") setTestMode(data.testMode);

      // Auto-start checkout once the authoritative plan is known, but only if the
      // deep-linked plan differs from the current one (never double-charge).
      const deepLink = deepLinkRef.current;
      if (deepLink && data?.plan && data.plan !== deepLink.plan) {
        deepLinkRef.current = null;
        handlePlanAction(deepLink.plan, deepLink.cycle);
      }
    } catch {
      // keep current state
    }
  }

  // Read query params on mount + load authoritative subscription state.
  useEffect(() => {
    const urlCycle = searchParams.get("cycle");
    const urlPlan = searchParams.get("plan")?.toUpperCase();
    if (urlPlan === "PRO" || urlPlan === "AGENCY") {
      deepLinkRef.current = {
        plan: urlPlan as PlanTier,
        cycle: urlCycle === "yearly" ? "yearly" : "monthly",
      };
    }

    const status = searchParams.get("status");
    const txn = searchParams.get("txn");

    // Data fetch → setState happens asynchronously after the network response,
    // which is the intended external-system synchronization pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshBillingState();

    if (status === "success") {
      // Never claim success from the URL alone — verify via the backend first.
      if (txn) {
        fetch(`/api/billing/status?txn=${encodeURIComponent(txn)}`)
          .then((res) => res.json())
          .then((data) => {
            const activated = data?.billingHistory?.some(
              (e: BillingHistoryEvent) => e.transactionId === txn && e.type === "SUBSCRIPTION_ACTIVATED"
            );
            if (activated) {
              setFlashMsg({ type: "success", text: "Payment confirmed. Your plan is now active." });
            } else if (data?.plan && data.plan === "FREE") {
              setFlashMsg({
                type: "error",
                text: "Payment could not be confirmed yet. It may still be processing — refresh in a few moments.",
              });
            }
          })
          .catch(() => {
            setFlashMsg({ type: "error", text: "We could not verify your payment. Please refresh in a moment." });
          });
      }
    } else if (status === "cancelled") {
      setFlashMsg({ type: "error", text: "Checkout was cancelled. No payment was taken." });
    } else if (status === "error") {
      setFlashMsg({ type: "error", text: searchParams.get("message") || "The payment could not be completed." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activeConfig = getPlanConfig(currentPlan);
  const maxAccounts = activeConfig.maxSocialAccounts;

  return (
    <div className="w-full max-w-6xl mx-auto font-sans pb-20 space-y-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Subscription &amp; Plans
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choose the plan that matches your social media growth and automation needs.
          </p>
        </div>

        {/* BILLING CYCLE TOGGLE */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              billingCycle === "monthly"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              billingCycle === "yearly"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <span>Yearly</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* FLASH MESSAGE */}
      {flashMsg && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-medium ${
            flashMsg.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
          }`}
        >
          {flashMsg.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span>{flashMsg.text}</span>
        </div>
      )}

      {/* CURRENT STATUS BAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Active Plan */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold uppercase text-slate-500">
              Current Plan
            </span>
            <Badge className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px]">
              {activeConfig.name}
            </Badge>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              ${billingCycle === "monthly" ? activeConfig.priceMonthly : Math.round(activeConfig.priceYearly / 12)}
            </span>
            <span className="text-xs text-slate-500">/ month</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {activeConfig.tagline}
          </p>
        </Card>

        {/* Card 2: Connected Social Accounts */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold uppercase text-slate-500">
              Connected Accounts
            </span>
            <Share2 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {connectedCount}
            </span>
            <span className="text-xs text-slate-500">/ {maxAccounts} max accounts</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-slate-900 dark:bg-white h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (connectedCount / maxAccounts) * 100)}%` }}
            />
          </div>
        </Card>

        {/* Card 3: AI Engine Status */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold uppercase text-slate-500">
              AI Generation Access
            </span>
            <Sparkles className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {activeConfig.canAccessAI ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5" />
                Active (Multi-Agent)
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="h-5 w-5" />
                Manual Mode (Locked)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {activeConfig.canAccessAI
              ? "All 6 agents & AI Brain active."
              : "Upgrade to Creator Pro for autonomous AI."}
          </p>
        </Card>
      </div>

      {/* PRICING PLANS GRID */}
      <div>
        <div className="text-center max-w-lg mx-auto mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Select Your PostloomAI Plan
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            No long term contracts. Upgrade or switch plans at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* PLAN 1: FREE STARTER */}
          <div
            className={`flex flex-col rounded-2xl border p-6 transition-all ${
              currentPlan === "FREE"
                ? "border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-900/60 shadow-md ring-1 ring-slate-900 dark:ring-white"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {PLANS.FREE.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{PLANS.FREE.tagline}</p>
              </div>
              {currentPlan === "FREE" && (
                <Badge variant="outline" className="border-slate-900 dark:border-white text-[10px] font-bold">
                  Active
                </Badge>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-slate-900 dark:text-slate-100">$0</span>
                <span className="text-xs text-slate-500">/ forever</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Max 2 social accounts</p>
            </div>

            <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-300 flex-1 mb-8">
              {PLANS.FREE.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-slate-900 dark:text-white shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              className="w-full border-slate-300 dark:border-slate-700 text-xs font-semibold h-11"
              disabled={currentPlan === "FREE" || isUpdating}
              onClick={() => handlePlanAction("FREE")}
            >
              {currentPlan === "FREE" ? "Current Plan" : "Downgrade to Free"}
            </Button>
          </div>

          {/* PLAN 2: CREATOR PRO */}
          <div
            className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
              currentPlan === "PRO"
                ? "border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-900/60 shadow-lg ring-2 ring-slate-900 dark:ring-white"
                : "border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md"
            }`}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-[10px] px-3 py-0.5 uppercase tracking-wider shadow-sm">
                Most Popular
              </Badge>
            </div>

            <div className="flex items-center justify-between mb-4 mt-2">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {PLANS.PRO.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{PLANS.PRO.tagline}</p>
              </div>
              {currentPlan === "PRO" && (
                <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                  Active
                </Badge>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-slate-900 dark:text-slate-100">
                  ${billingCycle === "monthly" ? PLANS.PRO.priceMonthly : Math.round(PLANS.PRO.priceYearly / 12)}
                </span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {billingCycle === "yearly" ? `$${PLANS.PRO.priceYearly} billed annually` : "Billed monthly"}
                {" • Up to 4 accounts"}
              </p>
            </div>

            <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-300 flex-1 mb-8">
              {PLANS.PRO.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-slate-900 dark:text-white shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full bg-slate-900 hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-bold h-11 gap-2 shadow-sm"
              disabled={currentPlan === "PRO" || isUpdating}
              onClick={() => handlePlanAction("PRO")}
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : currentPlan === "PRO" ? (
                "Current Plan"
              ) : (
                <>
                  <span>Upgrade to Creator Pro</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* PLAN 3: AGENCY & SCALE */}
          <div
            className={`flex flex-col rounded-2xl border p-6 transition-all ${
              currentPlan === "AGENCY"
                ? "border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-900/60 shadow-md ring-1 ring-slate-900 dark:ring-white"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {PLANS.AGENCY.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{PLANS.AGENCY.tagline}</p>
              </div>
              {currentPlan === "AGENCY" && (
                <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                  Active
                </Badge>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-slate-900 dark:text-slate-100">
                  ${billingCycle === "monthly" ? PLANS.AGENCY.priceMonthly : Math.round(PLANS.AGENCY.priceYearly / 12)}
                </span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {billingCycle === "yearly" ? `$${PLANS.AGENCY.priceYearly} billed annually` : "Billed monthly"}
                {" • All 6 platforms"}
              </p>
            </div>

            <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-300 flex-1 mb-8">
              {PLANS.AGENCY.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-slate-900 dark:text-white shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              className="w-full border-slate-900 dark:border-white text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold h-11 gap-2"
              disabled={currentPlan === "AGENCY" || isUpdating}
              onClick={() => handlePlanAction("AGENCY")}
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : currentPlan === "AGENCY" ? (
                "Current Plan"
              ) : (
                <>
                  <span>Upgrade to Agency &amp; Scale</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* BILLING HISTORY */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Billing History</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Recent plan changes and payment events.
            </p>
          </div>
          {testMode && (
            <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 text-[10px]">
              Test mode — no real payments
            </Badge>
          )}
        </div>

        {billingHistory.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            No billing activity yet. Your first payment event will appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {billingHistory.slice(0, 10).map((ev, i) => {
              const isSuccess = ev.type === "SUBSCRIPTION_ACTIVATED" || ev.type === "TEST_ACTIVATION";
              const isFailed = ev.type === "PAYMENT_FAILED";
              return (
                <div
                  key={ev.id || i}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isSuccess ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : isFailed ? (
                      <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {ev.message || ev.type.replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {ev.plan} · {ev.billingCycle} ·{" "}
                        {ev.amount ? `$${ev.amount} ` : ""}
                        {ev.provider === "payoneer" ? "Payoneer" : ev.provider}
                        {ev.transactionId ? ` · ${ev.transactionId.slice(-10)}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {ev.createdAt
                      ? new Date(ev.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PAYMENT & SECURITY GUARANTEE */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Enterprise Grade Security &amp; Compliance
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              All payment transactions are processed with 256-bit encryption. Raw credit card data is never stored on our servers. You can cancel or switch plans anytime.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-500 font-medium">Supported Payment Methods:</span>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
              Visa / Mastercard
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
              {paymentProvider === "payoneer" ? "Payoneer Checkout" : "Payoneer Checkout (pending setup)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
