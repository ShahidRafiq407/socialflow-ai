import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { ContentBoardClient } from "@/components/dashboard/ContentBoardClient";

export default async function ContentApprovalBoardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  const posts = await prisma.post.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  const statusPriority: Record<string, number> = {
    PENDING_APPROVAL: 0,
    APPROVED: 1,
    REJECTED: 2,
    PUBLISHED: 3,
  };

  const sortedPosts = [...posts].sort((a, b) => {
    const priorityDiff =
      (statusPriority[a.status] ?? 4) - (statusPriority[b.status] ?? 4);
    if (priorityDiff !== 0) return priorityDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-6xl mx-auto p-4 md:p-8">
      <ContentBoardClient
        initialPosts={sortedPosts}
        workspaceName={workspace.name}
      />
    </div>
  );
}
