import { AgentStateType } from "../graph/state";
import prisma from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";

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
  const startTime = Date.now();
  console.log(`[Brand Analyst] started for workspace ${state.workspaceId}`);
  
  if (!state.workspaceId) {
    throw new Error("No workspace ID provided to Brand DNA Agent.");
  }

  const brandCacheKey = `brand-dna:${state.workspaceId}`;
  const cached = await cacheGet<any>(brandCacheKey);
  if (cached?.brandData) {
    console.log(`[Brand Analyst] loaded from Redis cache in ${Date.now() - startTime}ms`);
    return {
      brandDNA: cached.brandData,
    };
  }

  const dbStart = Date.now();
  // Fetch workspace + brandDNA relation from DB
  const workspace = await prisma.workspace.findUnique({
    where: { id: state.workspaceId },
    include: {
      brandDNA: true,
      competitors: true,
    }
  });
  console.log(`[Brand Analyst] brand DNA query: ${Date.now() - dbStart}ms`);

  if (!workspace || !workspace.brandDNA) {
    throw new Error("Workspace or Brand Profile not found.");
  }

  const normStart = Date.now();
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
  console.log(`[Brand Analyst] normalization: ${Date.now() - normStart}ms`);

  await cacheSet(brandCacheKey, { brandData, competitors: workspace.competitors || [] }, 3600);

  console.log(`[Brand Analyst] completed: ${Date.now() - startTime}ms`);

  return {
    brandDNA: brandData,
  };
}
