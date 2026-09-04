// ============================================================================
// AFFILIATE ADMIN — SERVER ACTIONS
//
// Who may pay out affiliates is an env allowlist, not a database column: the
// answer belongs to whoever controls the deployment, exactly like the
// system-notice composer. With the allowlist unset, nobody is an admin and the
// page shows nothing — inert, not open.
//
//   AFFILIATE_ADMINS="user_2abc…,ops@example.com"
//
// Clerk user ids and email addresses both work.
// ============================================================================

"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  approvePayout,
  markPayoutPaid,
  rejectPayout,
} from "@/lib/affiliate/payouts";

function allowlist(): string[] {
  return (process.env.AFFILIATE_ADMINS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAffiliateAdmin(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const allowed = allowlist();
  if (allowed.length === 0) return false;
  if (allowed.includes(userId.toLowerCase())) return true;

  const user = await currentUser().catch(() => null);
  return (user?.emailAddresses || []).some((entry) => {
    const email = (entry?.emailAddress || "").toLowerCase();
    return Boolean(email) && allowed.includes(email);
  });
}

export async function approvePayoutAction(payoutId: string): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId || !(await isAffiliateAdmin())) return { ok: false };

  const ok = await approvePayout(payoutId, userId);
  if (ok) revalidatePath("/dashboard/admin/payouts");
  return { ok };
}

export async function markPayoutPaidAction(
  payoutId: string,
  reference?: string
): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId || !(await isAffiliateAdmin())) return { ok: false };

  const ok = await markPayoutPaid(payoutId, userId, reference);
  if (ok) {
    revalidatePath("/dashboard/admin/payouts");
    revalidatePath("/dashboard/affiliate");
  }
  return { ok };
}

export async function rejectPayoutAction(
  payoutId: string,
  note?: string
): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId || !(await isAffiliateAdmin())) return { ok: false };

  const ok = await rejectPayout(payoutId, userId, note);
  if (ok) {
    revalidatePath("/dashboard/admin/payouts");
    revalidatePath("/dashboard/affiliate");
  }
  return { ok };
}
