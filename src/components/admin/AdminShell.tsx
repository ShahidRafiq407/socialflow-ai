"use client";

import React, { useState } from "react";
import { AdminSidebar, type AdminNavBadges } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { X } from "lucide-react";

export function AdminShell({
  children,
  badges,
  adminDetails,
}: {
  children: React.ReactNode;
  badges: AdminNavBadges;
  adminDetails?: { name: string; email: string } | null;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex font-sans">
      {/* Desktop Sidebar (fixed) */}
      <div className="hidden lg:block w-[260px] shrink-0 fixed inset-y-0 left-0 z-50">
        <AdminSidebar badges={badges} adminDetails={adminDetails} />
      </div>

      {/* Mobile Drawer (backdrop + slide-in) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Sidebar drawer */}
          <div className="relative z-10 w-[270px] max-w-[85vw] h-full flex flex-col shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-3 z-20 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <AdminSidebar
              badges={badges}
              adminDetails={adminDetails}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-[260px] min-w-0 min-h-screen">
        <AdminHeader
          adminDetails={adminDetails}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
