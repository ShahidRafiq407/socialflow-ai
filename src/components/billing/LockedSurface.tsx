/**
 * A TAB THAT IS NOT ON THIS PLAN, SHOWN AS ITSELF
 *
 * Five dashboard tabs exist only for a feature that some plans do not include. Until
 * now every one of them rendered in full on Free: the Content Studio composed a
 * post, the Automate Task tab took a message, the Article Writer accepted a brief —
 * and the refusal arrived from the server after the work of filling the form was
 * already done. A screen a plan cannot use should say so before it is used.
 *
 * Server component on purpose. The five pages are server pages, so each one gates
 * itself with a single `await` and renders this — no provider, no client bundle, and
 * no chance of a locked page flashing its unlocked self while the plan loads.
 *
 * The only strings here are the furniture. The refusal sentence is the gate's, and
 * the bullets are the required plan's own catalogue copy, so a plan an admin
 * renamed, repriced, or moved a feature into describes itself correctly here
 * without this file knowing anything about tiers.
 */

import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import type { FeatureAccess } from "@/lib/billing/access";
import { getPlanConfig } from "@/lib/billing/plans";

export interface LockedSurfaceProps {
  access: FeatureAccess;
  /** The tab's own name, so the heading matches the sidebar the customer clicked. */
  title: string;
  /** One line on what the tab does. Shown above the refusal, never instead of it. */
  purpose: string;
}

export default function LockedSurface({ access, title, purpose }: LockedSurfaceProps) {
  const upgrade = access.requiredPlan ? getPlanConfig(access.requiredPlan) : null;
  const capped = access.blocker === "cap";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-10 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{purpose}</p>
        </div>
      </div>

      {/* The gate's sentence, verbatim. It already names the plan, the price and the
          reset date, so nothing is added around it. */}
      <p className="rounded-xl border border-secondary/30 bg-secondary/10 px-3.5 py-3 text-sm font-medium leading-relaxed text-secondary">
        {access.reason ?? `${access.label} is not available on your plan.`}
      </p>

      {upgrade && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-foreground">{upgrade.name}</h2>
            <p className="text-sm font-semibold text-foreground">
              ${upgrade.priceMonthly}
              <span className="text-xs font-medium text-muted-foreground"> a month</span>
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{upgrade.blurb}</p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {upgrade.features.slice(0, 6).map((line) => (
              <li key={line} className="flex items-start gap-1.5 text-xs leading-snug">
                <Check className="mt-[2px] h-3 w-3 shrink-0 text-primary" />
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={
            access.requiredPlan
              ? `/dashboard/billing?plan=${access.requiredPlan}`
              : "/dashboard/billing"
          }
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          {upgrade ? `Upgrade to ${upgrade.name}` : "See plans"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {/* A spent allowance is not a locked feature: the tab comes back on its own,
            so the way out is the meter rather than a plan card. */}
        <Link
          href={capped ? "/dashboard/billing?tab=usage" : "/dashboard/billing"}
          className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          {capped ? "See your usage" : "Compare every plan"}
        </Link>
      </div>
    </div>
  );
}
