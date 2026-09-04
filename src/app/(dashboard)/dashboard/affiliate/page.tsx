// ============================================================================
// /dashboard/affiliate — SERVER PAGE
//
// One read assembles the whole tab (see lib/affiliate/overview): the code, the
// counts, the money by state, the referred accounts, the payout history. The
// page renders that answer directly — this tab's numbers move on webhook and
// cron time, not on every visit, so a server render with revalidation after
// each action is the honest presentation.
// ============================================================================

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAffiliateOverview } from "@/lib/affiliate/overview";
import { AffiliateShell } from "@/components/dashboard/affiliate/AffiliateShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Affiliate program",
  description: "Your referral link, your earnings, and your payouts.",
};

export default async function AffiliatePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Opening the tab also allocates the referral code on first visit and
  // unlocks commissions whose refund window has passed.
  const overview = await getAffiliateOverview(userId);

  return (
    <div className="mx-auto w-full max-w-6xl pb-20 font-sans">
      <AffiliateShell initial={overview} />
    </div>
  );
}
