// ============================================================================
// /dashboard/admin/users — USER LIST
//
// Search, filter, sort, page. The filters are URL state so a view can be
// shared or bookmarked ("everyone blocked", "Pro accounts by spend").
// ============================================================================

import { listUsers, type UserSort } from "@/lib/admin/users";
import { PLAN_TIERS, type PlanTier } from "@/lib/billing/plans";
import { UsersTable } from "@/components/dashboard/admin/UsersTable";

export const metadata = { title: "Users — admin" };

const SORTS: UserSort[] = ["newest", "oldest", "lastSeen", "spend", "balance"];
const STATUSES = ["ALL", "ACTIVE", "BLOCKED", "ADMIN"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) || {};
  const plan = (PLAN_TIERS as readonly string[]).includes(params.plan || "") ? (params.plan as PlanTier) : "ALL";
  const status = (STATUSES as readonly string[]).includes(params.status || "") ? (params.status as (typeof STATUSES)[number]) : "ALL";
  const sort = SORTS.includes(params.sort as UserSort) ? (params.sort as UserSort) : "newest";
  const page = Math.max(1, Number(params.page) || 1);

  const result = await listUsers({ q: params.q, plan, status, sort, page, pageSize: 25 });

  return <UsersTable result={result} query={{ q: params.q || "", plan, status, sort }} />;
}
