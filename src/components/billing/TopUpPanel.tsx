"use client";

import React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TopUpPack } from "@/lib/billing/plans";
import type { BillingStore } from "./types";
import { fmtCredits } from "./format";

/**
 * Credit packs.
 *
 * A ceiling that can only be raised by changing plan turns a busy month into a
 * support ticket, so packs exist — one payment, no subscription touched. They are
 * spent only after the period's grant is gone and they never expire, which is why
 * buying one can never cost a customer credits they already had.
 *
 * Hidden on Free rather than shown and refused: credits only buy features a paid
 * plan opens, so selling them there would be selling something unusable.
 */
interface TopUpPanelProps {
  packs: TopUpPack[];
  store: BillingStore;
  planId: string;
  canBuy: boolean;
  busy: string | null;
  onBuy: (packId: string) => void;
}

export function TopUpPanel({ packs, store, planId, canBuy, busy, onBuy }: TopUpPanelProps) {
  if (planId === "FREE" || !canBuy) return null;

  // Cheapest per credit wins the label, worked out from the pack's own numbers so a
  // repriced pack cannot leave a stale "best value" badge behind.
  const best = packs.reduce<TopUpPack | null>(
    (cheapest, pack) =>
      !cheapest || pack.priceUsd / pack.credits < cheapest.priceUsd / cheapest.credits
        ? pack
        : cheapest,
    null
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Need more credits this month?</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            One payment, no change to your plan. Packs never expire and are only spent once this
            period's credits are gone.
          </p>
        </div>
      </div>

      {!store.topUpsPurchasable && (
        <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Credit packs are not switched on for this deployment yet.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {packs.map((pack) => {
          const perThousand = (pack.priceUsd / pack.credits) * 1_000;
          return (
            <div
              key={pack.id}
              className={`rounded-xl border p-4 ${
                best?.id === pack.id ? "border-primary bg-primary/[0.04]" : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-foreground">{fmtCredits(pack.credits)}</p>
                {best?.id === pack.id && packs.length > 1 && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    Best value
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ${pack.priceUsd} · ${perThousand.toFixed(2)} per 1,000
              </p>

              <Button
                variant="outline"
                className="mt-3 w-full gap-1.5 text-xs font-semibold"
                onClick={() => onBuy(pack.id)}
                disabled={!store.topUpsPurchasable || busy !== null}
              >
                {busy === pack.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Buy for ${pack.priceUsd}
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
