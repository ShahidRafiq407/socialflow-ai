// ============================================================================
// /api/runtime/revision
//
// The cheapest possible "has the admin changed anything?" question. A signed-in
// tab polls this while it is visible; when the token differs from the one it
// holds, it re-fetches the surfaces that depend on admin configuration (the chat
// model catalogue, feature flags, plan limits) and asks Next for a fresh render.
//
// Deliberately tiny: no session, no workspace, no plan lookup. It answers the
// same token for every user, so it stays memoisable and cannot leak anything —
// the token is two timestamps and two row counts.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { configRevision } from "@/lib/admin/revision";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const revision = await configRevision();
  return NextResponse.json(
    { success: true, revision },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
