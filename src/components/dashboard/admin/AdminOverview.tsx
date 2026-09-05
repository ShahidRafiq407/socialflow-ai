"use client";

// ============================================================================
// ADMIN OVERVIEW — THE DASHBOARD
//
// Reads one `AdminOverview` and lays it out: health first (what needs a person),
// then growth, money, cost, credits and the affiliate program. Profit is stated
// with its formula beside it so nobody has to guess what "profit" excludes.
// ============================================================================

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import type { AdminOverview as Overview, StatsRange } from "@/lib/admin/stats";
import { PLAN_TIERS } from "@/lib/billing/plans";
import { Bars, Empty, PlanPill, Section, Stat, fmtInt, fmtMicros, fmtUsd } from "./primitives";

const RANGE_LABEL: Record<StatsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
  all: "All time",
};

export function AdminOverview({ data, ranges }: { data: Overview; ranges: StatsRange[] }) {
  const health = data.health;
  const issues: Array<{ label: string; count: number; href: string; severe?: boolean }> = [
    { label: "open errors", count: health.openErrors, href: "/dashboard/admin/errors", severe: true },
    { label: "webhooks not processed", count: health.unprocessedWebhooks, href: "/dashboard/admin/users", severe: true },
    { label: "payouts waiting", count: health.pendingPayouts, href: "/dashboard/admin/affiliate" },
    { label: "thumbs-down this week", count: health.feedbackDown7d, href: "/dashboard/admin/feedback" },
    { label: "unattributed model calls (30d)", count: health.unattributedCalls, href: "/dashboard/admin/models" },
  ].filter((i) => i.count > 0);

  const aiCents = Math.round(data.costs.aiMicros / 10_000);

  return (
    <div className="space-y-5">
      {/* Range picker */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{RANGE_LABEL[data.range].toLowerCase()}</span>
          {data.since ? ` since ${new Date(data.since).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.
        </p>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <Link
              key={r}
              href={`/dashboard/admin?range=${r}`}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                r === data.range
                  ? "bg-primary text-primary-foreground"
                  : "border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              {RANGE_LABEL[r]}
            </Link>
          ))}
        </div>
      </div>

      {/* Health */}
      <div
        className={`rounded-lg border p-3.5 ${
          issues.length === 0
            ? "border-emerald-500/30 bg-emerald-500/5"
            : issues.some((i) => i.severe)
              ? "border-rose-500/30 bg-rose-500/5"
              : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Nothing is waiting on you. No open errors, no stuck webhooks, no payouts due.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Needs attention
            </span>
            {issues.map((i) => (
              <Link key={i.label} href={i.href} className="flex items-center gap-1 text-xs hover:underline">
                <span className={`font-bold tabular-nums ${i.severe ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {fmtInt(i.count)}
                </span>
                {i.label}
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Headline */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net revenue" value={fmtUsd(data.revenue.afterFeesCents)} hint={`${fmtInt(data.revenue.payments)} payments · after LS fees`} tone="good" />
        <Stat label="AI cost" value={fmtMicros(data.costs.aiMicros)} hint={`${fmtInt(data.costs.calls)} model calls`} tone="bad" />
        <Stat label="Affiliate paid" value={fmtUsd(data.affiliate.commissionPaidCents)} hint={`${fmtUsd(data.affiliate.commissionLockedCents + data.affiliate.commissionAvailableCents)} still owed`} />
        <Stat
          label="Gross profit"
          value={fmtUsd(data.profit.grossProfitCents)}
          hint={`${data.profit.marginPercent}% margin · revenue − AI − affiliate`}
          tone={data.profit.grossProfitCents >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Users */}
        <Section title="Users" description="Signups in range, activity from the dashboard's last-seen stamp.">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total" value={fmtInt(data.users.total)} />
            <Stat label="New" value={fmtInt(data.users.newInRange)} hint="in range" />
            <Stat label="Active 7d" value={fmtInt(data.users.active7d)} hint={`${fmtInt(data.users.active30d)} in 30d`} />
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[11px] text-muted-foreground">Signups per day</div>
            <Bars points={data.users.signupsByDay} format={(v) => `${v} signups`} />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span>{fmtInt(data.users.blocked)} blocked</span>
            <span>{fmtInt(data.users.admins)} admins</span>
            <Link href="/dashboard/admin/users" className="ml-auto flex items-center gap-1 text-primary hover:underline">
              All users <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Section>

        {/* Plans */}
        <Section title="Plans" description="Live paid subscriptions by tier, test-mode excluded.">
          <div className="space-y-2">
            {PLAN_TIERS.filter((t) => t !== "FREE" && t !== "TRIAL").map((tier) => {
              const count = data.plans.byTier[tier];
              const total = Math.max(1, Object.values(data.plans.byTier).reduce((a, b) => a + b, 0));
              return (
                <div key={tier} className="flex items-center gap-3 text-xs">
                  <PlanPill plan={tier} />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(count / total) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right font-semibold tabular-nums">{fmtInt(count)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="MRR (list)" value={`$${fmtInt(Math.round(data.plans.mrrUsd))}`} />
            <Stat label="Trialing" value={fmtInt(data.plans.trialing)} />
            <Stat label="Past due" value={fmtInt(data.plans.pastDue)} tone={data.plans.pastDue > 0 ? "warn" : "default"} hint={`${fmtInt(data.plans.cancelling)} cancelling`} />
          </div>
        </Section>

        {/* Revenue */}
        <Section title="Revenue" description="From Lemon Squeezy webhook events — money that actually moved.">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Gross" value={fmtUsd(data.revenue.grossCents)} />
            <Stat label="Refunded" value={fmtUsd(data.revenue.refundedCents)} tone={data.revenue.refundedCents > 0 ? "warn" : "default"} />
            <Stat label="Top-ups" value={fmtUsd(data.revenue.topUpCents)} />
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[11px] text-muted-foreground">Net revenue per day</div>
            <Bars points={data.revenue.byDay} format={(v) => fmtUsd(v)} color="bg-emerald-500/70" />
          </div>
        </Section>

        {/* Costs */}
        <Section title="AI cost" description="Measured list cost of every model call, from the meter.">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total" value={fmtUsd(aiCents)} />
            <Stat label="Calls" value={fmtInt(data.costs.calls)} />
            <Stat label="Failed" value={fmtInt(data.costs.failedCalls)} tone={data.costs.failedCalls > 0 ? "warn" : "default"} />
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[11px] text-muted-foreground">Cost per day</div>
            <Bars points={data.costs.byDayMicros} format={(v) => fmtMicros(v)} color="bg-rose-500/60" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">By model</div>
              {data.costs.byModel.length === 0 ? (
                <Empty>No calls in range.</Empty>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.costs.byModel.slice(0, 8).map((row) => (
                    <li key={row.model} className="flex justify-between gap-2">
                      <span className="truncate font-mono">{row.model}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {fmtInt(row.calls)} · {fmtMicros(row.costMicros)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">By feature</div>
              {data.costs.byFeature.length === 0 ? (
                <Empty>No calls in range.</Empty>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.costs.byFeature.slice(0, 8).map((row) => (
                    <li key={row.feature} className="flex justify-between gap-2">
                      <span className="truncate">{row.feature}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {fmtInt(row.calls)} · {fmtMicros(row.costMicros)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>

        {/* Credits */}
        <Section title="Credits" description="The internal currency: granted by plans, spent by actions.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Granted" value={fmtInt(data.credits.granted)} hint="plan grants + top-ups" />
            <Stat label="Spent" value={fmtInt(data.credits.spent)} />
            <Stat label="Refunded" value={fmtInt(data.credits.refunded)} />
            <Stat label="Adjusted" value={fmtInt(data.credits.adjusted)} hint="by support" />
            <Stat label="Outstanding" value={fmtInt(data.credits.outstanding)} hint="across all wallets" />
            <Stat label="Held" value={fmtInt(data.credits.held)} hint="in-flight runs" />
          </div>
        </Section>

        {/* Affiliate */}
        <Section
          title="Affiliate program"
          description="Referrals in range; commission totals are all-time."
          action={
            <Link href="/dashboard/admin/affiliate" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Desk <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Referrals" value={fmtInt(data.affiliate.referrals)} hint={`${fmtInt(data.affiliate.converted)} converted`} />
            <Stat label="Locked" value={fmtUsd(data.affiliate.commissionLockedCents)} hint="in refund window" />
            <Stat label="Available" value={fmtUsd(data.affiliate.commissionAvailableCents)} hint="withdrawable" />
            <Stat label="Paid out" value={fmtUsd(data.affiliate.commissionPaidCents)} />
            <Stat
              label="Payouts due"
              value={fmtUsd(data.affiliate.payoutsRequestedCents)}
              hint={`${fmtInt(data.affiliate.payoutsRequested)} requests`}
              tone={data.affiliate.payoutsRequested > 0 ? "warn" : "default"}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
