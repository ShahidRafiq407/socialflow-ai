// ============================================================================
// CONFIG REVISION — HOW A USER'S TAB FINDS OUT THE ADMIN CHANGED SOMETHING
//
// The runtime-config cache refreshes itself within 10 seconds on every server
// instance, so the *server* is never more than a TTL behind the back office. The
// browser is the part that used to be stale forever: the chat catalogue is
// fetched once when a workspace mounts, and a tab left open all afternoon kept
// showing the model list from when it loaded.
//
// This module gives that tab something cheap to ask. The revision is derived,
// not stored: it is the newest `updatedAt` across the two tables the back office
// writes, plus their row counts so a deletion also moves it. Nothing has to
// remember to bump a counter — an admin write moves the revision because Prisma
// already stamps `updatedAt`, and a write that somehow did not change any row
// correctly leaves it alone.
//
// Cost: two aggregates, memoised for a few seconds, behind an authenticated
// route. A tab polling every 20 seconds is a rounding error next to one page
// render, and the poll stops entirely while the tab is hidden.
// ============================================================================

import prisma from "@/lib/db";

/** How long one computed revision is reused, to collapse a burst of pollers. */
const MEMO_MS = 3_000;

let memo: { value: string; at: number } | null = null;

function stamp(date: Date | null | undefined): number {
  return date instanceof Date ? date.getTime() : 0;
}

/**
 * An opaque token that changes whenever admin-controlled configuration changes.
 * Never throws: a database that cannot be read returns the last known value, or
 * `"0"`, both of which mean "no change" rather than a reload storm.
 */
export async function configRevision(): Promise<string> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;

  try {
    const [settings, models] = await Promise.all([
      prisma.appSetting.aggregate({ _max: { updatedAt: true }, _count: { key: true } }),
      prisma.aiModel.aggregate({ _max: { updatedAt: true }, _count: { id: true } }),
    ]);

    const value = [
      stamp(settings._max.updatedAt),
      settings._count.key,
      stamp(models._max.updatedAt),
      models._count.id,
    ].join(".");

    memo = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.warn(
      "[configRevision] could not read:",
      err instanceof Error ? err.message : err,
    );
    return memo?.value ?? "0";
  }
}

/** Drops the memo so the next read is live. Called after an admin write. */
export function forgetConfigRevision(): void {
  memo = null;
}
