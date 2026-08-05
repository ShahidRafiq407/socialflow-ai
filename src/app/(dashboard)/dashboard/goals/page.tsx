import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { LeadGoalHQ } from "@/components/dashboard/LeadGoalHQ";

export default async function LeadGoalPage() {
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

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-6xl mx-auto p-4 md:p-8">
      <LeadGoalHQ
        workspaceId={workspace.id}
        workspaceName={workspace.name}
      />
    </div>
  );
}
