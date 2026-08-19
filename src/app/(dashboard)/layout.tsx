import React from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  let userDetails = null;
  let workspaces: { id: string; name: string }[] = [];

  if (userId) {
    try {
      const [user, dbWorkspaces] = await Promise.all([
        Promise.race([
          currentUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]),
        Promise.race([
          prisma.workspace.findMany({
            where: { userId },
            select: { id: true, name: true },
            orderBy: { createdAt: "asc" },
          }),
          new Promise<{ id: string; name: string }[]>((resolve) => setTimeout(() => resolve([]), 2500)),
        ]),
      ]);

      userDetails = {
        name: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "Shahid",
        email: user?.emailAddresses?.[0]?.emailAddress || "",
      };

      workspaces = dbWorkspaces || [];
    } catch (err) {
      console.warn("[DashboardLayout] Fast fallback for user/workspaces:", err);
    }
  }

  return (
    <DashboardShell workspaces={workspaces} userDetails={userDetails}>
      {children}
    </DashboardShell>
  );
}
