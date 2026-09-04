"use client";

import React from "react";
import { Receipt } from "lucide-react";
import type { BillingActionGroup } from "./types";

/**
 * What each thing costs, in credits.
 *
 * Published for one reason: a customer who can see the price before they click can
 * decide, and a customer who cannot is being metered in the dark. The numbers are
 * the same constants the charge is taken from — this table is rendered from the
 * server's own resolution of the action catalogue, not from a copy of it, so a
 * price change moves both at once or neither.
 */
interface PricePanelProps {
  groups: BillingActionGroup[];
}

export function PricePanel({ groups }: PricePanelProps) {
  if (groups.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-2.5">
        <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
        <div>
          <h3 className="text-base font-bold text-foreground">What each action costs</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            One credit is one cent of model spend. Nothing is charged until the work succeeds, and
            a run that fails part-way returns what it did not use.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{group.blurb}</p>

            <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {group.actions.map((action) => (
                <div
                  key={action.key}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-muted/20 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-foreground">
                      {action.credits.toLocaleString()}
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                        credits
                      </span>
                    </p>
                    {/* The dollar figure is the same credits, said in the unit the
                        card statement will use. Both, because neither alone lands. */}
                    <p className="text-[11px] text-muted-foreground">
                      ≈ ${action.usd < 0.01 ? action.usd.toFixed(3) : action.usd.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
