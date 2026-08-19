import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { ContentBoardClient } from "@/components/dashboard/ContentBoardClient";

export default async function ContentApprovalBoardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await Promise.race([
    prisma.workspace.findFirst({
      where: { userId },
    }),
    new Promise<any>((resolve) => setTimeout(() => resolve(null), 2500)),
  ]).catch(() => null);

  const workspaceId = workspace?.id || "default-workspace";
  const workspaceName = workspace?.name || "SMB Robotics";

  const posts = await Promise.race([
    prisma.post.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2500)),
  ]).catch(() => []);

  const statusPriority: Record<string, number> = {
    PENDING_APPROVAL: 0,
    APPROVED: 1,
    REJECTED: 2,
    PUBLISHED: 3,
  };

  const sortedPosts = [...posts].sort((a: any, b: any) => {
    const priorityDiff =
      (statusPriority[a.status] ?? 4) - (statusPriority[b.status] ?? 4);
    if (priorityDiff !== 0) return priorityDiff;
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-6xl mx-auto p-4 md:p-8">
      <ContentBoardClient
        initialPosts={sortedPosts}
        workspaceName={workspaceName}
      />
    </div>
  );
}
