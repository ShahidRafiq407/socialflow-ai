// ============================================================================
// /adminshahid — DEDICATED STANDALONE ADMIN LAYOUT
//
// Completely independent of the user DashboardShell.
// Strict server-side security gate via `isAdminUser()`.
// ============================================================================

import type { ReactNode } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { isAdminUser } from "@/lib/admin/auth";
import { countOpenErrors } from "@/lib/admin/errors";
import { ensureAdminSchema } from "@/lib/admin/schema";
import prisma from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminShahidLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/adminshahid");

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100 font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-2xl space-y-4">
          <div className="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Restricted Area</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            This administration control plane is restricted to authorized operators. Your account does not currently hold admin privileges for this deployment.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Postloom App
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Schema bootstrap and queue counters
  await ensureAdminSchema();

  const [user, openErrors, newFeedback, openPayouts] = await Promise.all([
    currentUser().catch(() => null),
    countOpenErrors().catch(() => 0),
    prisma.chatFeedback.count({ where: { status: null } }).catch(() => 0),
    prisma.payout.count({ where: { status: { in: ["REQUESTED", "APPROVED"] } } }).catch(() => 0),
  ]);

  const adminDetails = user
    ? {
        name: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "Admin",
        email: user.emailAddresses?.[0]?.emailAddress || "",
      }
    : null;

  return (
    <AdminShell
      badges={{
        errors: openErrors,
        feedback: newFeedback,
        payouts: openPayouts,
      }}
      adminDetails={adminDetails}
    >
      {children}
    </AdminShell>
  );
}
