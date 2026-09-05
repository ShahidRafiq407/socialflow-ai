// ============================================================================
// AFFILIATE — WHAT THE TAB SHOWS
//
// One read assembles everything the Affiliate tab renders: the code and link,
// the counts, the money split by state (locked / available / paid out), the
// referred-account list with just enough identity to recognise a person, and
// the payout history. Opening the tab also unlocks matured commissions, so the
// numbers move on their own schedule even if the cron is quiet.
// ============================================================================

import prisma from "@/lib/db";
import { getAppBaseUrl } from "@/lib/media/urls";
import { getOrCreateReferralCode, unlockMaturedCommissions } from "@/lib/affiliate/referral";
import { liveAffiliateTerms } from "@/lib/affiliate/terms";
import type { AffiliateTermsView } from "@/lib/affiliate/config";

/** Enough of an identity to recognise, not enough to contact. */
function maskName(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
  }
  const at = email.lastIndexOf("@");
  if (at <= 0) return "User";
  const local = email.slice(0, at);
  return `${local.charAt(0)}•••${email.slice(at)}`;
}

export interface ReferralRow {
  id: string;
  status: "PENDING" | "CONVERTED" | "REJECTED";
  who: string;
  plan: string | null;
  commissionCents: number | null;
  earnedAt: string | null;
  unlocksAt: string | null;
  rejectReason: string | null;
  joinedAt: string;
}

export interface PayoutRow {
  id: string;
  amountCents: number;
  method: "JAZZCASH" | "EASYPAISA" | "PAYPAL";
  accountMasked: string;
  accountName: string;
  status: "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";
  reference: string | null;
  adminNote: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AffiliateOverview {
  code: string;
  link: string;
  stats: {
    total: number;
    pending: number;
    converted: number;
    rejected: number;
    lockedCents: number;
    availableCents: number;
    paidOutCents: number;
    pendingPayoutCents: number;
    rejectedCents: number;
    lifetimeEarnedCents: number;
    creditsConverted: number;
  };
  referrals: ReferralRow[];
  payouts: PayoutRow[];
  /** A withdrawal already in flight; the form waits until it settles. */
  hasOpenPayout: boolean;
  /** The commission and payout terms in force, as set in the back office. */
  terms: AffiliateTermsView;
}

export async function getAffiliateOverview(userId: string): Promise<AffiliateOverview> {
  const terms = await liveAffiliateTerms();
  const code = await getOrCreateReferralCode(userId);
  await unlockMaturedCommissions(userId);

  const [referrals, commissions, payouts] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        planPurchased: true,
        rejectReason: true,
        createdAt: true,
        convertedAt: true,
        referred: { select: { name: true, email: true } },
        commission: { select: { amountCents: true, unlocksAt: true } },
      },
    }),
    prisma.commission.findMany({
      where: { referrerId: userId },
      select: {
        amountCents: true,
        status: true,
        convertedToCredits: true,
        payout: { select: { status: true } },
      },
    }),
    prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountCents: true,
        method: true,
        accountMasked: true,
        accountName: true,
        status: true,
        reference: true,
        adminNote: true,
        createdAt: true,
        paidAt: true,
      },
    }),
  ]);

  const money = {
    locked: 0,
    available: 0,
    paid: 0,
    inFlight: 0,
    rejected: 0,
    lifetime: 0,
    creditsConverted: 0,
  };
  for (const c of commissions) {
    if (c.status === "REJECTED") {
      money.rejected += c.amountCents;
      continue;
    }
    money.lifetime += c.amountCents;
    if (c.status === "LOCKED") money.locked += c.amountCents;
    if (c.status === "AVAILABLE") money.available += c.amountCents;
    if (c.status === "CASHED_OUT") {
      if (c.convertedToCredits) {
        money.creditsConverted += c.amountCents;
      } else if (c.payout?.status === "PAID" || c.payout?.status === "APPROVED") {
        money.paid += c.amountCents;
      } else {
        money.inFlight += c.amountCents;
      }
    }
  }

  const count = {
    pending: 0,
    converted: 0,
    rejected: 0,
  };
  for (const r of referrals) {
    if (r.status === "PENDING") count.pending += 1;
    else if (r.status === "CONVERTED") count.converted += 1;
    else count.rejected += 1;
  }

  const base = getAppBaseUrl().replace(/\/$/, "");
  const hasOpenPayout = payouts.some((p) => p.status === "REQUESTED" || p.status === "APPROVED");

  return {
    code,
    // The short form reads better in a caption; it lands on the marketing page
    // with the attribution cookie already set.
    link: `${base}/ref/${code}`,
    stats: {
      total: referrals.length,
      pending: count.pending,
      converted: count.converted,
      rejected: count.rejected,
      lockedCents: money.locked,
      availableCents: money.available,
      paidOutCents: money.paid,
      pendingPayoutCents: money.inFlight,
      rejectedCents: money.rejected,
      lifetimeEarnedCents: money.lifetime,
      creditsConverted: money.creditsConverted,
    },
    referrals: referrals.map((r) => ({
      id: r.id,
      status: r.status,
      who: maskName(r.referred?.name ?? null, r.referred?.email ?? ""),
      plan: r.planPurchased,
      commissionCents: r.commission?.amountCents ?? null,
      earnedAt: r.convertedAt?.toISOString() ?? null,
      unlocksAt: r.commission?.unlocksAt?.toISOString() ?? null,
      rejectReason: r.rejectReason,
      joinedAt: r.createdAt.toISOString(),
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      method: p.method,
      accountMasked: p.accountMasked,
      accountName: p.accountName,
      status: p.status,
      reference: p.reference,
      adminNote: p.adminNote,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
    })),
    hasOpenPayout,
    terms,
  };
}
