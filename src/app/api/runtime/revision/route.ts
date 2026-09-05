// ============================================================================
// /api/runtime/revision
//
// The cheapest possible "has anything changed?" question. A signed-in tab polls
// this while it is visible; when the token differs from the one it holds, it
// re-fetches the surfaces that depend on admin configuration (the chat model
// catalogue, feature flags, plan limits) and asks Next for a fresh render.
//
// The token has a per-account half, so an admin suspending an account, moving it
// to another plan or adjusting its credits reaches that user's open tab too —
// none of which touches `AppSetting` or `AiModel`, and all of which the shell
// renders. It is scoped to the caller's own id and carries nothing but
// timestamps, so it still cannot leak anything about another account.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { revisionFor } from "@/lib/admin/revision";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const revision = await revisionFor(userId);
  return NextResponse.json(
    { success: true, revision },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
