import { AgentStateType } from "../graph/state";
import prisma from "@/lib/db";
import { buildBrandProfile } from "@/lib/brand/profile";

export async function brandAnalystNode(state: AgentStateType) {
  console.log("--- [Brand DNA Agent] Extracting Core Identity ---");

  if (!state.workspaceId) {
    throw new Error("No workspace ID provided to Brand DNA Agent.");
  }

  // Fetch workspace + brandDNA relation from DB
  const workspace = await prisma.workspace.findUnique({
    where: { id: state.workspaceId },
    include: {
      brandDNA: true,
    }
  });

  if (!workspace || !workspace.brandDNA) {
    throw new Error("Workspace or Brand Profile not found.");
  }

  const profile = buildBrandProfile(workspace);

  const brandData = {
    name: profile.brandName,
    website: profile.website,
    industry: profile.industry,
    tone: profile.tone,
    targetAudience: profile.targetAudience,
    missionVision: profile.missionVision,
    painPoints: profile.painPoints,
    differentiator: profile.differentiator,
    ctaOffer: profile.ctaOffer,
    competitors: profile.competitors,
    writingStyle: profile.writingRules,
  };

  console.log("[Brand DNA Agent] Loaded brand profile:", {
    name: brandData.name,
    industry: brandData.industry,
    hasAudience: !!brandData.targetAudience,
    hasPainPoints: !!brandData.painPoints,
    hasDifferentiator: !!brandData.differentiator,
  });

  return {
    brandDNA: brandData,
  };
}
