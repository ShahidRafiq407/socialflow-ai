import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { AnalyticsHQ } from "@/components/dashboard/AnalyticsHQ";
import { getWorkspaceAnalytics } from "@/actions/analytics";

export const dynamic = "force-dynamic";

/**
 * Analytics — server side it only fetches real counted rows; there is no
 * fallback payload. If the database is unreachable, getWorkspaceAnalytics
 * returns an empty (zeros) payload and the UI shows its honest "no data"
 * state instead of a fabricated dashboard.
 */
export default async function AnalyticsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  let workspace: { id: string } | null = null;
  let dbDown = false;
  try {
    workspace = await prisma.workspace.findFirst({
      ...(await activeWorkspaceQuery(userId)),
      select: { id: true },
    });
  } catch (error) {
    dbDown = true;
    console.warn("[analytics/page] database unreachable, showing empty analytics:", error);
  }

  // No workspace and the DB answered honestly → onboarding really is missing.
  if (!workspace && !dbDown) {
    redirect("/onboarding");
  }

  // DB unreachable → getWorkspaceAnalytics returns the empty payload and the
  // UI shows its "no data" state. Never a fabricated dashboard.
  const analyticsData = await getWorkspaceAnalytics(workspace?.id || "");

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full max-w-6xl mx-auto p-4 md:p-8">
      <AnalyticsHQ workspaceId={workspace?.id || ""} initialData={analyticsData} />
    </div>
  );
}
