"use client";

import React from "react";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingPayment, BillingPlanState } from "./types";
import { fmtDate } from "./format";

/**
 * How they pay, and how they stop.
 *
 * Lemon Squeezy is the merchant of record: they hold the card, collect the tax and
 * own the chargeback. That is why there is no card form on this page and no card
 * number in this codebase — everything sensitive happens behind their signed portal
 * link, which expires, which is why the link is fetched rather than stored.
 *
 * The same fact is why "Remove my card" is worded the way it is. We cannot delete a
 * card we have never held; what we can do is guarantee nothing will be charged to it
 * again, and send the customer to the one page where the details themselves live. The
 * button says that rather than implying a deletion this codebase cannot perform.
 *
 * The payment-method list is what the checkout *can* offer. Which methods a given
 * buyer actually sees is decided by their country, currency and device, so it is
 * never presented as a promise.
 */
interface PaymentPanelProps {
  payment: BillingPayment;
  planState: BillingPlanState;
  busy: string | null;
  onCancel: () => void;
  onResume: () => void;
  onPortal: () => void;
  onRemoveCard?: () => void;
}

function cardLine(payment: BillingPayment): string {
  if (payment.cardBrand && payment.cardLastFour) {
    const brand = payment.cardBrand.replace(/^./, (c) => c.toUpperCase());
    return `${brand} ending ${payment.cardLastFour}`;
  }
  if (payment.method) return payment.method.replace(/_/g, " ");
  return "No payment method on file yet";
}

export function PaymentPanel({
  payment,
  planState,
  busy,
  onCancel,
  onResume,
  onPortal,
  onRemoveCard = onPortal,
}: PaymentPanelProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <CreditCard className="h-3.5 w-3.5" />
          Payment method
        </p>
        <p className="mt-1.5 text-sm font-semibold capitalize text-foreground">
          {cardLine(payment)}
        </p>

        {planState.hasSubscription ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-1.5 text-xs font-semibold"
                onClick={onPortal}
                disabled={busy !== null}
              >
                {busy === "portal" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Invoices and receipts
              </Button>

              {payment.updatePaymentMethodUrl && (
                <a
                  href={payment.updatePaymentMethodUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Update card
                </a>
              )}

              <Button
                variant="ghost"
                className="gap-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                onClick={onRemoveCard}
                disabled={busy !== null}
              >
                {busy === "remove-card" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remove my card
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Removing your card ends the plan at the end of the period you have paid for, so
              nothing is ever charged again. The details themselves are held by Lemon Squeezy —
              we have never had them — so the last step happens on their page, which opens for
              you. Come back to any plan whenever you like.
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing is stored until you start a plan. When you do, the card lives with Lemon
            Squeezy — we never receive the number.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          What checkout accepts
        </p>
        <ul className="mt-2.5 space-y-2">
          {payment.methods.map((method) => (
            <li key={method.id} className="flex items-start gap-2 text-xs">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>
                <span className="font-semibold text-foreground">{method.label}</span>
                <span className="text-muted-foreground"> — {method.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Which of these you see depends on your country and device, so this is what the checkout
          can offer rather than a promise for every visitor. {payment.feeNote}
        </p>
      </div>

      {planState.hasSubscription && (
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          {planState.cancelAtPeriodEnd ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                Your plan ends on {fmtDate(planState.endsAt ?? planState.periodEnd)}.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Everything keeps working until then, and nothing else will be charged. Resuming
                before that date puts the plan back exactly as it was.
              </p>
              <Button
                className="mt-4 gap-1.5 text-xs font-semibold"
                onClick={onResume}
                disabled={busy !== null}
              >
                {busy === "resume" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Resume my plan
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Cancelling</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                You keep everything you have paid for until{" "}
                {fmtDate(planState.renewsAt ?? planState.periodEnd)}, and nothing is charged after
                that. Your posts, brand and connected accounts stay where they are — the account
                simply moves to Free.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                onClick={onCancel}
                disabled={busy !== null}
              >
                {busy === "cancel" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                Cancel my plan
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
