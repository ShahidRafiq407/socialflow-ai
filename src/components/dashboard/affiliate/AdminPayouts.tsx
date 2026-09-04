"use client";

// ============================================================================
// AFFILIATE PAYOUTS — THE ADMIN DESK
//
// A payout is money by hand: read the account, open the provider's app, pay,
// come back and record it. This screen exists so that the record is part of the
// same motion — the row itself is the queue, and every action writes who did
// it and when.
//
// Rejecting hands the commissions straight back to the affiliate; that is the
// whole cost of a wrong click, and it is deliberate.
// ============================================================================

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  approvePayoutAction,
  markPayoutPaidAction,
  rejectPayoutAction,
} from "@/actions/affiliateAdmin";
import { formatUsd } from "@/lib/affiliate/config";
import type { AdminPayoutView } from "@/lib/affiliate/payouts";

const METHOD_LABEL: Record<AdminPayoutView["method"], string> = {
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  PAYPAL: "PayPal",
};

const STATUS: Record<AdminPayoutView["status"], { label: string; className: string }> = {
  REQUESTED: { label: "Requested", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  APPROVED: { label: "Being paid", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  PAID: { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  REJECTED: { label: "Rejected", className: "bg-destructive/15 text-destructive" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PayoutRow({ payout }: { payout: AdminPayoutView }) {
  const [reference, setReference] = useState(payout.reference ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const act = async (key: string, fn: () => Promise<{ ok: boolean }>) => {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (result.ok) {
      startTransition(() => router.refresh());
    } else {
      setError("That action could not be applied — the request may have just changed. Refreshing.");
      startTransition(() => router.refresh());
    }
  };

  const open = payout.status === "REQUESTED" || payout.status === "APPROVED";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{formatUsd(payout.amountCents)}</span>
              <Badge variant="secondary" className={STATUS[payout.status].className}>
                {STATUS[payout.status].label}
              </Badge>
              <Badge variant="outline">{METHOD_LABEL[payout.method]}</Badge>
              <span className="text-xs text-muted-foreground">
                {payout.commissionCount} commission{payout.commissionCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {payout.userName ? `${payout.userName} · ` : ""}
              {payout.userEmail}
            </div>
            <div className="text-xs text-muted-foreground">Requested {fmtDate(payout.createdAt)}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account holder</div>
            <div className="mt-0.5 text-sm font-medium">{payout.accountName}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {payout.method === "PAYPAL" ? "PayPal email" : "Mobile number"}
            </div>
            <div className="mt-0.5 font-mono text-sm">{payout.accountDetail || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reference</div>
            <div className="mt-0.5 text-sm">{payout.reference ?? (payout.paidAt ? "—" : "not yet paid")}</div>
            {payout.paidAt ? (
              <div className="text-xs text-muted-foreground">Paid {fmtDate(payout.paidAt)}</div>
            ) : null}
          </div>
        </div>

        {payout.adminNote ? (
          <p className="mt-3 text-sm text-muted-foreground">Note: {payout.adminNote}</p>
        ) : null}

        {open ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction reference (optional)"
              className="sm:max-w-xs"
              maxLength={200}
            />
            <div className="flex flex-wrap gap-2">
              {payout.status === "REQUESTED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => act("approve", () => approvePayoutAction(payout.id))}
                >
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                  Acknowledge
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => act("paid", () => markPayoutPaidAction(payout.id, reference))}
              >
                {busy === "paid" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Mark as paid
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  act("reject", () =>
                    rejectPayoutAction(payout.id, note.trim() || `Wrong or unreachable ${METHOD_LABEL[payout.method]} account`)
                  )
                }
              >
                {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </Button>
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason (shown to the affiliate, optional)"
              className="sm:max-w-xs"
              maxLength={500}
            />
          </div>
        ) : null}

        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AdminPayouts({ initial }: { initial: AdminPayoutView[] }) {
  // Fresh props arrive with router.refresh() after every action, so a row that
  // settles moves to the settled section on its own.
  const data = initial;
  const pending = data.filter((p) => p.status === "REQUESTED" || p.status === "APPROVED");
  const settled = data.filter((p) => p.status === "PAID" || p.status === "REJECTED");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6" /> Affiliate payouts
        </h1>
        <p className="text-sm text-muted-foreground">
          {pending.length > 0
            ? `${pending.length} request${pending.length === 1 ? "" : "s"} waiting. Pay through the provider's app, then record it here.`
            : "No open requests. Settled payouts are below."}
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing to pay right now.
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((p) => (
            <PayoutRow key={p.id} payout={p} />
          ))}
        </div>
      )}

      {settled.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Settled</h2>
          {settled.map((p) => (
            <PayoutRow key={p.id} payout={p} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
