// ============================================================================
// /dashboard/admin/payouts — SERVER PAGE
//
// The back office of the affiliate program. Not in the sidebar and not linked
// anywhere public: an operator opens it by URL, and only someone on the
// AFFILIATE_ADMINS allowlist gets past this page. Everyone else is told the
// plain truth — this page is not for them — rather than a fake 404.
//
// The page shows every payout request with the decrypted account details,
// because paying by hand requires reading them. The money moves in the
// provider's own app (JazzCash / Easypaisa / PayPal); what happens here is the
// record of who saw it, who paid it, and under which reference.
// ============================================================================

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isAffiliateAdmin } from "@/actions/affiliateAdmin";
import { listPayoutsForAdmin } from "@/lib/affiliate/payouts";
import { AdminPayouts } from "@/components/dashboard/affiliate/AdminPayouts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Affiliate payouts — admin",
};

export default async function AdminPayoutsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  if (!(await isAffiliateAdmin())) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-2 pb-20 text-center font-sans">
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This page manages affiliate payouts and is restricted to operators. If you believe you should have access,
          ask the deployment owner to add you to the AFFILIATE_ADMINS allowlist.
        </p>
      </div>
    );
  }

  const payouts = await listPayoutsForAdmin();

  return (
    <div className="mx-auto w-full max-w-6xl pb-20 font-sans">
      <AdminPayouts initial={payouts} />
    </div>
  );
}
