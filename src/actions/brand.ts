"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { llm } from "@/lib/agents/llm";
import { HumanMessage } from "@langchain/core/messages";
import { extractFromUrl } from "@/actions/extract";
import { parseBrandMetadata } from "@/lib/brand/profile";

export interface BrandDNAFormValues {
  name: string;
  website: string;
  industry: string;
  targetAudience: string;
  missionVision: string; // What Does Your Business Do?
  ctaOffer: string; // Default CTA Offer / Lead Magnet
  painPoints: string; // Key Customer Pain Points Solved
  differentiator: string; // Key Differentiator / Unfair Advantage
  competitors: string; // Benchmark Competitor Brands
  tone?: string;
  writingStyle?: string;
  primaryColors?: string[];
  forbiddenWords?: string[];
}

/**
 * Get Workspace + Brand DNA profile
 */
export async function getWorkspaceBrandDNA(workspaceId: string): Promise<BrandDNAFormValues> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        brandDNA: true,
      },
    });

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const meta = parseBrandMetadata(workspace.brandDNA?.writingStyle);

    return {
      name: workspace.name || "",
      website: workspace.website || "",
      industry: workspace.industry || "",
      missionVision: workspace.brandDNA?.missionVision || "",
      targetAudience: workspace.brandDNA?.targetAudience || "",
      ctaOffer: meta.ctaOffer || "",
      painPoints: meta.painPoints || "",
      differentiator: meta.differentiator || "",
      competitors: meta.competitors || "",
      tone: workspace.brandDNA?.tone || "",
      writingStyle: meta.rules || "",
      primaryColors: workspace.brandDNA?.primaryColors?.length
        ? workspace.brandDNA.primaryColors
        : ["#4F46E5", "#10B981"],
      forbiddenWords: workspace.brandDNA?.forbiddenWords?.length
        ? workspace.brandDNA.forbiddenWords
        : [],
    };
  } catch (error: any) {
    console.error("Error fetching Brand DNA:", error);
    throw new Error(error.message || "Failed to fetch Brand DNA");
  }
}

/**
 * Save / Update Workspace Brand DNA profile
 */
export async function saveWorkspaceBrandDNA(
  workspaceId: string,
  data: BrandDNAFormValues
) {
  try {
    const combinedStyleJson = JSON.stringify({
      ctaOffer: data.ctaOffer,
      painPoints: data.painPoints,
      differentiator: data.differentiator,
      competitors: data.competitors,
      rules: data.writingStyle || "",
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: data.name,
        website: data.website,
        industry: data.industry,
        brandDNA: {
          upsert: {
            create: {
              tone: data.tone || "",
              missionVision: data.missionVision,
              targetAudience: data.targetAudience,
              writingStyle: combinedStyleJson,
              primaryColors: data.primaryColors || ["#4F46E5", "#10B981"],
              forbiddenWords: data.forbiddenWords || [],
            },
            update: {
              tone: data.tone || "",
              missionVision: data.missionVision,
              targetAudience: data.targetAudience,
              writingStyle: combinedStyleJson,
              primaryColors: data.primaryColors || ["#4F46E5", "#10B981"],
              forbiddenWords: data.forbiddenWords || [],
            },
          },
        },
      },
    });

    // Revalidate all relevant tabs so real-time sync works across the app
    revalidatePath("/dashboard/brand");
    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/content");
    revalidatePath("/dashboard/ai-studio");

    return { success: true };
  } catch (error: any) {
    console.error("Error saving Brand DNA:", error);
    throw new Error(error.message || "Failed to save Brand DNA");
  }
}

/**
 * Generate a Live AI Voice / Hook Preview using the saved Brand DNA.
 *
 * This is a VOICE preview, not an advert. Brand DNA is read as field, audience and
 * vocabulary — never as an offer to pitch — because the preview is what teaches the
 * user what the generators will produce, and the generators do not sell. `ctaOffer`
 * is deliberately not passed in: it belongs to the tracked-link goal posts, not here.
 */
export async function generateBrandDNAPreview(
  workspaceId: string,
  platform: string = "LinkedIn"
) {
  try {
    const dna = await getWorkspaceBrandDNA(workspaceId);

    const prompt = `
You are a subject-matter writer with a social growth instinct. You are NOT an advertiser.
Write ONE short ${platform} post that shows this business's voice while talking about something live in its audience's field:

Company Name (the narrator, never the subject): ${dna.name}
Field: ${dna.industry}
Target Audience: ${dna.targetAudience}
What that audience struggles with: ${dna.painPoints}
Perspective the writer argues from: ${dna.differentiator}

Output formatting rules:
- Open on a hook line (1-2 sentences) that costs the reader something to ignore.
- Give a 2-bullet insight the reader can act on — a mechanism, a number, or a trade-off.
- Close on a question about the reader's own experience that they can answer in one comment.
- NOTHING promotional: no offer, no services, no availability, no pricing, no "DM us", no "link in bio", no credential boasts, and never claim this business did any work, served any client or got any result.
- Keep the entire preview under 120 words and specific.
`;

    try {
      const res = await llm.invoke([new HumanMessage(prompt)]);
      return {
        preview: (res.content?.toString() || "").trim(),
        modelUsed: "groq-llama-3",
      };
    } catch (err: any) {
      console.warn(`[BrandDNAPreview] Groq failed.`, err);
    }

    // Fallback if offline or API key limit
    return {
      preview: `Most ${dna.industry} teams blame slow delivery on capacity. It is usually the handoffs.\n\n• Manual prototyping burns days that an AI-assisted pass finishes in hours.\n• Every extra approval step compounds — the cost is in the waiting, not the work.\n\nWhere does your delivery time actually go: building, or waiting?`,
      modelUsed: "local-simulation",
    };
  } catch (error: any) {
    console.error("Error generating Brand DNA preview:", error);
    return {
      preview: `Organic reach did not die — the bar moved. The posts that still travel teach something specific in the first two lines.\n\nWhat is the last post you stopped scrolling for, and what made you stop?`,
      modelUsed: "local-fallback",
    };
  }
}

/**
 * Scan website URL and auto-populate Brand DNA fields
 */
export async function extractAndApplyBrandDNAFromUrl(
  workspaceId: string,
  url: string
): Promise<BrandDNAFormValues> {
  try {
    const extracted = await extractFromUrl(url);

    const existing = await getWorkspaceBrandDNA(workspaceId);

    const updatedData: BrandDNAFormValues = {
      name: extracted.companyName || existing.name,
      website: url,
      industry: extracted.industry || existing.industry,
      targetAudience: extracted.targetAudience || existing.targetAudience,
      missionVision: extracted.missionVision || existing.missionVision,
      ctaOffer: extracted.ctaOffer || existing.ctaOffer,
      painPoints: extracted.painPoints || existing.painPoints,
      differentiator: extracted.differentiator || existing.differentiator,
      competitors: extracted.competitors || existing.competitors,
      tone: extracted.brandTone || existing.tone,
      writingStyle: existing.writingStyle,
      primaryColors: existing.primaryColors,
      forbiddenWords: existing.forbiddenWords,
    };

    await saveWorkspaceBrandDNA(workspaceId, updatedData);

    return updatedData;
  } catch (error: any) {
    console.error("Error extracting and saving Brand DNA:", error);
    throw new Error(error.message || "Failed to scan URL for Brand DNA");
  }
}
