// ============================================================================
// /dashboard/admin — OVERVIEW
//
// The numbers the business runs on, for a chosen range: signups, plan mix,
// money in (net of Lemon Squeezy's fee), model cost out, what the affiliate
// program owes, and the margin left. The health strip at the top is the list
// of things that need a human today.
// ============================================================================

import { getAdminOverview, type StatsRange } from "@/lib/admin/stats";
import { AdminOverview } from "@/components/dashboard/admin/AdminOverview";

export const metadata = { title: "Overview — admin" };

const RANGES: StatsRange[] = ["7d", "30d", "90d", "12m", "all"];

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const params = (await searchParams) || {};
  const range = RANGES.includes(params.range as StatsRange) ? (params.range as StatsRange) : "30d";
  const overview = await getAdminOverview(range);
  return <AdminOverview data={overview} ranges={RANGES} />;
}
