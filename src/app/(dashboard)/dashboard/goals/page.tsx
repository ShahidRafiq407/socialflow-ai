import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { LeadGoalHQ } from "@/components/dashboard/LeadGoalHQ";
import { getWorkspaceGrowthGoal } from "@/actions/goals";

export const dynamic = "force-dynamic";

export default async function LeadGoalPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    include: { socialAccounts: true, brandDNA: true },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  const { goal, kpis, strategy } = await getWorkspaceGrowthGoal(workspace.id);

  const connectedPlatforms = workspace.socialAccounts.map((a) => {
    const p = a.platform.toLowerCase();
    if (p === "instagram") return "Instagram";
    if (p === "linkedin") return "LinkedIn";
    if (p === "facebook") return "Facebook";
    if (p === "x") return "X";
    if (p === "tiktok") return "TikTok";
    if (p === "youtube") return "YouTube";
    if (p === "pinterest") return "Pinterest";
    return a.platform;
  });

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <LeadGoalHQ
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        industry={workspace.industry || "Embedded Systems & AI Robotics"}
        website={workspace.website || "https://smbrobotic.com"}
        initialGoal={goal}
        initialKPIs={kpis}
        initialStrategy={strategy}
        connectedPlatforms={connectedPlatforms}
      />
    </div>
  );
}
