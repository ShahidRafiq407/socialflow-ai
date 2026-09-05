import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { listPublishTargets } from "@/actions/cmsTargets";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { buildBrandProfile } from "@/lib/brand/profile";
import { ArticleWriterHQ } from "@/components/dashboard/ArticleWriterHQ";
import LockedSurface from "@/components/billing/LockedSurface";
import { surfaceAccess } from "@/lib/billing/access.server";

/**
 * The page hands down facts, never defaults. The old version passed
 * `brandTone={... || "Professional"}` and `targetAudience={... || "General"}`,
 * which meant a workspace with no Brand DNA still produced an article written
 * for a "General" audience in a "Professional" tone and nothing in the UI said
 * so. Missing stays missing here, and the client says "no Brand DNA saved yet".
 *
 * Brand DNA is unpacked here rather than in the component: `writingStyle` is a
 * JSON blob, and the page used to hand it to the client, which printed it.
 */
export default async function ArticleWriterPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Quick is the cheaper of the two modes, so a plan without it has no article
  // pipeline at all and the page has nothing to offer. Deep is gated separately, at
  // the mode toggle, because a plan can have one and not the other.
  const gate = await surfaceAccess(userId, "article.quick");
  if (!gate.allowed) {
    return (
      <LockedSurface
        access={gate}
        title="Article Writer"
        purpose="A research pipeline that writes a finished, sourced article for your business and publishes it to your site."
      />
    );
  }

  const workspace = await prisma.workspace.findFirst({
    ...(await activeWorkspaceQuery(userId)),
    include: { brandDNA: true },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  // Read on the server so the publishing panel is populated on first paint
  // instead of flashing "no destination connected" while a fetch runs.
  const initialTargets = await listPublishTargets(workspace.id);
  const profile = buildBrandProfile(workspace);

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
                tone: profile.tone,
                targetAudience: profile.targetAudience,
                missionVision: profile.missionVision,
                writingRules: profile.writingRules,
                painPoints: profile.painPoints,
                differentiator: profile.differentiator,
                ctaOffer: profile.ctaOffer,
                competitors: profile.competitors,
                forbiddenWords: profile.forbiddenWords,
                primaryColors: workspace.brandDNA.primaryColors || [],
              }
            : null
        }
        initialTargets={initialTargets}
      />
    </div>
  );
}
