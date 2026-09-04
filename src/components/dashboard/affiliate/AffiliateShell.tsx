"use client";

// ============================================================================
// THE AFFILIATE TAB
//
// The read side renders what the server resolved (code, referrals, money by
// state, payouts). The write side is two buttons — "convert to credits" and
// "request payout" — and both go through server actions that revalidate this
// page, so a number the user just acted on never lingers stale on screen.
// ============================================================================

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Clock,
  Coins,
  Copy,
  Gift,
  HandCoins,
  Link2,
  Loader2,
  Lock,
  Share2,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requestPayoutAction, convertToCreditsAction } from "@/actions/affiliate";
import { AFFILIATE, formatUsd } from "@/lib/affiliate/config";
import type { AffiliateOverview, PayoutRow, ReferralRow } from "@/lib/affiliate/overview";

type PayoutMethodValue = "JAZZCASH" | "EASYPAISA" | "PAYPAL";

const METHOD_LABEL: Record<PayoutMethodValue, string> = {
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  PAYPAL: "PayPal",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const REFERRAL_STATUS: Record<ReferralRow["status"], { label: string; className: string }> = {
  PENDING: { label: "Signed up", className: "bg-secondary/20 text-secondary" },
  CONVERTED: { label: "Converted", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  REJECTED: { label: "Not eligible", className: "bg-muted text-muted-foreground" },
};

const PAYOUT_STATUS: Record<PayoutRow["status"], { label: string; className: string }> = {
  REQUESTED: { label: "Requested", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  APPROVED: { label: "Being paid", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  PAID: { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  REJECTED: { label: "Rejected", className: "bg-destructive/15 text-destructive" },
};

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export function AffiliateShell({ initial }: { initial: AffiliateOverview }) {
  const router = useRouter();
  // No local copy of the data: after every action the server re-renders this
  // component with fresh props, and a second copy would only be a stale one.
  const data = initial;
  const [copied, setCopied] = useState<string | null>(null);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Payout form state
  const [method, setMethod] = useState<PayoutMethodValue>("JAZZCASH");
  const [accountName, setAccountName] = useState("");
  const [accountDetail, setAccountDetail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setMessage({ tone: "error", text: "Copy failed — select the text and copy it manually." });
    }
  };

  const shareText = `I run my social media marketing on PostloomAI — AI writes the posts, articles and reels for me. If you sign up with my link, you support me directly:\n${data.link}`;

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "PostloomAI", text: shareText, url: data.link });
        return;
      } catch {
        /* dismissed — not an error */
      }
    }
    await copy(shareText, "share");
  };

  const convertCredits = async () => {
    setSubmitting(true);
    const result = await convertToCreditsAction();
    setSubmitting(false);
    if (result.ok) {
      setMessage({
        tone: "ok",
        text: `${result.credits.toLocaleString()} credits added to your wallet — spend them on any AI action.`,
      });
      refresh();
    } else {
      setMessage({ tone: "error", text: result.error });
    }
  };

  const submitPayout = async () => {
    setFormError(null);
    setSubmitting(true);
    const result = await requestPayoutAction({ method, accountName, accountDetail });
    setSubmitting(false);
    if (result.ok) {
      setPayoutOpen(false);
      setAccountDetail("");
      setMessage({
        tone: "ok",
        text: "Payout requested. An admin reviews it and transfers the money manually — you will see the status here.",
      });
      refresh();
    } else {
      setFormError(result.error);
    }
  };

  const s = data.stats;
  const canPayout = s.availableCents >= AFFILIATE.minPayoutCents && !data.hasOpenPayout;
  const canConvert = s.availableCents >= AFFILIATE.minCreditConversionCents;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Affiliate program</h1>
        <p className="text-sm text-muted-foreground">
          Share your link. When someone you brought in buys their first plan, you earn{" "}
          <strong>{formatUsd(AFFILIATE.flatCommissionCents)}</strong> or{" "}
          <strong>{AFFILIATE.commissionPercent}% of their first payment</strong> — whichever is more. Take it as
          platform credits or cash ({formatUsd(AFFILIATE.minPayoutCents)} minimum).
        </p>
      </div>

      {message ? (
        <div
          className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
            message.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.tone === "ok" ? (
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total referrals" value={String(s.total)} hint={`${s.pending} signed up, not yet paid`} />
        <StatCard icon={BadgeCheck} label="Converted" value={String(s.converted)} hint="Bought their first plan" />
        <StatCard
          icon={Wallet}
          label="Available"
          value={formatUsd(s.availableCents)}
          hint={s.lockedCents > 0 ? `${formatUsd(s.lockedCents)} still in the 30-day window` : undefined}
        />
        <StatCard icon={HandCoins} label="Lifetime earned" value={formatUsd(s.lifetimeEarnedCents)} hint={`${formatUsd(s.paidOutCents)} paid out`} />
      </div>

      {/* ── Link ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> Your referral link
          </CardTitle>
          <CardDescription>
            Anyone who signs up through this link is attributed to you — first click wins, and the cookie lasts{" "}
            {AFFILIATE.cookieDays} days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex h-10 flex-1 items-center rounded-md border bg-muted/40 px-3 font-mono text-sm truncate">
              {data.link}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => copy(data.link, "link")}>
                {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "link" ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" onClick={share}>
                <Share2 className="h-4 w-4" /> Share
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Code: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{data.code}</code>
            </span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copy(data.code, "code")}>
              {copied === "code" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Wallet ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Earnings
          </CardTitle>
          <CardDescription>
            Every commission waits {AFFILIATE.lockDays} days after the purchase — long enough for a refund to cancel
            it. After that it is yours to spend or withdraw.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Locked
              </div>
              <div className="mt-1.5 text-xl font-bold">{formatUsd(s.lockedCents)}</div>
              <div className="text-xs text-muted-foreground">Inside the refund window</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                <Coins className="h-3.5 w-3.5" /> Available
              </div>
              <div className="mt-1.5 text-xl font-bold">{formatUsd(s.availableCents)}</div>
              <div className="text-xs text-muted-foreground">Ready to use or withdraw</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> In payout
              </div>
              <div className="mt-1.5 text-xl font-bold">{formatUsd(s.pendingPayoutCents)}</div>
              <div className="text-xs text-muted-foreground">Requested, being processed</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => setPayoutOpen(true)} disabled={!canPayout} className="sm:w-auto">
              <HandCoins className="h-4 w-4" /> Request payout
            </Button>
            <Button variant="outline" onClick={convertCredits} disabled={!canConvert || submitting || pending}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
              Convert to credits
            </Button>
            {!canPayout && (
              <span className="self-center text-xs text-muted-foreground">
                {data.hasOpenPayout
                  ? "A payout is already being processed."
                  : `Minimum payout is ${formatUsd(AFFILIATE.minPayoutCents)}.`}
              </span>
            )}
          </div>

          {s.creditsConverted > 0 ? (
            <p className="text-xs text-muted-foreground">
              {formatUsd(s.creditsConverted)} of your earnings have been converted to platform credits so far.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Referrals ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People you referred</CardTitle>
          <CardDescription>Only a masked name is shown — contact details stay private.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.referrals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Gift className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No referrals yet. Share your link — the moment someone signs up through it, they appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Who</th>
                    <th className="pb-2 pr-4 font-medium">Joined</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Plan</th>
                    <th className="pb-2 pr-4 font-medium">Commission</th>
                    <th className="pb-2 font-medium">Unlocks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">{r.who}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{fmtDate(r.joinedAt)}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="secondary" className={REFERRAL_STATUS[r.status].className}>
                          {REFERRAL_STATUS[r.status].label}
                        </Badge>
                        {r.rejectReason ? (
                          <span className="ml-2 text-xs text-muted-foreground" title={r.rejectReason}>
                            ({r.rejectReason})
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{r.plan ?? "—"}</td>
                      <td className="py-2.5 pr-4 font-medium">
                        {r.commissionCents !== null ? formatUsd(r.commissionCents) : "—"}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {r.status === "CONVERTED" ? fmtDate(r.unlocksAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Payouts ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout history</CardTitle>
          <CardDescription>
            Payouts are transferred manually by our team to the account you provide — usually within a few business
            days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.payouts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payouts requested yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Requested</th>
                    <th className="pb-2 pr-4 font-medium">Amount</th>
                    <th className="pb-2 pr-4 font-medium">Method</th>
                    <th className="pb-2 pr-4 font-medium">Account</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payouts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 text-muted-foreground">{fmtDate(p.createdAt)}</td>
                      <td className="py-2.5 pr-4 font-medium">{formatUsd(p.amountCents)}</td>
                      <td className="py-2.5 pr-4">{METHOD_LABEL[p.method]}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {p.accountMasked}
                        <span className="text-xs"> · {p.accountName}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="secondary" className={PAYOUT_STATUS[p.status].className}>
                          {PAYOUT_STATUS[p.status].label}
                        </Badge>
                        {p.adminNote ? (
                          <span className="ml-2 text-xs text-muted-foreground" title={p.adminNote}>
                            ({p.adminNote})
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{p.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Rules ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" /> Program rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
            <li>
              Commission: the higher of {formatUsd(AFFILIATE.flatCommissionCents)} flat or{" "}
              {AFFILIATE.commissionPercent}% of the referred user&apos;s first plan payment. One commission per
              referred person — renewals and top-ups do not earn.
            </li>
            <li>
              The commission is credited only after the referred user&apos;s first <em>paid</em> plan. The $1 trial does
              not count.
            </li>
            <li>
              Each commission waits {AFFILIATE.lockDays} days (the refund window). A refunded purchase cancels its
              commission.
            </li>
            <li>
              Cash payouts: minimum {formatUsd(AFFILIATE.minPayoutCents)}, paid manually via JazzCash, Easypaisa or
              PayPal to the account details you provide.
            </li>
            <li>
              Credits: available earnings can be converted to platform credits at $0.01 per credit and spent on any
              AI action.
            </li>
            <li>
              Strictly enforced: signups through VPNs, proxies, Tor, relays or datacenter IPs, disposable email
              addresses, self-referrals and farmed signups are rejected and earn nothing.
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* ── Payout dialog ──────────────────────────────────────────────────── */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a payout</DialogTitle>
            <DialogDescription>
              Your full available balance of <strong>{formatUsd(s.availableCents)}</strong> will be paid to the
              account below. The transfer is made manually by our team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(METHOD_LABEL) as PayoutMethodValue[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      method === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-muted/50"
                    }`}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-name">Account holder name</Label>
              <Input
                id="account-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Name as registered with the provider"
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-detail">
                {method === "PAYPAL" ? "PayPal email" : "Mobile number"}
              </Label>
              <Input
                id="account-detail"
                value={accountDetail}
                onChange={(e) => setAccountDetail(e.target.value)}
                placeholder={method === "PAYPAL" ? "you@example.com" : "03XXXXXXXXX"}
                inputMode={method === "PAYPAL" ? "email" : "numeric"}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                {method === "PAYPAL"
                  ? "The PayPal address the payment should be sent to."
                  : "The JazzCash/Easypaisa mobile account number, e.g. 03001234567."}
              </p>
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitPayout} disabled={submitting || accountName.trim().length < 2 || accountDetail.trim().length < 3}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Request {formatUsd(s.availableCents)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
