"use client";

// ============================================================================
// USERS TABLE
//
// The list is a table because that is what an operator scans. Filters submit
// as a GET form so the URL is the state; the row opens the account.
// ============================================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserListResult, UserSort } from "@/lib/admin/users";
import { PLAN_TIERS } from "@/lib/billing/plans";
import { Empty, PlanPill, fmtAgo, fmtDay, fmtInt } from "./primitives";

interface Query {
  q: string;
  plan: string;
  status: string;
  sort: UserSort;
}

const SORT_LABEL: Record<UserSort, string> = {
  newest: "Newest",
  oldest: "Oldest",
  lastSeen: "Last seen",
  spend: "Lifetime spend",
  balance: "Balance",
};

function selectClass() {
  return "h-8 rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30";
}

export function UsersTable({ result, query }: { result: UserListResult; query: Query }) {
  const router = useRouter();
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const href = (patch: Partial<Query & { page: number }>) => {
    const params = new URLSearchParams();
    const merged = { ...query, page: result.page, ...patch };
    if (merged.q) params.set("q", merged.q);
    if (merged.plan !== "ALL") params.set("plan", merged.plan);
    if (merged.status !== "ALL") params.set("status", merged.status);
    if (merged.sort !== "newest") params.set("sort", merged.sort);
    if (merged.page > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    return `/adminshahid/users${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-3">
      <form method="get" action="/adminshahid/users" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input name="q" defaultValue={query.q} placeholder="Email, name, user id or referral code" className="h-8 pl-8 text-xs" />
        </div>
        <select name="plan" defaultValue={query.plan} className={selectClass()} onChange={(e) => router.push(href({ plan: e.target.value, page: 1 }))}>
          <option value="ALL">Any plan</option>
          {PLAN_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status} className={selectClass()} onChange={(e) => router.push(href({ status: e.target.value, page: 1 }))}>
          <option value="ALL">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="BLOCKED">Blocked</option>
          <option value="ADMIN">Admins</option>
        </select>
        <select name="sort" defaultValue={query.sort} className={selectClass()} onChange={(e) => router.push(href({ sort: e.target.value as UserSort, page: 1 }))}>
          {(Object.keys(SORT_LABEL) as UserSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{fmtInt(result.total)} accounts</span>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium text-right">Balance</th>
              <th className="px-3 py-2 font-medium text-right">Spent</th>
              <th className="px-3 py-2 font-medium text-right">Workspaces</th>
              <th className="px-3 py-2 font-medium">Referred by</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <Empty>No accounts match.</Empty>
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  onClick={() => router.push(`/adminshahid/users/${row.id}`)}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <Link href={`/adminshahid/users/${row.id}`} className="block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {row.email}
                        </Link>
                        <div className="truncate text-[11px] text-muted-foreground">{row.name || row.id}</div>
                      </div>
                      {row.role === "ADMIN" && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Admin" />}
                      {row.blockedAt && <Ban className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="Blocked" />}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <PlanPill plan={row.plan} />
                    {row.subscriptionStatus !== "ACTIVE" && row.subscriptionStatus !== "NONE" && (
                      <span className="ml-1 text-[10px] text-muted-foreground">{row.subscriptionStatus.toLowerCase()}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(row.balance)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(row.lifetimeSpent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.workspaces}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">{row.referredBy || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDay(row.createdAt)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtAgo(row.lastSeenAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          Page {result.page} of {pages}
          <Link
            href={href({ page: Math.max(1, result.page - 1) })}
            aria-disabled={result.page <= 1}
            className={buttonVariants({ variant: "outline", size: "icon-sm", className: result.page <= 1 ? "pointer-events-none opacity-50" : "" })}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={href({ page: Math.min(pages, result.page + 1) })}
            aria-disabled={result.page >= pages}
            className={buttonVariants({ variant: "outline", size: "icon-sm", className: result.page >= pages ? "pointer-events-none opacity-50" : "" })}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
