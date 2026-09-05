// ============================================================================
// /adminshahid/affiliate — AFFILIATE DESK
// ============================================================================

import { listPayoutsForAdmin } from "@/lib/affiliate/payouts";
import { getAffiliateDesk } from "@/lib/admin/affiliate";
import { ensureRuntimeConfig, getAffiliateTerms } from "@/lib/admin/runtimeConfig";
import { AffiliateDeskView } from "@/components/dashboard/admin/AffiliateDeskView";

export const metadata = { title: "Affiliate Desk — Admin Control Plane" };

export default async function AdminAffiliatePage() {
  await ensureRuntimeConfig();
  const [payouts, desk] = await Promise.all([listPayoutsForAdmin().catch(() => []), getAffiliateDesk()]);
  return <AffiliateDeskView payouts={payouts} desk={desk} terms={getAffiliateTerms()} />;
}
