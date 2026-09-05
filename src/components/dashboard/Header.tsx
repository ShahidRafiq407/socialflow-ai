"use client";

// ============================================================================
// DASHBOARD HEADER
//
// Composition only. Everything that used to be faked inline here now lives in a
// component that talks to the database:
//
//   WorkspaceSwitcher  — switching actually switches (cookie + revalidate)
//   GlobalSearch       — real results from the active workspace, real ⌘K/Ctrl+K
//   NotificationsBell  — real events, and a dot that can turn off
//
// Search and notifications are reachable on mobile now; before they were behind
// `hidden md:flex`, so a phone had a header with no search and no alerts at all.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { CreditCard, LifeBuoy, Menu, Settings, ShieldCheck, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { sidebarLinks } from "@/components/dashboard/Sidebar";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { NotificationsBell } from "@/components/dashboard/NotificationsBell";
import type { WorkspaceSummary } from "@/actions/workspaces";

interface HeaderProps {
  workspaces?: WorkspaceSummary[];
  activeWorkspaceId?: string | null;
  userDetails?: { name: string; email: string } | null;
  isAdmin?: boolean;
}

export function Header({
  workspaces = [],
  activeWorkspaceId = null,
  userDetails = null,
  isAdmin = false,
}: HeaderProps) {
  const pathname = usePathname();

  function isCurrent(href: string): boolean {
    return href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-4 md:px-6 backdrop-blur-md font-sans">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        {/* The sidebar is hidden below md, so this is the only navigation there. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Open navigation"
            className="md:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
          >
            <Menu className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-[80vh] overflow-y-auto">
            {sidebarLinks.map((item) => (
              <DropdownMenuItem key={item.href} className="p-0">
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className={`w-full flex items-center gap-3 px-2 py-2 text-sm font-medium ${
                    isCurrent(item.href)
                      ? "text-primary font-semibold"
                      : "text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <item.icon
                    className={`h-4 w-4 ${
                      isCurrent(item.href) ? "text-primary" : "text-slate-500 dark:text-slate-400"
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
        <GlobalSearch activeWorkspaceId={activeWorkspaceId} />
        <NotificationsBell activeWorkspaceId={activeWorkspaceId} />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Profile and settings"
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 h-8 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none"
          >
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="hidden lg:inline max-w-[120px] truncate">
              {userDetails?.name || "Profile"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">
                <div className="font-semibold truncate">{userDetails?.name || "User"}</div>
                <div className="text-[11px] font-normal text-slate-500 truncate">
                  {userDetails?.email || ""}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs p-0">
                <Link href="/dashboard/settings" className="w-full flex items-center px-1.5 py-2">
                  <Settings className="h-3.5 w-3.5 mr-2 text-slate-400" />
                  Workspace &amp; profile settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs p-0">
                <Link href="/dashboard/billing" className="w-full flex items-center px-1.5 py-2">
                  <CreditCard className="h-3.5 w-3.5 mr-2 text-slate-400" />
                  Billing &amp; usage
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs p-0">
                <Link href="/contact" className="w-full flex items-center px-1.5 py-2">
                  <LifeBuoy className="h-3.5 w-3.5 mr-2 text-slate-400" />
                  Help &amp; support
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs p-0">
                    <Link
                      href="/adminshahid"
                      className="w-full flex items-center px-1.5 py-2 text-emerald-600 dark:text-emerald-400 font-medium hover:text-emerald-700 dark:hover:text-emerald-300"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-2 text-emerald-600 dark:text-emerald-400" />
                      Admin Console
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <div className="px-2 py-1 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Account</span>
                <UserButton />
              </div>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
