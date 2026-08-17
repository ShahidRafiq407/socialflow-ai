"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";

export function DashboardShell({
  children,
  workspaces = [],
  userDetails = null,
}: {
  children: React.ReactNode;
  workspaces?: { id: string; name: string }[];
  userDetails?: { name: string; email: string } | null;
}) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding";

  if (isOnboarding) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col md:pl-[250px] min-w-0">
        <Header workspaces={workspaces} userDetails={userDetails} />
        <main className="flex-1 p-3.5 sm:p-5 lg:p-6 bg-slate-50 dark:bg-slate-950 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
