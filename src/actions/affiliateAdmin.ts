// ============================================================================
// AFFILIATE ADMIN — SERVER ACTIONS
//
// Who may pay out affiliates is whoever may open the back office: the
// ADMIN_USERS / AFFILIATE_ADMINS env allowlists or an ADMIN role granted from
// the dashboard (see lib/admin/auth.ts). With neither set, nobody is an admin
// and the desk shows nothing — inert, not open.
// ============================================================================

"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/admin/auth";
import {
  approvePayout,
  markPayoutPaid,
  rejectPayout,
} from "@/lib/affiliate/payouts";

export async function isAffiliateAdmin(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  return isAdminUser(userId);
}


export async function approvePayoutAction(payoutId: string): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId || !(await isAffiliateAdmin())) return { ok: false };

  const ok = await approvePayout(payoutId, userId);
  if (ok) revalidatePath("/adminshahid/affiliate");
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
    revalidatePath("/adminshahid/affiliate");
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
    revalidatePath("/adminshahid/affiliate");
    revalidatePath("/dashboard/affiliate");
  }
  return { ok };
}
