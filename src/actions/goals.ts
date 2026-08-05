"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createCampaignFromGoal({
  workspaceId,
  leadTarget,
  timeframe,
  customFeedback,
}: {
  workspaceId: string;
  leadTarget: number;
  timeframe: string;
  customFeedback?: string;
}) {
  try {
    const feedbackNote = customFeedback
      ? `\n\n[Executive Revision Incorporated: "${customFeedback}"]`
      : "";

    // 1. Fetch Workspace & Brand DNA automatically from DB
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { brandDNA: true },
    });

    const companyName = workspace?.name || "SMB Robotics";
    const websiteUrl = workspace?.website || "https://smbrobotic.com";
    const industry = workspace?.industry || "AI Embedded Technology & SaaS";
    const valueProposition =
      workspace?.brandDNA?.missionVision ||
      "Delivering high-ROI autonomous marketing and smart systems.";

    const now = new Date();
    const morningTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    morningTime.setHours(8, 30, 0, 0);

    const eveningTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    eveningTime.setHours(18, 30, 0, 0);

    const postsToCreate = [
      {
        workspaceId,
        platform: "LinkedIn",
        content: `🚨 Why 80% of businesses in ${industry} struggle to scale organic lead velocity (And how ${companyName} solves it).

Most leaders focus on surface-level metrics instead of conversion bottlenecks. Here is our executive framework:
${valueProposition}

1️⃣ Diagnose conversion friction points
2️⃣ Deploy high-value educational carousels
3️⃣ Automate follow-up intent signals
4️⃣ Scale organic domain authority

💡 READY TO ELEVATE YOUR PIPELINE?
👉 Visit ${companyName} today: ${websiteUrl}${feedbackNote}`,
        imagePrompt:
          "Professional high-contrast corporate 4:5 carousel slide infographic showing executive strategy metrics in modern sleek dark mode with crisp typography.",
        status: "APPROVED",
        scheduledFor: morningTime,
      },
      {
        workspaceId,
        platform: "Instagram",
        content: `Stop wasting your budget on vanity metrics! 🛑📈

We help ambitious leaders in ${industry} capture qualified leads without paid ad bloat. Here is how ${companyName} transforms organic reach into revenue.

✨ Learn more about our blueprint:
👉 Visit link in bio (${websiteUrl})
#${companyName.replace(/\s+/g, "")} #IndustryLeadership #OrganicGrowth #ExecutiveStrategy${feedbackNote}`,
        imagePrompt:
          "Vertical 9:16 cinematic video still of an executive entrepreneur analyzing a glowing high-contrast performance dashboard in a silicon valley boardroom.",
        status: "APPROVED",
        scheduledFor: eveningTime,
      },
      {
        workspaceId,
        platform: "X",
        content: `How ${companyName} generates high-intent leads in ${industry} organically.

Here is our 4-Point Execution Blueprint (Thread) 🧵👇

1/ Align content with actual decision-maker pain points
2/ Offer immediate value: ${valueProposition}
3/ Use clear 16:9 infographic data proof
4/ Publish during peak morning executive windows

🔗 Discover more: ${websiteUrl}${feedbackNote}`,
        imagePrompt:
          "16:9 Widescreen clean data infographic contrasting amateur vanity metrics vs professional organic conversion lead velocity.",
        status: "APPROVED",
        scheduledFor: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      },
      {
        workspaceId,
        platform: "TikTok",
        content: `Here is the secret organic growth framework ${companyName} uses to capture leads! 🔥📱

Stop making generic posts. Hook your audience in the first 2 seconds with actionable authority.

👇 Check out ${websiteUrl} to see our full blueprint!
#${companyName.replace(/\s+/g, "")} #GrowthStrategy #MarketingAI #BusinessHacks${feedbackNote}`,
        imagePrompt:
          "Vertical 9:16 viral phone recording style showing a sleek modern dark-mode analytics dashboard with floating green success badges.",
        status: "APPROVED",
        scheduledFor: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      },
    ];

    await prisma.post.createMany({
      data: postsToCreate,
    });

    revalidatePath("/dashboard/content");
    revalidatePath("/dashboard/chat");
    return {
      success: true,
      message: `Generated 4 platform-specific campaigns for ${leadTarget} leads synced with ${companyName} Brand DNA!`,
    };
  } catch (error: any) {
    console.error("Error creating campaign from goal:", error);
    throw new Error(error.message || "Failed to create campaign from goal");
  }
}
