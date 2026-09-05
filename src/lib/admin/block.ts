// ============================================================================
// ACCOUNT BLOCKS
//
// A suspended account keeps its data and its login; what it loses is the
// product. `getPlanContext` asks here first, so every metered action and every
// feature gate refuses a blocked user with the block's own message, and the
// dashboard layout swaps the app for a notice.
//
// The answer is cached per process for a short window so the check costs
// nothing on the hot path. A block applied in the back office is enforced on the
// next request that lands after the window on every instance.
// ============================================================================

import prisma from "@/lib/db";
import { ensureAdminSchema } from "./schema";

export interface AccountBlock {
  blockedAt: string;
  reason: string;
}

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; block: AccountBlock | null }>();

export async function getAccountBlock(userId: string): Promise<AccountBlock | null> {
  if (!userId) return null;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.block;

  let block: AccountBlock | null = null;
  try {
    await ensureAdminSchema();
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { blockedAt: true, blockedReason: true },
    });
    if (row?.blockedAt) {
      block = {
        blockedAt: row.blockedAt.toISOString(),
        reason: row.blockedReason || "Your account has been suspended. Contact support if you believe this is a mistake.",
      };
    }
  } catch {
    // A database that cannot be read does not invent a block.
    block = hit?.block ?? null;
  }

  cache.set(userId, { at: Date.now(), block });
  return block;
}

/** Called by the admin action so the instance that blocked sees it immediately. */
export function forgetAccountBlock(userId: string): void {
  cache.delete(userId);
}
