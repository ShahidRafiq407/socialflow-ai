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
 * Generate a Live AI Voice / Hook Preview using the saved Brand DNA
 */
export async function generateBrandDNAPreview(
  workspaceId: string,
  platform: string = "LinkedIn"
) {
  try {
    const dna = await getWorkspaceBrandDNA(workspaceId);

    const prompt = `
You are a senior AI Copywriting Specialist at a $10,000/month executive marketing agency.
Generate ONE high-converting, viral ${platform} post hook and CTA based on this client's exact business profile:

Company Name: ${dna.name}
Industry: ${dna.industry}
Website URL: ${dna.website}
What Business Does: ${dna.missionVision}
Target Audience: ${dna.targetAudience}
Customer Pain Points Solved: ${dna.painPoints}
Key Differentiator / Unfair Advantage: ${dna.differentiator}
Primary CTA Offer: ${dna.ctaOffer}

Output formatting rules:
- Provide an attention-grabbing Hook line (1-2 sentences).
- Provide a brief 2-bullet value insight solving their pain points.
- Provide an authoritative Call to Action that pitches their exact CTA Offer.
- Keep the entire preview short (under 120 words), impactful, and executive.
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
      preview: `🔥 Why 90% of ${dna.industry} brands struggle with slow development cycles:\n\n• Most rely on manual prototyping instead of AI-assisted workflows.\n• Without ${dna.name}'s ${dna.differentiator.toLowerCase()}, costs multiply fast.\n\n👉 ${dna.ctaOffer} to see our engineering strategy in action.`,
      modelUsed: "local-simulation",
    };
  } catch (error: any) {
    console.error("Error generating Brand DNA preview:", error);
    return {
      preview: `🚀 Scale your brand authority with precision-engineered organic marketing. Learn more at our website today.`,
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
