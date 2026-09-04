"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { llm } from "@/lib/agents/llm";
import { HumanMessage } from "@langchain/core/messages";
import { extractFromUrl } from "@/actions/extract";
import { parseBrandMetadata } from "@/lib/brand/profile";
import {
  completeAction,
  failAction,
  isEntitlementError,
  requireAction,
  type ActionTicket,
} from "@/lib/billing/entitlements";
import { withMeterContext } from "@/lib/billing/meter";

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
 * Resolves who is asking, and refuses unless they own the workspace.
 *
 * Every export in this file is a `"use server"` function that takes a
 * `workspaceId` straight from its caller, which makes each one a public HTTP
 * endpoint keyed by a guessable id. Until this, any request could read — and
 * overwrite — another account's Brand DNA by passing that account's workspace id,
 * and `generateBrandDNAPreview` would spend a model call for a caller with no
 * session at all.
 *
 * `owner` lets a server-side caller that has already resolved identity — the chat
 * runtime, which carries `ctx.userId` — pass it in rather than depend on a Clerk
 * request scope being present.
 */
async function requireWorkspaceOwner(workspaceId: string, owner?: string): Promise<string> {
  const userId = owner || (await auth()).userId;
  if (!userId) throw new Error("Unauthorized");

  const owned = await prisma.workspace
    .findFirst({ where: { id: workspaceId, userId }, select: { id: true } })
    .catch(() => null);
  // Deliberately the same sentence for "does not exist" and "is not yours", so
  // this cannot be used to test whether a workspace id is real.
  if (!owned) throw new Error("Workspace not found");

  return userId;
}

/**
 * Get Workspace + Brand DNA profile
 */
export async function getWorkspaceBrandDNA(
  workspaceId: string,
  owner?: string
): Promise<BrandDNAFormValues> {
  try {
    const userId = await requireWorkspaceOwner(workspaceId, owner);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId, userId },
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
  data: BrandDNAFormValues,
  owner?: string
) {
  try {
    const userId = await requireWorkspaceOwner(workspaceId, owner);

    const combinedStyleJson = JSON.stringify({
      ctaOffer: data.ctaOffer,
      painPoints: data.painPoints,
      differentiator: data.differentiator,
      competitors: data.competitors,
      rules: data.writingStyle || "",
    });

    await prisma.workspace.update({
      where: { id: workspaceId, userId },
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
 *
 * One `llm.invoke` on the frontier model, so it is a charged action even though it
 * produces nothing the customer keeps. The two canned fallbacks below refund it —
 * a paragraph we wrote by hand is not worth a credit, and returning one silently
 * while keeping the charge is how a customer stops trusting the usage list.
 */
export async function generateBrandDNAPreview(
  workspaceId: string,
  platform: string = "LinkedIn",
  owner?: string
): Promise<{ preview: string; modelUsed: string; error?: string; upgrade?: boolean }> {
  let ticket: ActionTicket | null = null;
  try {
    const userId = await requireWorkspaceOwner(workspaceId, owner);
    const dna = await getWorkspaceBrandDNA(workspaceId, userId);

    try {
      ticket = await requireAction({
        userId,
        action: "brand.preview",
        workspaceId,
        referenceId: platform,
      });
    } catch (gateErr) {
      if (!isEntitlementError(gateErr)) throw gateErr;
      // Reported rather than papered over with canned copy: a preview that is not
      // this brand's voice, shown with no explanation, reads as a broken feature.
      return { preview: "", modelUsed: "unavailable", error: gateErr.gate.message, upgrade: true };
    }

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
      const res = await withMeterContext(
        {
          userId,
          workspaceId,
          feature: "brand",
          action: "brand.preview",
          referenceId: platform,
        },
        () => llm.invoke([new HumanMessage(prompt)])
      );
      const preview = (res.content?.toString() || "").trim();
      if (preview) {
        await completeAction({
          ticket,
          measureCost: true,
          referenceType: "brand_preview",
          referenceId: workspaceId,
        });
        ticket = null;
        return { preview, modelUsed: "gemini-3.1-pro" };
      }
    } catch (err: any) {
      console.warn(`[BrandDNAPreview] model call failed.`, err);
    }

    // Fallback if offline or API key limit
    if (ticket) {
      await failAction(ticket, { note: "Refunded: the model returned nothing" }).catch(() => null);
    }
    ticket = null;
    return {
      preview: `Most ${dna.industry} teams blame slow delivery on capacity. It is usually the handoffs.\n\n• Manual prototyping burns days that an AI-assisted pass finishes in hours.\n• Every extra approval step compounds — the cost is in the waiting, not the work.\n\nWhere does your delivery time actually go: building, or waiting?`,
      modelUsed: "local-simulation",
    };
  } catch (error: any) {
    console.error("Error generating Brand DNA preview:", error);
    if (ticket) {
      await failAction(ticket, { note: "Refunded: the preview could not be built" }).catch(
        () => null
      );
    }
    return {
      preview: `Organic reach did not die — the bar moved. The posts that still travel teach something specific in the first two lines.\n\nWhat is the last post you stopped scrolling for, and what made you stop?`,
      modelUsed: "local-fallback",
    };
  }
}

/**
 * Scan website URL and auto-populate Brand DNA fields
 *
 * The credits belong to `extractFromUrl`, which is where the page fetch and the
 * model call live and which all three brand-scan entrances go through. Nothing is
 * charged for the save.
 */
export async function extractAndApplyBrandDNAFromUrl(
  workspaceId: string,
  url: string,
  owner?: string
): Promise<BrandDNAFormValues> {
  try {
    const userId = await requireWorkspaceOwner(workspaceId, owner);

    // The workspace is passed explicitly so the usage row lands on the workspace
    // being edited, not on whichever one the active-workspace cookie points at.
    const extracted = await extractFromUrl(url, { userId, workspaceId });

    const existing = await getWorkspaceBrandDNA(workspaceId, userId);

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

    await saveWorkspaceBrandDNA(workspaceId, updatedData, userId);

    return updatedData;
  } catch (error: any) {
    console.error("Error extracting and saving Brand DNA:", error);
    // A refusal is rethrown intact so a caller that wants the gate — the reason, the
    // plan to upgrade to — still has it. `new Error(error.message)` would keep the
    // sentence and throw the rest away.
    if (isEntitlementError(error)) throw error;
    throw new Error(error.message || "Failed to scan URL for Brand DNA");
  }
}
