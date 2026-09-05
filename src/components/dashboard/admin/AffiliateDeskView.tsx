"use client";

// ============================================================================
// AFFILIATE DESK
//
// Payout queue, affiliates table, referral ledger. The queue is the existing
// AdminPayouts component; the other two tabs answer "who has earned what" and
// "why was this referral rejected" without opening the database.
// ============================================================================

import Link from "next/link";
import { Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPayouts } from "@/components/dashboard/affiliate/AdminPayouts";
import type { AdminPayoutView } from "@/lib/affiliate/payouts";
import type { AffiliateDesk } from "@/lib/admin/affiliate";
import type { AffiliateTerms } from "@/lib/admin/runtimeConfig";
import { Empty, Section, Stat, fmtDate, fmtDay, fmtInt, fmtUsd } from "./primitives";

const REFERRAL_STATUS: Record<string, string> = {
  PENDING: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  CONVERTED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

export function AffiliateDeskView({ payouts, desk, terms }: { payouts: AdminPayoutView[]; desk: AffiliateDesk; terms: AffiliateTerms }) {
  const open = payouts.filter((p) => p.status === "REQUESTED" || p.status === "APPROVED").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Affiliates" value={fmtInt(desk.totals.affiliates)} hint={`${fmtInt(desk.totals.referrals)} referrals · ${fmtInt(desk.totals.converted)} converted`} />
        <Stat label="Locked" value={fmtUsd(desk.totals.lockedCents)} hint={`${terms.lockDays}-day refund window`} />
        <Stat label="Available" value={fmtUsd(desk.totals.availableCents)} hint="withdrawable now" />
        <Stat label="Paid out" value={fmtUsd(desk.totals.paidCents)} hint="cash and credits" />
        <Stat label="Payouts open" value={fmtInt(open)} tone={open > 0 ? "warn" : "default"} hint={`min ${fmtUsd(terms.minPayoutCents)} · ${terms.commissionPercent}% or ${fmtUsd(terms.flatCommissionCents)}`} />
      </div>

      <Tabs defaultValue={open > 0 ? "payouts" : "affiliates"}>
        <TabsList className="mb-4 h-8">
          <TabsTrigger value="payouts" className="text-xs">
            Payouts {open > 0 && <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-400">{open}</span>}
          </TabsTrigger>
          <TabsTrigger value="affiliates" className="text-xs">Affiliates ({desk.affiliates.length})</TabsTrigger>
          <TabsTrigger value="referrals" className="text-xs">Referral ledger ({desk.referrals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="payouts">
          <AdminPayouts initial={payouts} />
        </TabsContent>

        <TabsContent value="affiliates">
          <Section title="Affiliates" description="Everyone who has referred at least one account, most earned first.">
            {desk.affiliates.length === 0 ? (
              <Empty>No referrals yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Affiliate</th>
                      <th className="py-1 pr-2 font-medium">Code</th>
                      <th className="py-1 pr-2 text-right font-medium">Referrals</th>
                      <th className="py-1 pr-2 text-right font-medium">Converted</th>
                      <th className="py-1 pr-2 text-right font-medium">Rejected</th>
                      <th className="py-1 pr-2 text-right font-medium">Locked</th>
                      <th className="py-1 pr-2 text-right font-medium">Available</th>
                      <th className="py-1 pr-2 text-right font-medium">Paid</th>
                      <th className="py-1 pr-2 text-right font-medium">→ credits</th>
                      <th className="py-1 font-medium">Last referral</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {desk.affiliates.map((a) => (
                      <tr key={a.userId}>
                        <td className="py-1.5 pr-2">
                          <Link href={`/adminshahid/users/${a.userId}`} className="font-medium hover:underline">{a.email}</Link>
                          {a.blocked && <Ban className="ml-1 inline h-3 w-3 text-rose-500" />}
                          {a.payoutsOpen > 0 && <Badge variant="secondary" className="ml-1 bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">payout open</Badge>}
                          <div className="text-[10px] text-muted-foreground">{a.name || a.userId}</div>
                        </td>
                        <td className="py-1.5 pr-2 font-mono">{a.referralCode || "—"}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{a.referrals}<span className="text-muted-foreground"> ({a.pending} pending)</span></td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{a.converted}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{a.rejected}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtUsd(a.lockedCents)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtUsd(a.availableCents)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtUsd(a.paidCents)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{fmtUsd(a.convertedToCreditsCents)}</td>
                        <td className="py-1.5 text-muted-foreground">{fmtDay(a.lastReferralAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="referrals">
          <Section title="Referral ledger" description="Newest first. Risk score and flags are the fraud checks at signup; a rejection names its reason.">
            {desk.referrals.length === 0 ? (
              <Empty>No referrals recorded.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2 font-medium">When</th>
                      <th className="py-1 pr-2 font-medium">Referrer</th>
                      <th className="py-1 pr-2 font-medium">Referred</th>
                      <th className="py-1 pr-2 font-medium">Status</th>
                      <th className="py-1 pr-2 text-right font-medium">Risk</th>
                      <th className="py-1 pr-2 font-medium">Signals</th>
                      <th className="py-1 pr-2 font-medium">Bought</th>
                      <th className="py-1 font-medium">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {desk.referrals.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                        <td className="py-1.5 pr-2"><Link href={`/adminshahid/users/${r.referrerId}`} className="hover:underline">{r.referrerEmail}</Link></td>
                        <td className="py-1.5 pr-2"><Link href={`/adminshahid/users/${r.referredId}`} className="hover:underline">{r.referredEmail}</Link></td>
                        <td className="py-1.5 pr-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REFERRAL_STATUS[r.status] ?? ""}`}>{r.status}</span>
                          {r.rejectReason && <div className="max-w-[220px] text-[10px] text-muted-foreground">{r.rejectReason}</div>}
                        </td>
                        <td className={`py-1.5 pr-2 text-right tabular-nums ${r.riskScore >= 60 ? "text-rose-600" : r.riskScore >= 30 ? "text-amber-600" : ""}`}>{r.riskScore}</td>
                        <td className="max-w-[200px] py-1.5 pr-2 font-mono text-[10px] text-muted-foreground">{r.riskFlags.join(", ") || "—"}{r.ipCountry ? ` · ${r.ipCountry}` : ""}</td>
                        <td className="py-1.5 pr-2">{r.planPurchased ? `${r.planPurchased} · ${fmtUsd(r.firstPaymentCents ?? 0)}` : "—"}</td>
                        <td className="py-1.5">{r.commissionCents !== null ? `${fmtUsd(r.commissionCents)} · ${r.commissionStatus}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
