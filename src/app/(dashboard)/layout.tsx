import React from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getWorkspaceContext } from "@/lib/workspace/active";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  let userDetails = null;
  let workspaces: { id: string; name: string }[] = [];
  let activeWorkspaceId: string | null = null;

  if (userId) {
    try {
      // The workspace list and the active id come from the same read, so the
      // header can never highlight a workspace the pages are not loading.
      const [user, context] = await Promise.all([
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
      ]);

      userDetails = {
        name: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "Shahid",
        email: user?.emailAddresses?.[0]?.emailAddress || "",
      };

      workspaces = context?.workspaces || [];
      activeWorkspaceId = context?.activeWorkspaceId ?? null;
    } catch (err) {
      console.warn("[DashboardLayout] Fast fallback for user/workspaces:", err);
    }
  }

  return (
    <DashboardShell
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      userDetails={userDetails}
    >
      {children}
    </DashboardShell>
  );
}
