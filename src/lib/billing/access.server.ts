/**
 * THE SNAPSHOT, READ ONCE PER REQUEST
 *
 * The layout needs it for the sidebar's locks, and four pages need it to decide
 * whether to render themselves at all. Without deduplication that is two rounds of
 * the same three queries on every navigation, so this wraps the read in React's
 * request cache: the layout's call and the page's call inside the same render are
 * one read, and an API route that imports `getAccessSnapshot` directly is
 * untouched.
 *
 * Separate from `entitlements.ts` because `cache()` belongs to the React server
 * runtime and `entitlements.ts` is imported by webhook handlers and cron routes
 * that have no render context.
 */

import { cache } from "react";
import { getAccessSnapshotSafe } from "./entitlements";
import type { AccessSnapshot, FeatureAccess } from "./access";
import { FEATURE_LABELS, type FeatureKey } from "./plans";

/** The whole snapshot for this user, once per request. */
export const accessSnapshot = cache(
  async (userId: string): Promise<AccessSnapshot> => getAccessSnapshotSafe(userId)
);

/**
 * One feature's verdict, for a server page deciding what to render.
 *
 * Called before the page's own queries on purpose: a locked tab should not spend a
 * round of reads assembling data it is about to refuse to show.
 */
export async function surfaceAccess(
  userId: string,
  feature: FeatureKey
): Promise<FeatureAccess> {
  const snapshot = await accessSnapshot(userId);
  return (
    snapshot.features[feature] ?? {
      feature,
      label: FEATURE_LABELS[feature],
      allowed: true,
    }
  );
}
