import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import PluginsHQ from "@/components/dashboard/PluginsHQ";
import LockedSurface from "@/components/billing/LockedSurface";
import { surfaceAccess } from "@/lib/billing/access.server";
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

  // The tab exists to give the assistant tools to use. A plan without the assistant
  // has nothing to connect them to, so the refusal belongs here rather than at the
  // end of an OAuth round trip the customer has already started.
  const gate = await surfaceAccess(userId, "plugins.connect");
  if (!gate.allowed) {
    return (
      <LockedSurface
        access={gate}
        title="Plugin"
        purpose="Connect the tools the assistant may use — MCP servers, CMS destinations for publishing, and website lead tracking."
      />
    );
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
