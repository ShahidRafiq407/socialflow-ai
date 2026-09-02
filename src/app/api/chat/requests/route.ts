// ============================================================================
// /api/chat/requests
//
// The Requests panel behind the chat: read every ask this product could not do
// yet, move one along the pipeline (open → planned → shipped → declined), or
// delete one. This is the developer's end of the "sorry, I can't do that" loop.
// ============================================================================

import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import {
  deleteFeatureRequest,
  listFeatureRequests,
  updateFeatureRequestStatus,
} from "@/lib/agents/controller/requests";
import { isFeatureRequestStatus } from "@/lib/agents/controller/requestShape";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const statusParam = searchParams.get("status");
  const status = statusParam && isFeatureRequestStatus(statusParam) ? statusParam : "all";

  const requests = await listFeatureRequests(identity.identity.workspaceId, {
    status,
    query: searchParams.get("query") || undefined,
    limit: Number(searchParams.get("limit") || 100),
  });

  const byStatus: Record<string, number> = {};
  for (const r of requests) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  return NextResponse.json({ success: true, requests, count: requests.length, byStatus });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const identity = await resolveIdentity(body?.workspaceId);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (!isFeatureRequestStatus(body?.status)) {
    return NextResponse.json({ error: "status must be open, planned, shipped or declined" }, { status: 400 });
  }

  const ok = await updateFeatureRequestStatus(identity.identity.workspaceId, id, body.status);
  if (!ok) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await deleteFeatureRequest(identity.identity.workspaceId, id);
  if (!ok) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
