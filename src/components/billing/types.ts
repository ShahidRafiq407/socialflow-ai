// ============================================================================
// BILLING TAB — THE SHAPE OF ONE STATUS READ
//
// A mirror of what `GET /api/billing/status` returns. It is written out by hand
// rather than inferred so that a change to the route which the page has not caught
// up with fails the typecheck instead of rendering `undefined` next to a price.
//
// Nothing here is a source of truth. Every price, cap and label was resolved on
// the server from `lib/billing/*`; the page's job is to display it, never to
// recompute it. That is why there are no numbers in this file.
// ============================================================================

import type { PlanConfig, PlanTier, TopUpPack } from "@/lib/billing/plans";

export interface BillingPlanState {
  id: PlanTier;
  name: string;
  /** What the row says, before the period check. Differs from `id` when stale. */
  storedPlan: PlanTier;
  status: string;
  cycle: "monthly" | "yearly" | null;
  isTrial: boolean;
  /** A paid plan whose renewal never arrived, so entitlements have dropped to Free. */
  stale: boolean;
  testMode: boolean;
  periodStart: string;
  periodEnd: string;
  trialEndsAt: string | null;
  endsAt: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
}

export interface BillingCredits {
  balance: number;
  available: number;
  grantBalance: number;
  topUpBalance: number;
  held: number;
  monthlyGrant: number;
  percentUsed: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  periodStart: string;
  periodEnd: string;
}

/** One capped feature this period. `capLabel` already reads "Unlimited" when it is. */
export interface BillingUsageRow {
  used: number;
  cap: number;
  capLabel: string;
}

export interface BillingStorage {
  usedMb: number;
  limitMb: number;
  usedLabel: string;
  limitLabel: string;
}

export interface BillingWorkspaces {
  used: number;
  limit: number;
  limitLabel: string;
}

export interface BillingPaymentMethod {
  id: string;
  label: string;
  detail: string;
}

export interface BillingPayment {
  method: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  portalUrl: string | null;
  updatePaymentMethodUrl: string | null;
  /** What the checkout can offer — availability is decided per buyer, not by us. */
  methods: readonly BillingPaymentMethod[];
  feeNote: string;
}

export interface BillingCatalogPlan extends PlanConfig {
  yearlySaving: number;
  purchasable: boolean;
  current: boolean;
}

export interface BillingActionRow {
  key: string;
  label: string;
  credits: number;
  usd: number;
  description: string;
  feature: string;
}

export interface BillingActionGroup {
  title: string;
  blurb: string;
  actions: BillingActionRow[];
}

export interface BillingCatalog {
  plans: BillingCatalogPlan[];
  topUps: TopUpPack[];
  actions: BillingActionGroup[];
}

/**
 * What the store will accept at this moment, as opposed to what the catalogue
 * describes. The two differ on a deployment whose variant ids are not set yet, and
 * a button that cannot work should say so rather than fail on click.
 */
export interface BillingStore {
  configured: boolean;
  testMode: boolean;
  /** True when at least one cycle can be bought. Use `cycles` to pick which. */
  plansPurchasable: boolean;
  /**
   * Per cycle, because monthly and yearly are separate products in the store. The
   * billing toggle reads this so it can never offer a cycle that has nothing behind
   * it — a launch usually has monthly set up days before yearly.
   */
  cycles: { monthly: boolean; yearly: boolean };
  trialPurchasable: boolean;
  trialUsed: boolean;
  topUpsPurchasable: boolean;
  missingConfig: string[];
}

export interface BillingHistoryRow {
  id: string;
  type: string;
  createdAt: string;
  plan?: PlanTier;
  planName?: string;
  billingCycle?: "monthly" | "yearly";
  /** Major units, e.g. 19 for $19.00. */
  amount?: number;
  currency?: string;
  status?: string;
  receiptUrl?: string;
  message?: string;
  testMode?: boolean;
}

export interface BillingLedgerRow {
  id: string;
  kind: "GRANT" | "TOPUP" | "DEBIT" | "REFUND" | "ADJUSTMENT" | "EXPIRY";
  /** Signed: debits are negative, so the statement adds up down the column. */
  credits: number;
  balanceAfter: number;
  action: string | null;
  note: string | null;
  costMicros: number | null;
  createdAt: string;
}

export interface BillingStatus {
  ok: true;
  plan: BillingPlanState;
  credits: BillingCredits;
  /** Keyed by `FeatureKey`. Only the features this plan caps by count appear. */
  usage: Record<string, BillingUsageRow>;
  storage: BillingStorage;
  workspaces: BillingWorkspaces;
  payment: BillingPayment;
  catalog: BillingCatalog;
  store: BillingStore;
  history: BillingHistoryRow[];
  ledger: BillingLedgerRow[];
}

/** The one-line message the shell shows after an action. */
export interface BillingToast {
  id: string;
  tone: "success" | "error" | "info";
  text: string;
}

export type BillingCycle = "monthly" | "yearly";
