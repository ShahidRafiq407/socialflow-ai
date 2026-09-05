"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Bot,
  FileText,
  Target,
  Dna,
  BarChart3,
  Newspaper,
  Share2,
  Blocks,
  CreditCard,
  Gift,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { PostloomLogo } from "@/components/marketing/logo";

export const sidebarLinks = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Content Studio", href: "/dashboard/ai-studio", icon: Sparkles },
  { name: "Automate Task", href: "/dashboard/chat", icon: Bot },
  { name: "Content Library", href: "/dashboard/content", icon: FileText },
  { name: "Lead Goal", href: "/dashboard/goals", icon: Target },
  { name: "Brand DNA", href: "/dashboard/brand", icon: Dna },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Article Writer", href: "/dashboard/article-writer", icon: Newspaper },
  { name: "Integrations", href: "/dashboard/integrations", icon: Share2 },
  { name: "Plugin", href: "/dashboard/plugins", icon: Blocks },
  { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { name: "Affiliate", href: "/dashboard/affiliate", icon: Gift },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

/**
 * The links a user may actually follow, honouring the admin's feature flags.
 *
 * Every navigation surface goes through this — the sidebar, the mobile menu in
 * the header and the ⌘K palette — so switching the affiliate programme off in
 * the back office cannot leave one of them still advertising a page that answers
 * "this feature is disabled".
 */
export function visibleSidebarLinks(affiliateEnabled = true) {
  return sidebarLinks.filter(
    (link) => link.href !== "/dashboard/affiliate" || affiliateEnabled
  );
}

export function Sidebar({
  isAdmin = false,
  affiliateEnabled = true,
}: {
  isAdmin?: boolean;
  affiliateEnabled?: boolean;
}) {
  const pathname = usePathname();
  const links = React.useMemo(() => visibleSidebarLinks(affiliateEnabled), [affiliateEnabled]);
  // Pending navigation is derived from (href, clickedFrom) so it clears
  // automatically when the route changes — no effect needed.
  const [pendingNav, setPendingNav] = useState<{ href: string; from: string } | null>(
    null
  );

  return (
    <aside className="w-[250px] fixed inset-y-0 left-0 z-50 hidden md:flex flex-col border-r bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 select-none">
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 px-6">
        <PostloomLogo size={34} />
        <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-slate-100">
          Postloom<span className="text-[#18713C] dark:text-[#3DB36B]">AI</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {links.map((item) => {
          const isActive =
            pendingNav?.href === item.href ||
            (pendingNav === null &&
              (item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(item.href + "/")));

          const isPending =
            pendingNav?.href === item.href && pendingNav?.from === pathname;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={() => {
                if (pathname !== item.href) {
                  setPendingNav({ href: item.href, from: pathname });
                }
              }}
              className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive
                      ? "text-primary"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                />
                <span>{item.name}</span>
              </div>
              {isPending && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <span>PostloomAI v1.0</span>
        <span className="h-2 w-2 rounded-full bg-emerald-500" title="System Online" />
      </div>
    </aside>
  );
}
