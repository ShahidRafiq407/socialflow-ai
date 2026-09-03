import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import PluginsHQ from "@/components/dashboard/PluginsHQ";
import { getWordPressSite } from "@/actions/wordpressSite";
import { listConnections } from "@/actions/connections";
import { listMcpServers } from "@/actions/mcpServers";
import { getWebsiteTrackingStatus } from "@/actions/growthLeads";
import { listPublishTargets } from "@/actions/cmsTargets";

export const dynamic = "force-dynamic";

export default async function PluginsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId },
  });

  if (!workspace) {
    redirect("/onboarding");
  }

  const [wpSite, connections, mcpServers, tracking, publishTargets] = await Promise.all([
    getWordPressSite(workspace.id),
    listConnections(workspace.id),
    listMcpServers(workspace.id),
    getWebsiteTrackingStatus(workspace.id),
    listPublishTargets(workspace.id),
  ]);

  return (
    <PluginsHQ
      workspaceId={workspace.id}
      wpSite={wpSite}
      connections={connections}
      mcpServers={mcpServers}
      tracking={tracking}
      publishTargets={publishTargets}
    />
  );
}
