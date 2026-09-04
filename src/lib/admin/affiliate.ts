// ============================================================================
// ADMIN — AFFILIATE DESK
//
// Everything the program owes and has paid, by person. The payout queue itself
// is `listPayoutsForAdmin()` in lib/affiliate/payouts.ts (it decrypts account
// details, so it stays there); this module adds the two views that were missing
// from the old payouts page: the affiliates as a table — who has earned what,
// what is locked, available, paid — and the referral ledger with its fraud
// signals, so an operator can see why a referral was rejected without opening
// the database.
// ============================================================================

import prisma from "@/lib/db";
import { ensureAdminSchema } from "./schema";

export interface AffiliateRow {
  userId: string;
  email: string;
  name: string | null;
  referralCode: string | null;
  blocked: boolean;
  referrals: number;
  pending: number;
  converted: number;
  rejected: number;
  lockedCents: number;
  availableCents: number;
  paidCents: number;
  rejectedCents: number;
  convertedToCreditsCents: number;
  payoutsOpen: number;
  lastReferralAt: string | null;
}

export interface ReferralLedgerRow {
  id: string;
  referrerEmail: string;
  referrerId: string;
  referredEmail: string;
  referredId: string;
  status: string;
  rejectReason: string | null;
  riskScore: number;
  riskFlags: string[];
  ipCountry: string | null;
  planPurchased: string | null;
  firstPaymentCents: number | null;
  commissionCents: number | null;
  commissionStatus: string | null;
  createdAt: string;
  convertedAt: string | null;
}

export interface AffiliateDesk {
  affiliates: AffiliateRow[];
  referrals: ReferralLedgerRow[];
  totals: {
    affiliates: number;
    referrals: number;
    converted: number;
    lockedCents: number;
    availableCents: number;
    paidCents: number;
    owedCents: number;
  };
}

export async function getAffiliateDesk(limit = 200): Promise<AffiliateDesk> {
  await ensureAdminSchema();

  const [referrers, commissions, referrals] = await Promise.all([
    prisma.user
      .findMany({
        where: { referralsMade: { some: {} } },
        select: {
          id: true,
          email: true,
          name: true,
          referralCode: true,
          blockedAt: true,
          referralsMade: { select: { status: true, createdAt: true } },
          payouts: { where: { status: { in: ["REQUESTED", "APPROVED"] } }, select: { id: true } },
        },
        take: limit,
      })
      .catch(() => []),
    prisma.commission
      .findMany({
        select: { referrerId: true, amountCents: true, status: true, convertedToCredits: true },
      })
      .catch(() => []),
    prisma.referral
      .findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          rejectReason: true,
          riskScore: true,
          riskFlags: true,
          ipCountry: true,
          planPurchased: true,
          firstPaymentCents: true,
          createdAt: true,
          convertedAt: true,
          referrer: { select: { id: true, email: true } },
          referred: { select: { id: true, email: true } },
          commission: { select: { amountCents: true, status: true } },
        },
      })
      .catch(() => []),
  ]);

  const byReferrer = new Map<string, { locked: number; available: number; paid: number; rejected: number; credits: number }>();
  for (const c of commissions) {
    const bucket = byReferrer.get(c.referrerId) ?? { locked: 0, available: 0, paid: 0, rejected: 0, credits: 0 };
    if (c.status === "LOCKED") bucket.locked += c.amountCents;
    else if (c.status === "AVAILABLE") bucket.available += c.amountCents;
    else if (c.status === "CASHED_OUT") {
      bucket.paid += c.amountCents;
      if (c.convertedToCredits) bucket.credits += c.amountCents;
    } else bucket.rejected += c.amountCents;
    byReferrer.set(c.referrerId, bucket);
  }

  const affiliates: AffiliateRow[] = referrers
    .map((u) => {
      const money = byReferrer.get(u.id) ?? { locked: 0, available: 0, paid: 0, rejected: 0, credits: 0 };
      const count = (status: string) => u.referralsMade.filter((r) => r.status === status).length;
      const last = u.referralsMade.reduce<Date | null>((acc, r) => (!acc || r.createdAt > acc ? r.createdAt : acc), null);
      return {
        userId: u.id,
        email: u.email,
        name: u.name,
        referralCode: u.referralCode,
        blocked: u.blockedAt !== null,
        referrals: u.referralsMade.length,
        pending: count("PENDING"),
        converted: count("CONVERTED"),
        rejected: count("REJECTED"),
        lockedCents: money.locked,
        availableCents: money.available,
        paidCents: money.paid,
        rejectedCents: money.rejected,
        convertedToCreditsCents: money.credits,
        payoutsOpen: u.payouts.length,
        lastReferralAt: last?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.lockedCents + b.availableCents + b.paidCents - (a.lockedCents + a.availableCents + a.paidCents));

  const totals = affiliates.reduce(
    (acc, row) => {
      acc.lockedCents += row.lockedCents;
      acc.availableCents += row.availableCents;
      acc.paidCents += row.paidCents;
      acc.referrals += row.referrals;
      acc.converted += row.converted;
      return acc;
    },
    { affiliates: affiliates.length, referrals: 0, converted: 0, lockedCents: 0, availableCents: 0, paidCents: 0, owedCents: 0 }
  );
  totals.owedCents = totals.lockedCents + totals.availableCents;

  return {
    affiliates,
    totals,
    referrals: referrals.map((r) => ({
      id: r.id,
      referrerEmail: r.referrer.email,
      referrerId: r.referrer.id,
      referredEmail: r.referred.email,
      referredId: r.referred.id,
      status: r.status,
      rejectReason: r.rejectReason,
      riskScore: r.riskScore,
      riskFlags: r.riskFlags,
      ipCountry: r.ipCountry,
      planPurchased: r.planPurchased,
      firstPaymentCents: r.firstPaymentCents,
      commissionCents: r.commission?.amountCents ?? null,
      commissionStatus: r.commission?.status ?? null,
      createdAt: r.createdAt.toISOString(),
      convertedAt: r.convertedAt?.toISOString() ?? null,
    })),
  };
}
