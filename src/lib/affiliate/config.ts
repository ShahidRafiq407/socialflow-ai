// ============================================================================
// AFFILIATE PROGRAM — TERMS OF THE DEAL
//
// One place decides what a referral is worth, how long it is held, and what it
// costs to withdraw. Every number the affiliate page quotes to the user comes
// from here, so the page and the payout logic can never disagree.
//
// The commission rule: the larger of a flat $10 or 20% of the referred user's
// first payment. The flat floor is what the affiliate was promised on the
// screen ("you earn at least $10"); the percentage is what makes a $180 agency
// plan worth referring instead of a $12 one.
// ============================================================================

export const AFFILIATE = {
  /** Cookie that carries ?ref=CODE from first visit to signup. */
  cookieName: "pl_ref",
  /** Days the referral cookie survives. */
  cookieDays: 30,

  /** Days a commission stays LOCKED after conversion (refund window). */
  lockDays: 30,

  /** Flat commission floor, USD cents. */
  flatCommissionCents: 1_000,
  /** Share of the first payment, as an alternative to the flat floor. */
  commissionPercent: 20,

  /** Minimum cash withdrawal, USD cents. */
  minPayoutCents: 5_000,
  /** Minimum balance before it can be turned into platform credits. */
  minCreditConversionCents: 1_000,

  /**
   * Signups from one IP attributed to the same referrer before further ones are
   * treated as farmed. A genuine promoter can convince a few colleagues on an
   * office network; a farm cannot convince a fifth.
   */
  maxSignupsPerIp: 4,

  /** Risk score at which attribution is refused outright. */
  blockScore: 60,
  /** Risk score at which the referral is granted but written down for review. */
  flagScore: 30,
} as const;

/** Credits per USD — the billing system's own unit: 1 credit = $0.01. */
export const CREDITS_PER_DOLLAR = 100;

/** What a first payment earns the affiliate, in USD cents. */
export function commissionFor(firstPaymentCents: number): number {
  const safe = Number.isFinite(firstPaymentCents) && firstPaymentCents > 0 ? firstPaymentCents : 0;
  const share = Math.ceil((safe * AFFILIATE.commissionPercent) / 100);
  return Math.max(AFFILIATE.flatCommissionCents, share);
}

/** USD cents → platform credits. 1 cent is exactly 1 credit, by design. */
export function centsToCredits(cents: number): number {
  return Math.max(0, Math.floor(cents));
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
