import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Regenerates the visual for one plan task.
 *
 * This exists as a route rather than a bare server action so the client's Stop
 * button is real: aborting the request aborts `req.signal`, which is forwarded
 * into the media generator and cancels the upstream call instead of leaving it
 * running while the UI pretends it stopped.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId: string = body.workspaceId;
    const taskId: string = body.taskId;
    const prompt: string | undefined = body.prompt || undefined;

    if (!workspaceId || !taskId) {
      return NextResponse.json({ error: "workspaceId and taskId are required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } });
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const { checkAIAccess } = await import("@/lib/billing/gate");
    const gate = await checkAIAccess(workspaceId);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.message || "Upgrade required", reason: gate.reason },
        { status: 403 }
      );
    }

    const controller = new AbortController();
    req.signal.addEventListener("abort", () => controller.abort(), { once: true });

    const { regenerateGrowthTaskMedia } = await import("@/actions/goals");
    const result = await regenerateGrowthTaskMedia(workspaceId, taskId, {
      prompt,
      signal: controller.signal,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: controller.signal.aborted ? "Stopped by user." : result.error || "Could not regenerate.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, mediaUrl: result.mediaUrl });
  } catch (error: any) {
    const aborted = error?.name === "AbortError";
    if (!aborted) console.error("[growth/media] fatal:", error);
    return NextResponse.json(
      { error: aborted ? "Stopped by user." : error?.message || "Internal server error" },
      { status: aborted ? 499 : 500 }
    );
  }
}
