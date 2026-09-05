// ============================================================================
// /dashboard/admin — LAYOUT
//
// The one door into the back office. Every page under it is rendered only when
// `isAdminUser()` says yes; everyone else gets told plainly that this is not
// for them rather than a fake 404, matching the old payouts page. The
// sub-navigation lives here so the pages themselves are just content.
// ============================================================================

import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin/auth";
import { countOpenErrors } from "@/lib/admin/errors";
import { ensureAdminSchema } from "@/lib/admin/schema";
import prisma from "@/lib/db";
import { AdminNav } from "@/components/dashboard/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  if (!(await isAdminUser(userId))) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-2 pb-20 text-center font-sans">
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This area manages the product and is restricted to operators. If you believe you should have access, ask
          the deployment owner to add you to the ADMIN_USERS allowlist or grant your account the admin role.
        </p>
      </div>
    );
  }

  // Bootstrap first: on a fresh database the counts below read tables this
  // creates, and a parallel first read would otherwise miss them once.
  await ensureAdminSchema();
  const [openErrors, newFeedback, openPayouts] = await Promise.all([
    countOpenErrors(),
    prisma.chatFeedback.count({ where: { status: null } }).catch(() => 0),
    prisma.payout.count({ where: { status: { in: ["REQUESTED", "APPROVED"] } } }).catch(() => 0),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl pb-20 font-sans">
      <AdminNav badges={{ errors: openErrors, feedback: newFeedback, payouts: openPayouts }} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
