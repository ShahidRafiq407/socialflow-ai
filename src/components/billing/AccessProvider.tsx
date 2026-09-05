"use client";

/**
 * THE PLAN, AVAILABLE TO ANY CONTROL THAT NEEDS IT
 *
 * The dashboard layout reads the snapshot once per navigation and puts it here, so
 * a button five components deep can ask "may this account press me, and if not,
 * what do I say" without a fetch, a loading state, or a second opinion.
 *
 * One snapshot per render tree, and it is read-only. Nothing in the browser
 * recomputes a verdict: the server built these sentences with the admin's plan
 * overrides applied, and a client that adjusted them would be quoting prices that
 * are not on sale.
 *
 * `useFeature` never returns undefined. A control mounted outside the provider —
 * a modal in a portal, a page that has not been wired yet — gets an allowed
 * verdict with no reason attached, which is the same choice `unaskedModes()` makes
 * in the Article Writer and for the same reason: an unanswered question is not a
 * refusal, and the charge is taken at the gate behind the button either way.
 */

import { createContext, useContext, useMemo } from "react";
import { openAccess, type AccessSnapshot, type FeatureAccess } from "@/lib/billing/access";
import type { FeatureKey } from "@/lib/billing/plans";

const AccessContext = createContext<AccessSnapshot | null>(null);

/** Computed once at import: the fallback must not be a new object every render. */
const OPEN = openAccess();

export function AccessProvider({
  snapshot,
  children,
}: {
  snapshot: AccessSnapshot | null;
  children: React.ReactNode;
}) {
  // The layout passes a plain object across the server/client boundary, so it is a
  // fresh reference on every navigation. Memoising on the plan and balance keeps
  // consumers from re-rendering when nothing about entitlement actually moved.
  const value = useMemo(
    () => snapshot,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot?.plan, snapshot?.balance, snapshot?.periodEnd, snapshot]
  );
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

/** The whole snapshot, for the few places that need the plan name or the balance. */
export function useAccess(): AccessSnapshot {
  return useContext(AccessContext) ?? OPEN;
}

/** One feature's verdict. Allowed, with nothing claimed, when there is no snapshot. */
export function useFeature(feature: FeatureKey): FeatureAccess {
  const snapshot = useContext(AccessContext);
  return (
    snapshot?.features[feature] ??
    OPEN.features[feature] ?? {
      feature,
      label: feature,
      allowed: true,
    }
  );
}

/**
 * True when every feature listed is usable.
 *
 * For controls that need two things at once — the carousel button needs both
 * `aistudio.generate` and `media.carousel` — so the caller does not have to decide
 * which of two refusals to show. The first blocked one is returned as the reason,
 * because the cheapest fix is the one to name.
 */
export function useFeatures(features: FeatureKey[]): FeatureAccess {
  const snapshot = useContext(AccessContext);
  const source = snapshot ?? OPEN;
  for (const feature of features) {
    const entry = source.features[feature];
    if (entry && !entry.allowed) return entry;
  }
  const first = features[0];
  return (
    source.features[first] ?? { feature: first, label: first, allowed: true }
  );
}
