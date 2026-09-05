"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check, FlaskConical, Share2, Sparkles, Video, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCap } from "@/lib/billing/plans";
import type { SettingsData } from "./types";

/**
 * Billing section — a read-only summary of the current plan.
 *
 * Plan changes, checkout and invoices live on the billing page; this card only
 * shows what the account already has. The credit figures come from the wallet, so
 * they are the same numbers the gates enforce rather than a display estimate.
 *
 * Every plan figure arrives as data. It used to call `getPlanConfig`/
 * `getEntitlements` here, which in a client component reads the code defaults
 * compiled into the browser bundle — never the admin's overrides — so an edited
 * price or a lowered account ceiling was shown wrong to the person it applies to.
 */
export function BillingCard({ data }: { data: SettingsData }) {
  const {
    tier,
    status,
    testMode,
    creditsAvailable,
    monthlyGrant,
    percentUsed,
    planName,
    priceMonthly,
    oneTimePrice,
    socialAccountsPerWorkspace,
    hasAiGeneration,
    hasAiVideo,
  } = data.billing;
  const connected = data.counts.socialAccounts;

  const limits = [
    {
      icon: <Share2 className="h-4 w-4" />,
      label: "Social accounts",
      value: `${connected} / ${formatCap(socialAccountsPerWorkspace)} connected`,
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: "AI generation",
      value: hasAiGeneration ? "Included" : "Manual mode only",
    },
    {
      icon: <Video className="h-4 w-4" />,
      label: "AI video",
      value: hasAiVideo ? "Included" : "Not included",
    },
    {
      icon: <Wallet className="h-4 w-4" />,
      label: "Credits",
      value:
        monthlyGrant === 0
          ? "None on this plan"
          : `${creditsAvailable.toLocaleString()} left of ${monthlyGrant.toLocaleString()} / month`,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current plan</CardTitle>
        <CardDescription>
          What your account is on today. Upgrades, downgrades and invoices happen on the billing
          page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {testMode && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <FlaskConical className="h-4 w-4 shrink-0" />
            This subscription came from a test store, so no real payment was taken.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-lg font-bold text-foreground">{planName}</span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                tier === "PRO"
                  ? "bg-secondary text-secondary-foreground"
                  : tier === "AGENCY"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {tier}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                status.toUpperCase() === "ACTIVE"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {status.toUpperCase() === "ACTIVE" && <Check className="h-3 w-3" />}
              {status || "ACTIVE"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {oneTimePrice !== undefined
              ? `$${oneTimePrice} once`
              : priceMonthly === 0
                ? "Free"
                : `$${priceMonthly} / month`}
          </p>
        </div>

        {monthlyGrant > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {limits.map((limit) => (
            <div
              key={limit.label}
              className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3"
            >
              <span className="mt-0.5 text-secondary shrink-0">{limit.icon}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {limit.label}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">{limit.value}</p>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/dashboard/billing"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Wallet className="h-4 w-4" />
          Manage Plan
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
