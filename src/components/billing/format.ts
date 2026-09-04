// ============================================================================
// BILLING TAB — DISPLAY FORMATTING
//
// Only formatting. No prices, no caps, no plan rules: those arrive already
// resolved from the server, and a helper here that "worked out" a number would be
// a second opinion about money.
// ============================================================================

const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, DATE);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString(undefined, DATE)}, ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Whole days from now until `iso`, floored at zero. Used for trial countdowns. */
export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.ceil(ms / 86_400_000));
}

export function fmtCredits(n: number): string {
  return Math.round(n).toLocaleString();
}

/** Amounts arrive in major units already, so this only decides the symbol. */
export function fmtMoney(amount: number | undefined, currency = "USD"): string {
  if (amount === undefined || amount === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Lemon Squeezy event names, said the way a customer would say them.
 *
 * Unknown names fall back to the raw string with the underscores taken out rather
 * than to "Unknown event" — a receipt line the customer cannot identify is worse
 * than one phrased slightly mechanically.
 */
const EVENT_LABELS: Record<string, string> = {
  order_created: "Payment received",
  order_refunded: "Refunded",
  subscription_created: "Subscription started",
  subscription_updated: "Subscription updated",
  subscription_plan_changed: "Plan changed",
  subscription_cancelled: "Cancellation scheduled",
  subscription_resumed: "Subscription resumed",
  subscription_paused: "Subscription paused",
  subscription_unpaused: "Subscription unpaused",
  subscription_expired: "Subscription ended",
  subscription_payment_success: "Renewal paid",
  subscription_payment_failed: "Payment failed",
  subscription_payment_recovered: "Payment recovered",
  subscription_payment_refunded: "Renewal refunded",
  license_key_created: "Licence issued",
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Statement lines. The wording says where the credits came from or went. */
const LEDGER_LABELS: Record<string, string> = {
  GRANT: "Monthly credits",
  TOPUP: "Credit pack",
  DEBIT: "Used",
  REFUND: "Returned",
  ADJUSTMENT: "Adjustment",
  EXPIRY: "Expired at period end",
};

export function ledgerLabel(kind: string): string {
  return LEDGER_LABELS[kind] ?? kind;
}

/** True for the kinds that add credits, so the sign and the colour agree. */
export function isCredit(kind: string): boolean {
  return kind === "GRANT" || kind === "TOPUP" || kind === "REFUND";
}
