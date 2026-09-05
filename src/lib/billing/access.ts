// ============================================================================
// WHAT THIS ACCOUNT MAY PRESS — THE SAME ANSWER THE SERVER GIVES, EARLY
//
// `entitlements.ts` already decides every refusal, but it decides it at the
// moment of the press: the button looked live, the request went out, and the
// answer came back as an error. That is the wrong order for anything a plan does
// not include. A Free account could open the Article Writer's 23-stage research
// pipeline, fill in a brief, press Write and only then be told the mode is
// Agency's — and for the tabs that are wholly a paid feature, the entire screen
// was a promise the plan does not keep.
//
// So this file answers the same question one step earlier, for the browser: for
// every feature key, may this account use it, and if not, in one sentence, why.
// Three refusals, and they are not interchangeable — the fix for each is
// different, so the copy for each is different:
//
//   plan     the plan does not include it        → change plan
//   cap      the plan includes it, and the period's allowance is spent → wait
//   credits  included and uncapped, balance too low → top up, or wait
//
// It is deliberately NOT authorisation. Everything here is derived from the same
// tables `checkAction` reads, but the charge is still taken by `beginAction`
// behind the button, and a locked control that somehow gets pressed still meets
// the real gate. This is the honest label on the door, not the lock in it.
//
// PURE ON PURPOSE. No Prisma, no model SDK, no `fetch`. The snapshot is built on
// the server (where the admin's plan overrides have been applied) and handed to
// client components as data, so this module has to be safe to sit in a browser
// bundle. `getAccessSnapshot` in `entitlements.ts` is the one caller that reads
// the database, and it passes what it read in here.
// ============================================================================

import {
  ACTION_CATALOG,
  ACTION_KEYS,
  type ActionKey,
} from "./actions";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  UNLIMITED,
  formatCap,
  getEntitlements,
  getPlanConfig,
  isUnlimited,
  lowestPlanWith,
  planRank,
  type FeatureKey,
  type PlanTier,
} from "./plans";

/** Which of the three refusals this is. Named so the UI can choose its own CTA. */
export type AccessBlocker = "plan" | "cap" | "credits";

export interface FeatureAccess {
  feature: FeatureKey;
  /** From `FEATURE_LABELS`, so a lock and an upgrade prompt use one name. */
  label: string;
  allowed: boolean;
  blocker?: AccessBlocker;
  /** One sentence, written to be shown as-is. Never reworded by the caller. */
  reason?: string;
  /** The cheapest plan that lifts this. Absent when no plan would. */
  requiredPlan?: PlanTier;
  /**
   * That plan's display name and monthly price, resolved here.
   *
   * Sent rather than looked up in the browser: the catalogue in the client bundle
   * is the code default, and an admin's renamed or repriced plan is only ever
   * patched into the server's copy of the tables.
   */
  requiredPlanName?: string;
  requiredPlanPrice?: number;
  /** Per-period ceiling and what is gone, where this plan counts the feature. */
  cap?: number;
  used?: number;
  remaining?: number;
  /** What the cheapest thing on this feature costs, for the tooltip. */
  credits?: number;
}

export interface AccessSnapshot {
  plan: PlanTier;
  planName: string;
  isTrial: boolean;
  trialEndsAt: string | null;
  /** Spendable credits, so a control can say what it would cost against them. */
  balance: number;
  /** When the allowances reset. ISO, formatted by the caller. */
  periodEnd: string;
  features: Record<FeatureKey, FeatureAccess>;
}

/**
 * The dashboard tab each locked feature owns.
 *
 * One entry per tab whose whole purpose is a feature some plan does not include,
 * which is what lets the sidebar draw a lock and the page render a locked state
 * without either of them hard-coding a tier.
 *
 * The Content Studio is deliberately absent, and that is the important line in
 * this map. Free is sold on composing and scheduling posts by hand for all six
 * platforms, and the studio is where that is done — locking the tab would take
 * away the plan's main promise in order to lock the AI buttons inside it. Those
 * buttons carry their own locks instead. The Content Library, Integrations, Brand
 * DNA and Analytics tabs are absent for the same reason: each does something real
 * on Free, and what they gate is gated inside them.
 */
export const SURFACE_FEATURE: Record<string, FeatureKey> = {
  "/dashboard/chat": "chat.message",
  "/dashboard/goals": "goals.manage",
  "/dashboard/article-writer": "article.quick",
  "/dashboard/plugins": "plugins.connect",
};

/**
 * How far back analytics may be read without `analytics.advanced`, in days.
 *
 * Lives here rather than in `actions/analytics.ts` because a `"use server"` module
 * may only export async functions, and both sides of this boundary need the number:
 * the page clamps its read to it, and the client sizes its longest selectable
 * window from it.
 *
 * It is twice the 14-day window those plans can select, because the dashboard's
 * period-over-period figure compares a window against the one before it. Cut this
 * to 14 and every basic plan's comparison silently becomes "no prior data".
 */
export const BASIC_ANALYTICS_WINDOW_DAYS = 28;

/**
 * Every priced action that draws on a feature, cheapest first.
 *
 * `countsAgainst` matters here: `article.serp` is charged as its own action but
 * counts against `article.assist`, and a lock on the helper row has to know the
 * price of the cheapest thing that will actually be metered against it.
 */
const ACTIONS_BY_FEATURE: Partial<Record<FeatureKey, ActionKey[]>> = (() => {
  const out: Partial<Record<FeatureKey, ActionKey[]>> = {};
  for (const key of ACTION_KEYS) {
    const spec = ACTION_CATALOG[key];
    for (const feature of new Set([spec.feature, spec.countsAgainst ?? spec.feature])) {
      (out[feature] ??= []).push(key);
    }
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => ACTION_CATALOG[a].credits - ACTION_CATALOG[b].credits);
  }
  return out;
})();

/** The cheapest press on this feature, or null for the ones that cost nothing. */
export function cheapestCredits(feature: FeatureKey): number | null {
  const first = ACTIONS_BY_FEATURE[feature]?.[0];
  return first ? ACTION_CATALOG[first].credits : null;
}

function resetsOn(periodEnd: Date): string {
  try {
    return periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  } catch {
    return periodEnd.toISOString().slice(0, 10);
  }
}

export interface AccessInputs {
  plan: PlanTier;
  isTrial: boolean;
  trialEndsAt: Date | null;
  periodEnd: Date;
  /** Spendable credits: grant plus top-ups, less anything held. */
  balance: number;
  /** `getFeatureUsageMap`'s answer — only the features this plan caps appear. */
  usage: Record<string, { used: number; cap: number }>;
}

/**
 * One `FeatureAccess` per feature key, from tables already read.
 *
 * The order of the checks is the order of the fixes, cheapest first: a feature
 * the plan does not have cannot be unblocked by waiting or topping up, so that
 * verdict wins; a spent allowance cannot be unblocked by topping up either. Only
 * a feature that is included and within its count is ever refused for money.
 */
export function buildAccess(input: AccessInputs): AccessSnapshot {
  const ent = getEntitlements(input.plan);
  const planName = getPlanConfig(input.plan).name;
  const features = {} as Record<FeatureKey, FeatureAccess>;

  for (const feature of FEATURE_KEYS) {
    const label = FEATURE_LABELS[feature];
    const credits = cheapestCredits(feature) ?? undefined;
    const base: FeatureAccess = { feature, label, allowed: true, credits };

    // ── Not on the plan ────────────────────────────────────────────────────
    if (!ent.features.includes(feature)) {
      const required = lowestPlanWith(feature);
      // `lowestPlanWith` never returns undefined — it falls back to Agency — so a
      // plan at or below the current one means nothing sells this any more. Saying
      // "upgrade to Free" would be worse than saying nothing.
      const upgrade = planRank(required) > planRank(input.plan) ? required : undefined;
      const config = upgrade ? getPlanConfig(upgrade) : null;
      features[feature] = {
        ...base,
        allowed: false,
        blocker: "plan",
        requiredPlan: upgrade,
        requiredPlanName: config?.name,
        requiredPlanPrice: config?.priceMonthly,
        reason: config
          ? `${label} is not part of ${planName}. ${config.name} includes it, from $${config.priceMonthly} a month.`
          : `${label} is not part of ${planName}.`,
      };
      continue;
    }

    const cap = ent.caps[feature];
    const meter = input.usage[feature];
    const ceiling = cap === undefined ? UNLIMITED : cap;
    const used = meter?.used ?? 0;
    const counted = !isUnlimited(ceiling);
    const remaining = counted ? Math.max(0, ceiling - used) : undefined;

    // ── Included, but the period's allowance is spent ──────────────────────
    if (counted && used >= ceiling) {
      // The plan that would raise the count, not merely one that has the feature:
      // every plan above this one already has it, so `lowestPlanWith` would answer
      // with a plan the account is already past.
      const better = (["GO", "PRO", "AGENCY"] as PlanTier[]).find((tier) => {
        if (planRank(tier) <= planRank(input.plan)) return false;
        const next = getEntitlements(tier);
        if (!next.features.includes(feature)) return false;
        const nextCap = next.caps[feature];
        return nextCap === undefined || isUnlimited(nextCap) || nextCap > ceiling;
      });
      const config = better ? getPlanConfig(better) : null;
      const window = input.isTrial ? "in the trial" : "this billing period";
      const head = `${label}: ${ceiling} ${ceiling === 1 ? "use" : "uses"} ${window} on ${planName}, and you have used ${ceiling === 1 ? "it" : "them all"}.`;
      const nextCap = better ? getEntitlements(better).caps[feature] : undefined;
      const nextText =
        nextCap === undefined || isUnlimited(nextCap) ? "unlimited" : formatCap(nextCap);
      features[feature] = {
        ...base,
        allowed: false,
        blocker: "cap",
        cap: ceiling,
        used,
        remaining: 0,
        requiredPlan: better,
        requiredPlanName: config?.name,
        requiredPlanPrice: config?.priceMonthly,
        reason: config
          ? `${head} ${config.name} includes ${nextText}.`
          : `${head} Resets ${resetsOn(input.periodEnd)}.`,
      };
      continue;
    }

    // ── Included and within the count, but the balance will not cover it ───
    if (credits !== undefined && input.balance < credits) {
      features[feature] = {
        ...base,
        allowed: false,
        blocker: "credits",
        cap: counted ? ceiling : undefined,
        used: counted ? used : undefined,
        remaining,
        reason:
          `${label} starts at ${credits.toLocaleString()} credits and you have ` +
          `${input.balance.toLocaleString()}. ${
            ent.canBuyTopUps
              ? `Top up, or wait for ${resetsOn(input.periodEnd)}.`
              : `Your balance renews ${resetsOn(input.periodEnd)}.`
          }`,
      };
      continue;
    }

    features[feature] = {
      ...base,
      cap: counted ? ceiling : undefined,
      used: counted ? used : undefined,
      remaining,
    };
  }

  return {
    plan: input.plan,
    planName,
    isTrial: input.isTrial,
    trialEndsAt: input.trialEndsAt?.toISOString() ?? null,
    balance: input.balance,
    periodEnd: input.periodEnd.toISOString(),
    features,
  };
}

/**
 * Every feature allowed, with nothing claimed about why.
 *
 * Used where the snapshot could not be read — a timed-out layout, a client
 * component mounted outside the provider. It allows rather than refuses on
 * purpose, and the reasoning is the same as `unaskedModes()` in the Article
 * Writer: an unanswered question is not a verdict. A failed read that locked the
 * product would turn one slow query into a dead dashboard, whereas a failed read
 * that unlocks it costs at most one press arriving at the real gate a moment
 * later, which is where the charge is taken anyway.
 */
export function openAccess(plan: PlanTier = "FREE"): AccessSnapshot {
  const features = {} as Record<FeatureKey, FeatureAccess>;
  for (const feature of FEATURE_KEYS) {
    features[feature] = {
      feature,
      label: FEATURE_LABELS[feature],
      allowed: true,
      credits: cheapestCredits(feature) ?? undefined,
    };
  }
  return {
    plan,
    planName: getPlanConfig(plan).name,
    isTrial: false,
    trialEndsAt: null,
    balance: 0,
    periodEnd: new Date().toISOString(),
    features,
  };
}
