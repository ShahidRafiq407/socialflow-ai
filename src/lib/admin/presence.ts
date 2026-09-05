// ============================================================================
// PRESENCE — "LAST SEEN"
//
// The dashboard layout stamps User.lastSeenAt at most once an hour per user
// per instance, so "active users" in the back office means something without
// a write on every navigation. Never throws: presence is not worth an error.
// ============================================================================

import prisma from "@/lib/db";
import { ensureAdminSchema } from "./schema";

const STAMP_EVERY_MS = 60 * 60 * 1000;
const lastStamped = new Map<string, number>();

export function touchLastSeen(userId: string): void {
  if (!userId) return;
  const now = Date.now();
  const previous = lastStamped.get(userId) ?? 0;
  if (now - previous < STAMP_EVERY_MS) return;
  lastStamped.set(userId, now);
  void ensureAdminSchema()
    .then(() => prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt: new Date(now) } }))
    .catch(() => lastStamped.delete(userId));
}
