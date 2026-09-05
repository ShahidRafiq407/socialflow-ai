// ============================================================================
// /dashboard/admin/affiliate — AFFILIATE DESK
//
// Three tabs: the payout queue (money by hand), the affiliates table (who has
// earned what and where it stands), and the referral ledger with its fraud
// signals. The payout desk is the same component the old /admin/payouts page
// rendered; that URL now redirects here.
// ============================================================================

import { listPayoutsForAdmin } from "@/lib/affiliate/payouts";
import { getAffiliateDesk } from "@/lib/admin/affiliate";
import { ensureRuntimeConfig, getAffiliateTerms } from "@/lib/admin/runtimeConfig";
import { AffiliateDeskView } from "@/components/dashboard/admin/AffiliateDeskView";

export const metadata = { title: "Affiliate — admin" };

export default async function AdminAffiliatePage() {
  await ensureRuntimeConfig();
  const [payouts, desk] = await Promise.all([listPayoutsForAdmin().catch(() => []), getAffiliateDesk()]);
  return <AffiliateDeskView payouts={payouts} desk={desk} terms={getAffiliateTerms()} />;
}
