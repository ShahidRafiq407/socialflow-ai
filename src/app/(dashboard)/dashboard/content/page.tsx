import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { ContentBoardClient } from "@/components/dashboard/ContentBoardClient";

export default async function ContentLibraryPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

  // No workspace means onboarding never finished; showing a placeholder
  // library under someone else's brand name is worse than sending them back.
  if (!workspace) {
    redirect("/onboarding");
  }

  const workspaceId = workspace.id;
  const workspaceName = workspace.name || "";

  // Content Library = everything the user owns: drafts, needs-review,
  // scheduled, published (kept 1 hour as a receipt, then auto-cleaned by
  // the dispatcher/cron — autopilot posts are kept 3 days), failed
  // (retryable) and rejected. Only the transient PUBLISHING state is hidden.
  const posts = await prisma.post
    .findMany({
      where: {
        workspaceId,
        status: { notIn: ["PUBLISHING"] },
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => [] as any[]);

  // Urgency-first ordering for the "All" view: what needs action now sits on
  // top, the published history sinks to the bottom.
  const statusPriority: Record<string, number> = {
    PENDING_APPROVAL: 0,
    APPROVED: 0,
    FAILED: 1,
    SCHEDULED: 2,
    DRAFT: 3,
    REJECTED: 4,
    PUBLISHED: 5,
  };

  const sortedPosts = [...posts].sort((a: any, b: any) => {
    const priorityDiff =
      (statusPriority[a.status] ?? 6) - (statusPriority[b.status] ?? 6);
    if (priorityDiff !== 0) return priorityDiff;
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-7xl mx-auto p-4 md:p-6">
      <ContentBoardClient
        initialPosts={sortedPosts}
        workspaceName={workspaceName}
      />
    </div>
  );
}
