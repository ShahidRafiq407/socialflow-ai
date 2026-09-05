import React from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getWorkspaceContext } from "@/lib/workspace/active";
import { isAdminUser } from "@/lib/admin/auth";
import { getAccountBlock } from "@/lib/admin/block";
import { ensureRuntimeConfig, getFlags } from "@/lib/admin/runtimeConfig";
import { touchLastSeen } from "@/lib/admin/presence";
import prisma from "@/lib/db";

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
      // header can never highlight a workspace the pages are not loading.
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

      const primaryEmail = user?.emailAddresses?.[0]?.emailAddress || "";
      const fullName = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : null;
      const avatarUrl = user?.imageUrl || null;

      userDetails = {
        name: fullName || "User",
        email: primaryEmail,
      };

      if (primaryEmail) {
        // Auto-heal DB user record if it was born with placeholder or missing name/avatar
        prisma.user
          .updateMany({
            where: {
              id: userId,
              OR: [
                { email: { contains: "@placeholder" } },
                { name: null },
                { avatar: null },
              ],
            },
            data: {
              email: primaryEmail,
              ...(fullName ? { name: fullName } : {}),
              ...(avatarUrl ? { avatar: avatarUrl } : {}),
            },
          })
          .catch(() => {});
      }

      workspaces = context?.workspaces || [];
      activeWorkspaceId = context?.activeWorkspaceId ?? null;
      isAdmin = admin;
      block = accountBlock;
      const flags = getFlags();
      maintenance = flags.maintenanceEnabled
        ? flags.maintenanceMessage || "Scheduled maintenance is in progress. Some features may be briefly unavailable."
        : null;
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
