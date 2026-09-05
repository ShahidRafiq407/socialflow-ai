"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Users,
  Cpu,
  Layers,
  KeyRound,
  Settings2,
  Bell,
  Gift,
  MessageSquareWarning,
  Bug,
  ScrollText,
  ArrowLeft,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { PostloomLogo } from "@/components/marketing/logo";

export interface AdminNavBadges {
  errors: number;
  feedback: number;
  payouts: number;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: keyof AdminNavBadges;
  badgeTone?: "rose" | "amber" | "indigo";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "MANAGEMENT",
    items: [
      { name: "Overview", href: "/adminshahid", icon: Activity },
      { name: "Users & Accounts", href: "/adminshahid/users", icon: Users },
    ],
  },
  {
    label: "AI & ENGINE",
    items: [
      { name: "AI Models & Roles", href: "/adminshahid/models", icon: Cpu },
      { name: "Plans & Pricing", href: "/adminshahid/plans", icon: Layers },
      { name: "API Keys & Secrets", href: "/adminshahid/keys", icon: KeyRound },
      { name: "Platform Settings", href: "/adminshahid/settings", icon: Settings2 },
    ],
  },
  {
    label: "COMMUNICATION & DESK",
    items: [
      { name: "Broadcast / Notify", href: "/adminshahid/notifications", icon: Bell },
      { name: "Affiliate Desk", href: "/adminshahid/affiliate", icon: Gift, badgeKey: "payouts", badgeTone: "indigo" },
    ],
  },
  {
    label: "OBSERVABILITY",
    items: [
      { name: "Feedback Queue", href: "/adminshahid/feedback", icon: MessageSquareWarning, badgeKey: "feedback", badgeTone: "amber" },
      { name: "Error Center", href: "/adminshahid/errors", icon: Bug, badgeKey: "errors", badgeTone: "rose" },
      { name: "Audit Trail", href: "/adminshahid/audit", icon: ScrollText },
    ],
  },
];

export function AdminSidebar({
  badges,
  adminDetails,
  onNavigate,
}: {
  badges: AdminNavBadges;
  adminDetails?: { name: string; email: string } | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const isCurrent = (href: string) => {
    if (href === "/adminshahid") {
      return pathname === "/adminshahid";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="w-[260px] h-full flex flex-col bg-slate-900 text-slate-200 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40">
        <Link
          href="/adminshahid"
          onClick={onNavigate}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
        >
          <PostloomLogo size={30} />
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-sm text-white tracking-tight">Postloom</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase text-emerald-400 border border-emerald-500/30">
                ADMIN
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">CONTROL PLANE</span>
          </div>
        </Link>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto custom-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isCurrent(item.href);
                const count = item.badgeKey ? badges[item.badgeKey] : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30 shadow-xs"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon
                        className={`h-4 w-4 transition-colors ${
                          active
                            ? "text-emerald-400"
                            : "text-slate-400 group-hover:text-slate-300"
                        }`}
                      />
                      <span>{item.name}</span>
                    </div>

                    {count > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                          item.badgeTone === "rose"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : item.badgeTone === "amber"
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                        }`}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Area: Return to Main App & Profile */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 space-y-2">
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 hover:text-white border border-slate-700/60 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-slate-400" />
          <span>Back to Postloom App</span>
        </Link>

        {adminDetails && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-900/60 border border-slate-800/60">
            <div className="h-7 w-7 rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-200 truncate">
                {adminDetails.name}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {adminDetails.email}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
