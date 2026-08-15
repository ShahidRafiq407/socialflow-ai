import { AgentStateType } from "../graph/state";
import prisma from "@/lib/db";

/**
 * Parses the JSON metadata blob stored in brandDNA.writingStyle.
 * Returns {} if the value is missing or not valid JSON.
 */
function parseMetadata(str?: string | null): Record<string, string> {
  if (!str) return {};
  try {
    if (str.trim().startsWith("{")) {
      return JSON.parse(str);
    }
  } catch {
    // not JSON — ignore
  }
  return {};
}

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

  const meta = parseMetadata(workspace.brandDNA.writingStyle);

  const brandData = {
    name: workspace.name || "",
    website: workspace.website || "",
    industry: workspace.industry || "",
    tone: workspace.brandDNA.tone || "",
    targetAudience: workspace.brandDNA.targetAudience || "",
    missionVision: workspace.brandDNA.missionVision || "",
    painPoints: meta.painPoints || "",
    differentiator: meta.differentiator || "",
    ctaOffer: meta.ctaOffer || "",
    competitors: meta.competitors || "",
    writingStyle: meta.rules || "",
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
