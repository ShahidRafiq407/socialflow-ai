import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { listPublishTargets } from "@/actions/cmsTargets";
import prisma from "@/lib/db";
import { ArticleWriterHQ } from "@/components/dashboard/ArticleWriterHQ";

/**
 * The page hands down facts, never defaults. The old version passed
 * `brandTone={... || "Professional"}` and `targetAudience={... || "General"}`,
 * which meant a workspace with no Brand DNA still produced an article written
 * for a "General" audience in a "Professional" tone and nothing in the UI said
 * so. Missing stays missing here, and the client says "no Brand DNA saved yet".
 */
export default async function ArticleWriterPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    include: { brandDNA: true },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  // Read on the server so the publishing panel is populated on first paint
  // instead of flashing "no destination connected" while a fetch runs.
  const initialTargets = await listPublishTargets(workspace.id);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <ArticleWriterHQ
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        industry={workspace.industry || ""}
        website={workspace.website || ""}
        brandDna={
          workspace.brandDNA
            ? {
                tone: workspace.brandDNA.tone,
                targetAudience: workspace.brandDNA.targetAudience,
                missionVision: workspace.brandDNA.missionVision,
                writingStyle: workspace.brandDNA.writingStyle,
                forbiddenWords: workspace.brandDNA.forbiddenWords || [],
                primaryColors: workspace.brandDNA.primaryColors || [],
              }
            : null
        }
        initialTargets={initialTargets}
      />
    </div>
  );
}
