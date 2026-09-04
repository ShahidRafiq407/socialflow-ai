// ============================================================================
// AFFILIATE — SERVER ACTIONS
//
// The write side of the Affiliate tab: file a payout request, turn available
// earnings into wallet credits, and re-read the tab's data after either. Reads
// live in the page; these are only the buttons.
// ============================================================================

"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requestPayout, convertAvailableToCredits, type PayoutMethodValue } from "@/lib/affiliate/payouts";
import { getAffiliateOverview } from "@/lib/affiliate/overview";

const payoutSchema = z.object({
  method: z.enum(["JAZZCASH", "EASYPAISA", "PAYPAL"]),
  accountName: z.string().trim().min(2).max(80),
  accountDetail: z.string().trim().min(3).max(200),
});

export async function requestPayoutAction(input: {
  method: string;
  accountName: string;
  accountDetail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please sign in again." };

  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid payout details." };
  }

  const result = await requestPayout({
    userId,
    method: parsed.data.method as PayoutMethodValue,
    accountName: parsed.data.accountName,
    accountDetail: parsed.data.accountDetail,
  });

  if (result.ok) revalidatePath("/dashboard/affiliate");
  return result;
}

export async function convertToCreditsAction(): Promise<
  { ok: true; credits: number } | { ok: false; error: string }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please sign in again." };

  const result = await convertAvailableToCredits(userId);
  if (result.ok) {
    revalidatePath("/dashboard/affiliate");
    revalidatePath("/dashboard/billing");
  }
  return result;
}

export async function getAffiliateOverviewAction() {
  const { userId } = await auth();
  if (!userId) return null;
  return getAffiliateOverview(userId);
}
