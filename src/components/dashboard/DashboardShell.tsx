"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Ban, Wrench } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { ActiveWorkspaceProvider } from "@/components/dashboard/ActiveWorkspaceProvider";
import { dispatchDueScheduledPosts } from "@/actions/publish";

export function DashboardShell({
  children,
  workspaces = [],
  activeWorkspaceId = null,
  userDetails = null,
  isAdmin = false,
  accountBlock = null,
  maintenanceMessage = null,
}: {
  children: React.ReactNode;
  workspaces?: { id: string; name: string }[];
  activeWorkspaceId?: string | null;
  userDetails?: { name: string; email: string } | null;
  /** Shows the Admin entry in the sidebar; the pages check again server-side. */
  isAdmin?: boolean;
  /** Set while the account is suspended: a banner replaces silent refusals. */
  accountBlock?: { blockedAt: string; reason: string } | null;
  /** The admin's maintenance banner, when the flag is on. */
  maintenanceMessage?: string | null;
}) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding";

  // Due-post dispatcher: keeps SCHEDULED posts publishing at their exact time
  // even though the Vercel cron only sweeps once a day. Fire-and-forget —
  // atomic SCHEDULED→PUBLISHING claims prevent double publishing.
  useEffect(() => {
    if (isOnboarding) return;
    const dispatch = () => {
      dispatchDueScheduledPosts().catch(() => {});
    };
    dispatch();
    const onFocus = () => dispatch();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(dispatch, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [isOnboarding]);

  if (isOnboarding) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    );
  }

  return (
    <ActiveWorkspaceProvider activeWorkspaceId={activeWorkspaceId}>
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
        <Sidebar isAdmin={isAdmin} />
        <div className="flex-1 flex flex-col md:pl-[250px] min-w-0">
          <Header
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            userDetails={userDetails}
            isAdmin={isAdmin}
          />
          {accountBlock && (
            <div className="flex items-start gap-2 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-800 dark:text-rose-200 md:px-6">
              <Ban className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">Your account is suspended.</span> {accountBlock.reason}
              </div>
            </div>
          )}
          {maintenanceMessage && !accountBlock && (
            <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200 md:px-6">
              <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{maintenanceMessage}</div>
            </div>
          )}
          {/*
            The key is the fix for "the tabs below still show the old
            workspace". Page bodies are client components that seed state with
            `useState(initialData)`, which ignores every prop it is handed
            afterwards — so a switch refreshed the layout and changed nothing
            below it. Changing the key remounts this whole subtree, and a
            remount re-runs every initialiser against the new workspace's data.
          */}
          <main
            key={activeWorkspaceId || "no-workspace"}
            className="flex-1 p-3.5 sm:p-5 lg:p-6 bg-slate-50 dark:bg-slate-950 overflow-x-hidden"
          >
            {children}
          </main>
        </div>
      </div>
    </ActiveWorkspaceProvider>
  );
}
