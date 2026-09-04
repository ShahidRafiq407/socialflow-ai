"use client";

// ============================================================================
// ADMIN NAV
//
// The back office's own tab strip. Counts on Errors, Feedback and Payouts are
// the queues that need a human; the rest are configuration and reference.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Bug,
  Cpu,
  Gift,
  KeyRound,
  Layers,
  MessageSquareWarning,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { RefreshConfigButton } from "./RefreshConfigButton";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: keyof AdminNavBadges;
}

export interface AdminNavBadges {
  errors: number;
  feedback: number;
  payouts: number;
}

const ITEMS: NavItem[] = [
  { href: "/dashboard/admin", label: "Overview", icon: Activity },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/models", label: "Models", icon: Cpu },
  { href: "/dashboard/admin/plans", label: "Plans", icon: Layers },
  { href: "/dashboard/admin/keys", label: "API keys", icon: KeyRound },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings2 },
  { href: "/dashboard/admin/notifications", label: "Notify", icon: Bell },
  { href: "/dashboard/admin/affiliate", label: "Affiliate", icon: Gift, badge: "payouts" },
  { href: "/dashboard/admin/feedback", label: "Feedback", icon: MessageSquareWarning, badge: "feedback" },
  { href: "/dashboard/admin/errors", label: "Errors", icon: Bug, badge: "errors" },
  { href: "/dashboard/admin/audit", label: "Audit", icon: ScrollText },
];

export function AdminNav({ badges }: { badges: AdminNavBadges }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Back office</h1>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            admin
          </span>
        </div>
        <RefreshConfigButton />
      </div>

      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
              {count > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 text-[10px] font-semibold ${
                    item.badge === "errors" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
