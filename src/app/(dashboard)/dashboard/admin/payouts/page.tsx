// ============================================================================
// /dashboard/admin/payouts — MOVED
//
// The payout desk is now a tab of the affiliate desk in the back office. This
// route stays so old bookmarks keep working.
// ============================================================================

import { redirect } from "next/navigation";

export default function AdminPayoutsPage() {
  redirect("/dashboard/admin/affiliate");
}
