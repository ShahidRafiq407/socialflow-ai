"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Sparkles, Video, Wallet, Share2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlanConfig } from "@/lib/billing/plans";
import type { SettingsData } from "./types";

/**
 * Billing section — a read-only summary of the current plan.
 *
 * Plan changes, checkout and billing history live on the billing page; this
 * card only shows what the user already has. Limits are plan facts, not usage
 * metering — there is no credit tracking system yet, so none is faked here.
 */
export function BillingCard({ data }: { data: SettingsData }) {
  const { tier, status, billingEnabled } = data.billing;
  const config = getPlanConfig(tier);
  const connected = data.counts.socialAccounts;

  const limits = [
    {
      icon: <Share2 className="h-4 w-4" />,
      label: "Social accounts",
      value: `${connected} / ${config.maxSocialAccounts} connected`,
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: "AI generation",
      value: config.canAccessAI ? "Included" : "Manual mode only",
    },
    {
      icon: <Video className="h-4 w-4" />,
      label: "AI video",
      value: config.canGenerateVideo ? "Included" : "Not included",
    },
    {
      icon: <Wallet className="h-4 w-4" />,
      label: "AI credits",
      value:
        config.aiCreditsPerMonth === -1
          ? "Unlimited"
          : config.aiCreditsPerMonth === 0
            ? "None on this plan"
            : `${config.aiCreditsPerMonth} / month`,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current plan</CardTitle>
        <CardDescription>
          What your workspace is on today. Upgrades, downgrades and invoices happen on the billing
          page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!billingEnabled && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Clock className="h-4 w-4 shrink-0" />
            Test mode — no real payments. Plan checks are disabled while the product is being
            tested.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-lg font-bold text-foreground">{config.name}</span>
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
            {config.priceMonthly === 0 ? "Free" : `$${config.priceMonthly} / month`}
          </p>
        </div>

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
