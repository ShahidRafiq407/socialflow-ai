// ============================================================================
// ACCOUNT PURGE — THE ONE ORDERING EVERY DELETE USES
//
// The Prisma schema has no onDelete: Cascade on most workspace relations, so a
// plain `workspace.delete` fails with a foreign-key error. Deletes therefore
// remove the children in FK-safe order inside one transaction. Both the user's
// own Settings → Danger Zone and the admin's "delete account" run through here,
// so the two can never disagree about what "everything" means.
// ============================================================================

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { removeFromScheduleQueue } from "@/lib/redis";

/**
 * Deletes every row that belongs to a workspace, in FK-safe order, then the
 * workspace itself.
 */
export async function purgeWorkspaceRows(tx: Prisma.TransactionClient, workspaceIds: string[]) {
  if (workspaceIds.length === 0) return;
  const where = { workspaceId: { in: workspaceIds } };

  await tx.contentPost.deleteMany({ where });
  await tx.automationRule.deleteMany({ where });
  await tx.post.deleteMany({ where });
  await tx.socialAccount.deleteMany({ where });
  await tx.competitor.deleteMany({ where });
  await tx.brandDNA.deleteMany({ where });
  await tx.chatSettings.deleteMany({ where });
  await tx.growthGoal.deleteMany({ where });
  await tx.memory.deleteMany({ where });
  await tx.mediaAsset.deleteMany({ where });
  await tx.hashtagGroup.deleteMany({ where });
  await tx.wordPressSite.deleteMany({ where });
  await tx.userConnection.deleteMany({ where });
  await tx.mcpServerConnection.deleteMany({ where });
  await tx.leadEvent.deleteMany({ where });
  await tx.publishLog.deleteMany({ where });
  // LinkClick + Message first so the delete never depends on DB-level cascades.
  await tx.linkClick.deleteMany({ where });
  await tx.message.deleteMany({ where: { chatSession: { workspaceId: { in: workspaceIds } } } });
  await tx.chatSession.deleteMany({ where });
  await tx.trackedLink.deleteMany({ where });
  // SEO loop: optimisation runs hang off publications, and both hold a required
  // workspace FK with no cascade.
  await tx.optimizationRun.deleteMany({ where });
  await tx.performanceData.deleteMany({ where });
  await tx.publishResult.deleteMany({ where });
  // Article pipeline: the run holds a required workspace FK (no cascade), while
  // its stages, sources and claims cascade on runId.
  await tx.articleRun.deleteMany({ where });
  await tx.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
}

/**
 * Interactive transactions default to a 5s timeout — far too little for ~25
 * sequential deletes over a remote database on a populated account. The purge
 * is all-or-nothing, so a generous ceiling beats a mid-way abort that rolls
 * everything back and makes the user retry.
 */
export const PURGE_TRANSACTION_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

/** Best-effort: drop this workspace's scheduled posts from the Redis queue. */
export async function clearScheduleQueueFor(workspaceId: string) {
  try {
    const scheduled = await prisma.post.findMany({
      where: { workspaceId, status: "SCHEDULED" },
      select: { id: true },
    });
    await Promise.all(scheduled.map((p) => removeFromScheduleQueue(p.id)));
  } catch {
    // Queue entries for missing posts are already skipped by the publish cron.
  }
}

/**
 * Erases a user and everything they own. Idempotent: a user row already gone
 * is the success case for a retry. Account-level rows (subscription, wallet,
 * ledger, referrals, notifications) cascade from the User row itself.
 */
export async function purgeUserData(userId: string): Promise<void> {
  const workspaces = await prisma.workspace.findMany({ where: { userId }, select: { id: true } });
  const workspaceIds = workspaces.map((w) => w.id);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) return;
    await purgeWorkspaceRows(tx, workspaceIds);
    await tx.user.delete({ where: { id: userId } });
  }, PURGE_TRANSACTION_OPTIONS);

  for (const id of workspaceIds) {
    await clearScheduleQueueFor(id);
  }
}
