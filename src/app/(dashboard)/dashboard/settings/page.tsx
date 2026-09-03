// ============================================================================
// /dashboard/settings — SERVER PAGE
//
// Resolves everything the Settings shell needs in one render: the user's first
// workspace (the same one every other tab operates on), their AI assistant
// defaults, plan state, and live counts for the Data and Danger Zone sections.
// Nothing secret is passed down — connection state stays booleans-only.
// ============================================================================

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { getChatSettings } from "@/lib/agents/controller/settings";
import { BILLING_ENABLED, getWorkspacePlan } from "@/lib/billing/gate";
import { SettingsShell } from "@/components/dashboard/settings/SettingsShell";
import type { SettingsData } from "@/components/dashboard/settings/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // The workspace the header is pointing at — so Settings edits the workspace
  // the user is actually looking at, not always the oldest one.
  const workspace = await prisma.workspace.findFirst({
    ...(await activeWorkspaceQuery(userId)),
    select: {
      id: true,
      name: true,
      industry: true,
      website: true,
      trackingKey: true,
      createdAt: true,
    },
  });

  // No workspace means onboarding never finished — nothing to configure.
  if (!workspace) redirect("/onboarding");

  const workspaceId = workspace.id;

  const [
    chatSettings,
    plan,
    workspaceCount,
    posts,
    socialAccounts,
    scheduledPosts,
    chatSessions,
    connectors,
    mcpServers,
    totalPosts,
    totalSocialAccounts,
    totalScheduledPosts,
    totalChatSessions,
  ] = await Promise.all([
    getChatSettings(workspaceId),
    getWorkspacePlan(workspaceId),
    prisma.workspace.count({ where: { userId } }),
    prisma.post.count({ where: { workspaceId } }),
    prisma.socialAccount.count({ where: { workspaceId } }),
    prisma.post.count({ where: { workspaceId, status: "SCHEDULED" } }),
    prisma.chatSession.count({ where: { workspaceId } }),
    prisma.userConnection.count({ where: { workspaceId } }),
    prisma.mcpServerConnection.count({ where: { workspaceId } }),
    prisma.post.count({ where: { workspace: { userId } } }),
    prisma.socialAccount.count({ where: { workspace: { userId } } }),
    prisma.post.count({ where: { workspace: { userId }, status: "SCHEDULED" } }),
    prisma.chatSession.count({ where: { workspace: { userId } } }),
  ]);

  const data: SettingsData = {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      industry: workspace.industry,
      website: workspace.website,
      createdAt: workspace.createdAt.toISOString(),
      trackingInstalled: Boolean(workspace.trackingKey),
      workspaceCount,
    },
    chatSettings: {
      replyLanguage: chatSettings.replyLanguage,
      replyStyle: chatSettings.replyStyle,
      autonomy: chatSettings.autonomy,
      memoryEnabled: chatSettings.memoryEnabled,
      customInstructions: chatSettings.customInstructions,
    },
    billing: {
      billingEnabled: BILLING_ENABLED,
      tier: plan.plan,
      status: plan.status,
    },
    counts: {
      posts,
      socialAccounts,
      scheduledPosts,
      chatSessions,
      connectors,
      mcpServers,
      // Same query as workspaceCount above — one round trip serves both.
      totalWorkspaces: workspaceCount,
      totalPosts,
      totalSocialAccounts,
      totalScheduledPosts,
      totalChatSessions,
    },
  };

  return (
    <div className="w-full max-w-6xl mx-auto font-sans pb-20">
      <SettingsShell data={data} />
    </div>
  );
}
