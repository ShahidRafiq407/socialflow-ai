"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck, Sparkles, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { RefreshConfigButton } from "@/components/dashboard/admin/RefreshConfigButton";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const ROUTE_TITLES: Record<string, string> = {
  "/adminshahid": "System Overview",
  "/adminshahid/users": "User Directory & Access",
  "/adminshahid/models": "AI Models & Engine Roles",
  "/adminshahid/plans": "Subscription Tiers & Features",
  "/adminshahid/keys": "API Keys & Integrations",
  "/adminshahid/settings": "Platform Flags & Maintenance",
  "/adminshahid/notifications": "System Broadcasts",
  "/adminshahid/affiliate": "Affiliate Desk & Payouts",
  "/adminshahid/feedback": "Assistant Feedback Queue",
  "/adminshahid/errors": "Error Center & Logs",
  "/adminshahid/audit": "Admin Audit Trail",
};

export function AdminHeader({
  onOpenMobileMenu,
  adminDetails,
}: {
  onOpenMobileMenu?: () => void;
  adminDetails?: { name: string; email: string } | null;
}) {
  const pathname = usePathname();

  // Longest match wins. Every route here starts with "/adminshahid", so taking
  // the first hit in insertion order let the root entry swallow every sub-page
  // and label all of them "System Overview".
  const currentTitle = React.useMemo(() => {
    let best = "System Overview";
    let bestLength = -1;
    for (const [route, title] of Object.entries(ROUTE_TITLES)) {
      const hit = pathname === route || pathname.startsWith(`${route}/`);
      if (hit && route.length > bestLength) {
        best = title;
        bestLength = route.length;
      }
    }
    return best;
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 h-16 w-full border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 font-sans">
      {/* Left: Mobile trigger & Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open Admin Menu"
          className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>Admin</span>
            <span>/</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
              {currentTitle}
            </span>
          </div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {currentTitle}
          </h1>
        </div>
      </div>

      {/* Right: Actions, Health, Theme, Avatar */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Live Health Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold tracking-wide">System Operational</span>
        </div>

        {/* Reload Config button */}
        <RefreshConfigButton />

        {/* Theme switch */}
        <ThemeToggle />

        {/* Quick jump to app */}
        <Link
          href="/dashboard"
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span>App</span>
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </Link>

        {/* User Button */}
        <div className="pl-1 border-l border-slate-200 dark:border-slate-800">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
