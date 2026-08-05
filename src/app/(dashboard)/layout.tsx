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
    const user = await currentUser();
    userDetails = {
      name: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "User",
      email: user?.emailAddresses[0]?.emailAddress || "",
    };

    workspaces = await prisma.workspace.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
  }

  return (
    <DashboardShell workspaces={workspaces} userDetails={userDetails}>
      {children}
    </DashboardShell>
  );
}
