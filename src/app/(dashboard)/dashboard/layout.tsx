import React from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getWorkspaceContext } from "@/lib/workspace/active";
import { isAdminUser } from "@/lib/admin/auth";
import { getAccountBlock } from "@/lib/admin/block";
import { ensureRuntimeConfig, getFlags } from "@/lib/admin/runtimeConfig";
import { touchLastSeen } from "@/lib/admin/presence";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  let userDetails = null;
  let workspaces: { id: string; name: string }[] = [];
  let activeWorkspaceId: string | null = null;
  let isAdmin = false;
  let block: { blockedAt: string; reason: string } | null = null;
  let maintenance: string | null = null;

  if (userId) {
    try {
      // The workspace list and the active id come from the same read, so the
      // header can never highlight a workspace the pages are not loading. The
      // admin flag, the account block and the maintenance flag ride along in
      // the same round: each is one cached read and each is safe to miss.
      const [user, context, admin, accountBlock] = await Promise.all([
        Promise.race([
          currentUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]),
        Promise.race([
          getWorkspaceContext(userId),
          new Promise<{ workspaces: { id: string; name: string }[]; activeWorkspaceId: null }>(
            (resolve) => setTimeout(() => resolve({ workspaces: [], activeWorkspaceId: null }), 2500)
          ),
        ]),
        Promise.race([isAdminUser(userId), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500))]).catch(
          () => false
        ),
        Promise.race([
          ensureRuntimeConfig().then(() => getAccountBlock(userId)),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]).catch(() => null),
      ]);

      userDetails = {
        name: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "Shahid",
        email: user?.emailAddresses?.[0]?.emailAddress || "",
      };

      workspaces = context?.workspaces || [];
      activeWorkspaceId = context?.activeWorkspaceId ?? null;
      isAdmin = admin;
      block = accountBlock;
      const flags = getFlags();
      maintenance = flags.maintenanceEnabled ? flags.maintenanceMessage || "Scheduled maintenance is in progress. Some features may be briefly unavailable." : null;
      touchLastSeen(userId);
    } catch (err) {
      console.warn("[DashboardLayout] Fast fallback for user/workspaces:", err);
    }
  }

  return (
    <DashboardShell
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      userDetails={userDetails}
      isAdmin={isAdmin}
      accountBlock={block}
      maintenanceMessage={maintenance}
    >
      {children}
    </DashboardShell>
  );
}
