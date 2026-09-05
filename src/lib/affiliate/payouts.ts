// ============================================================================
// AFFILIATE — PAYOUTS AND CREDIT CONVERSION
//
// Two ways an earned commission leaves the system:
//
//   Cash  — the user files a request against saved account details. Money
//           never moves in code: an admin sees the request, transfers through
//           JazzCash / Easypaisa / PayPal by hand, and records the result.
//           Rejecting a request hands the commissions straight back.
//
//   Credits — converted into the same CreditWallet a top-up lands in, at the
//           billing system's own rate (1 credit = $0.01), through the same
//           idempotent ledger write. A commission converted twice is impossible
//           by construction: the idempotency key is the commission's id.
//
// The account detail is encrypted at rest and only decrypted on the admin
// screen. Everywhere else — the user's own history included — the masked form
// is shown.
// ============================================================================

import prisma from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { addTopUpCredits } from "@/lib/billing/wallet";
import { AFFILIATE, centsToCredits } from "@/lib/affiliate/config";
import { liveAffiliateTerms } from "@/lib/affiliate/terms";

export type PayoutMethodValue = "JAZZCASH" | "EASYPAISA" | "PAYPAL";

export const PAYOUT_METHODS: PayoutMethodValue[] = ["JAZZCASH", "EASYPAISA", "PAYPAL"];

export interface PayoutValidation {
  ok: boolean;
  error?: string;
  masked?: string;
}

/** Pakistani mobile-account numbers: 03XXXXXXXXX. */
const PK_MOBILE = /^03\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validatePayoutAccount(
  method: PayoutMethodValue,
  accountName: string,
  accountDetail: string
): PayoutValidation {
  const name = accountName.trim();
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Account holder name must be 2–80 characters." };
  }

  const detail = accountDetail.trim();
  if (method === "PAYPAL") {
    if (!EMAIL.test(detail) || detail.length > 200) {
      return { ok: false, error: "Enter the PayPal email address the payment should go to." };
    }
    return { ok: true, masked: maskEmail(detail) };
  }

  if (!PK_MOBILE.test(detail)) {
    return {
      ok: false,
      error: `Enter the ${method === "JAZZCASH" ? "JazzCash" : "Easypaisa"} mobile number as 03XXXXXXXXX.`,
    };
  }
  return { ok: true, masked: `${detail.slice(0, 3)}•••••${detail.slice(-2)}` };
}

function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  return `${local.charAt(0)}•••${email.slice(at)}`;
}

/**
 * Files a cash withdrawal for the full available balance.
 *
 * Full-balance only, on purpose: a partial request would have to split a
 * commission row, and a split commission is a thing no audit trail wants. The
 * form says plainly that the whole available balance is what gets paid.
 */
export async function requestPayout(args: {
  userId: string;
  method: PayoutMethodValue;
  accountName: string;
  accountDetail: string;
}): Promise<{ ok: true; payoutId: string } | { ok: false; error: string }> {
  const check = validatePayoutAccount(args.method, args.accountName, args.accountDetail);
  if (!check.ok) return { ok: false, error: check.error! };

  const encrypted = encryptSecret(args.accountDetail.trim());
  if (!encrypted) {
    return {
      ok: false,
      error: "Payout details cannot be stored securely right now. Please contact support.",
    };
  }

  const terms = await liveAffiliateTerms();

  try {
    return await prisma.$transaction(async (tx) => {
      const open = await tx.payout.findFirst({
        where: { userId: args.userId, status: { in: ["REQUESTED", "APPROVED"] } },
        select: { id: true },
      });
      if (open) {
        return { ok: false, error: "You already have a payout being processed." };
      }

      // Available commissions, claimed in the same transaction that spends them.
      const available = await tx.commission.findMany({
        where: { referrerId: args.userId, status: "AVAILABLE" },
        orderBy: { unlocksAt: "asc" },
        select: { id: true, amountCents: true },
      });

      const availableCents = available.reduce((sum, c) => sum + c.amountCents, 0);
      if (availableCents < terms.minPayoutCents) {
        return {
          ok: false,
          error: `You need at least ${(terms.minPayoutCents / 100).toFixed(0)} available to request a payout.`,
        };
      }

      const payout = await tx.payout.create({
        data: {
          userId: args.userId,
          amountCents: availableCents,
          method: args.method,
          accountName: args.accountName.trim(),
          accountDetail: encrypted,
          accountMasked: check.masked!,
        },
        select: { id: true },
      });

      // The claim re-checks the status, so two requests racing each other
      // cannot both spend the same commission: the loser claims fewer rows
      // than it read, the transaction unwinds, and the user reads a clean
      // sentence instead of a paid-out discrepancy.
      const claimed = await tx.commission.updateMany({
        where: { id: { in: available.map((c) => c.id) }, referrerId: args.userId, status: "AVAILABLE" },
        data: { status: "CASHED_OUT", payoutId: payout.id },
      });
      if (claimed.count !== available.length) {
        throw new Error("PAYOUT_BALANCE_CHANGED");
      }

      return { ok: true, payoutId: payout.id };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "PAYOUT_BALANCE_CHANGED") {
      return { ok: false, error: "Your balance changed while requesting. Please try again." };
    }
    console.error("[affiliate] payout request failed:", err);
    return { ok: false, error: "The payout could not be filed. Please try again." };
  }
}

/**
 * Turns every available commission into wallet credits through the billing
 * system's own top-up path. Per-commission idempotency keys make a retry after
 * a partial failure safe: what already landed stays landed, the rest run again.
 */
export async function convertAvailableToCredits(
  userId: string
): Promise<{ ok: true; credits: number } | { ok: false; error: string }> {
  const available = await prisma.commission.findMany({
    where: { referrerId: userId, status: "AVAILABLE" },
    orderBy: { unlocksAt: "asc" },
    select: { id: true, amountCents: true },
  });

  const totalCents = available.reduce((sum, c) => sum + c.amountCents, 0);
  if (totalCents < AFFILIATE.minCreditConversionCents) {
    return {
      ok: false,
      error: `You need at least $${(AFFILIATE.minCreditConversionCents / 100).toFixed(0)} available to convert.`,
    };
  }

  let credited = 0;
  for (const commission of available) {
    const credits = centsToCredits(commission.amountCents);
    const result = await addTopUpCredits({
      userId,
      credits,
      idempotencyKey: `affiliate-credit:${commission.id}`,
      note: "Affiliate earnings converted to credits",
    });
    if (!result.ok) {
      // Stop here. What has been credited so far is safe; the rest stay
      // AVAILABLE and the button can be pressed again.
      if (credited === 0) {
        return { ok: false, error: "The credit wallet could not be updated. Please try again." };
      }
      break;
    }

    await prisma.commission.update({
      where: { id: commission.id },
      data: { status: "CASHED_OUT", convertedToCredits: true },
    });
    credited += credits;
  }

  return { ok: true, credits: credited };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin operations — money by hand, decisions on the record
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminPayoutView {
  id: string;
  amountCents: number;
  method: PayoutMethodValue;
  accountName: string;
  /** Decrypted here, on the admin screen, and nowhere else. */
  accountDetail: string;
  accountMasked: string;
  status: "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";
  reference: string | null;
  adminNote: string | null;
  createdAt: string;
  paidAt: string | null;
  userEmail: string;
  userName: string | null;
  commissionCount: number;
}

export async function listPayoutsForAdmin(): Promise<AdminPayoutView[]> {
  const { decryptSecret } = await import("@/lib/crypto");
  const rows = await prisma.payout.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    select: {
      id: true,
      amountCents: true,
      method: true,
      accountName: true,
      accountDetail: true,
      accountMasked: true,
      status: true,
      reference: true,
      adminNote: true,
      createdAt: true,
      paidAt: true,
      user: { select: { email: true, name: true } },
      _count: { select: { commissions: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    amountCents: row.amountCents,
    method: row.method,
    accountName: row.accountName,
    accountDetail: decryptSecret(row.accountDetail),
    accountMasked: row.accountMasked,
    status: row.status,
    reference: row.reference,
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    userEmail: row.user.email,
    userName: row.user.name,
    commissionCount: row._count.commissions,
  }));
}

/**
 * Acknowledge a request. The transfer still happens by hand; this only marks
 * who has seen it, so two admins do not both pay the same person.
 */
export async function approvePayout(payoutId: string, adminId: string): Promise<boolean> {
  const result = await prisma.payout.updateMany({
    where: { id: payoutId, status: "REQUESTED" },
    data: { status: "APPROVED", reviewedBy: adminId, reviewedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * The transfer was completed in the provider's app. The reference is the admin's
 * own transaction id, kept so a customer query months later is answerable.
 */
export async function markPayoutPaid(
  payoutId: string,
  adminId: string,
  reference?: string
): Promise<boolean> {
  const result = await prisma.payout.updateMany({
    where: { id: payoutId, status: { in: ["REQUESTED", "APPROVED"] } },
    data: {
      status: "PAID",
      paidAt: new Date(),
      reviewedBy: adminId,
      reviewedAt: new Date(),
      ...(reference?.trim() ? { reference: reference.trim().slice(0, 200) } : {}),
    },
  });
  return result.count > 0;
}

/**
 * Refused. The commissions it held go straight back to AVAILABLE — a rejection
 * must never cost the affiliate the money they earned, only delay it.
 */
export async function rejectPayout(
  payoutId: string,
  adminId: string,
  note?: string
): Promise<boolean> {
  const done = await prisma.$transaction(async (tx) => {
    const result = await tx.payout.updateMany({
      where: { id: payoutId, status: { in: ["REQUESTED", "APPROVED"] } },
      data: {
        status: "REJECTED",
        adminNote: note?.trim()?.slice(0, 500) || null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });
    if (result.count === 0) return false;

    await tx.commission.updateMany({
      where: { payoutId, status: "CASHED_OUT", convertedToCredits: false },
      data: { status: "AVAILABLE", payoutId: null },
    });
    return true;
  });
  return done;
}
