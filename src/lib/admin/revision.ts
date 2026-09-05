// ============================================================================
// CONFIG REVISION — HOW A USER'S TAB FINDS OUT SOMETHING CHANGED
//
// The runtime-config cache refreshes itself within 10 seconds on every server
// instance, so the *server* is never more than a TTL behind the back office. The
// browser is the part that used to be stale forever: the chat catalogue is
// fetched once when a workspace mounts, and a tab left open all afternoon kept
// showing the model list from when it loaded.
//
// This module gives that tab something cheap to ask. There are two halves,
// because there are two kinds of change an open tab has to notice:
//
//   The deployment's configuration — models, plans, flags, keys. One token for
//   everybody, derived from the two tables the back office writes.
//
//   This one account — its plan, its suspension, its credit balance. A token per
//   user, because an admin granting credits or suspending an account changes
//   nothing in `AppSetting` or `AiModel`, so the global half cannot see it and a
//   suspended user's tab went on working until they happened to navigate.
//
// Both are derived, not stored: the newest `updatedAt` across the relevant rows,
// plus row counts on the global side so a deletion also moves it. Nothing has to
// remember to bump a counter — an admin write moves the revision because Prisma
// already stamps `updatedAt`, and a write that somehow did not change any row
// correctly leaves it alone.
//
// Cost: two aggregates plus three lookups by unique key, each memoised for a few
// seconds, behind an authenticated route. A tab polling every 20 seconds is a
// rounding error next to one page render, and the poll stops while it is hidden.
// ============================================================================

import prisma from "@/lib/db";

/** How long one computed revision is reused, to collapse a burst of pollers. */
const MEMO_MS = 3_000;

/**
 * Ceiling on the per-user memo. One entry per recently-active account is small,
 * but a map that only ever grows is a leak on a long-lived instance, so the
 * oldest half is dropped when it fills.
 */
const ACCOUNT_MEMO_MAX = 500;

let memo: { value: string; at: number } | null = null;
const accountMemo = new Map<string, { value: string; at: number }>();

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

/**
 * A token that changes when anything about *this* account changes.
 *
 * Three reads, in parallel and each tolerant of its own failure:
 *
 *   The user row — name, role, and the `blockedAt`/`blockedReason` pair behind
 *   suspension.
 *
 *   The subscription — plan, status, period dates.
 *
 *   The newest notification addressed to this account. Deliberately `_max(createdAt)`
 *   and not `updatedAt`: marking the inbox read writes `readAt`, so a `createdAt`
 *   ceiling moves only when somebody *sends* something, which is always the product
 *   or an admin and never the user. This is what carries a credit adjustment — the
 *   action writes a `UserNotification`, and the bell only refetched on focus or on
 *   open, so a tab sitting in the foreground never lit up.
 *
 * The credit wallet itself is deliberately absent even though an adjustment writes
 * it. Every metered action writes it too, so a tab would see the token move after
 * each of its own chat messages and refresh the entire shell on a 20-second loop for
 * the rest of the session. The notification is the signal; the balance is re-read by
 * the refresh that signal triggers.
 *
 * A read that fails contributes `0` rather than failing the token, so a database
 * missing the subscription table still propagates suspensions.
 */
export async function accountRevision(userId: string): Promise<string> {
  if (!userId) return "0";
  const hit = accountMemo.get(userId);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;

  const [user, subscription, inbox] = await Promise.all([
    prisma.user
      .findUnique({ where: { id: userId }, select: { updatedAt: true } })
      .catch(() => null),
    prisma.subscription
      .findUnique({ where: { userId }, select: { updatedAt: true } })
      .catch(() => null),
    prisma.userNotification
      .aggregate({ where: { userId }, _max: { createdAt: true }, _count: { id: true } })
      .catch(() => null),
  ]);

  const value = [
    stamp(user?.updatedAt),
    stamp(subscription?.updatedAt),
    stamp(inbox?._max.createdAt),
    inbox?._count.id ?? 0,
  ].join(".");

  if (accountMemo.size >= ACCOUNT_MEMO_MAX) {
    for (const key of Array.from(accountMemo.keys()).slice(0, Math.floor(ACCOUNT_MEMO_MAX / 2))) {
      accountMemo.delete(key);
    }
  }
  accountMemo.set(userId, { value, at: Date.now() });
  return value;
}

/**
 * The whole answer for one tab: what the deployment is configured to do, and what
 * this account is allowed to do. Joined rather than returned as two fields so the
 * client keeps comparing one opaque string.
 */
export async function revisionFor(userId: string): Promise<string> {
  const [config, account] = await Promise.all([configRevision(), accountRevision(userId)]);
  return `${config}~${account}`;
}

/** Drops the memo so the next read is live. Called after an admin write. */
export function forgetConfigRevision(): void {
  memo = null;
}

/**
 * Drops one account's memo, so the instance that just changed that account
 * reports it on the next poll instead of up to `MEMO_MS` later. Called with no
 * argument after a write that could touch anybody.
 */
export function forgetAccountRevision(userId?: string): void {
  if (userId) accountMemo.delete(userId);
  else accountMemo.clear();
}
