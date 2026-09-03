import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import PluginsHQ from "@/components/dashboard/PluginsHQ";
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

  const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

  if (!workspace) {
    redirect("/onboarding");
  }

  const [connections, mcpServers, tracking, publishTargets] = await Promise.all([
    listConnections(workspace.id),
    listMcpServers(workspace.id),
    getWebsiteTrackingStatus(workspace.id),
    listPublishTargets(workspace.id),
  ]);

  return (
    <PluginsHQ
      workspaceId={workspace.id}
      connections={connections}
      mcpServers={mcpServers}
      tracking={tracking}
      publishTargets={publishTargets}
    />
  );
}
