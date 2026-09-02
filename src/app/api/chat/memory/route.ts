// ============================================================================
// /api/chat/memory
//
// The memory inspector behind the chat's Memory panel: read what the controller
// knows, add a fact by hand, pin or edit one, delete one.
// ============================================================================

import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import {
  forgetMemory,
  rememberFact,
  searchMemories,
  updateMemory,
} from "@/lib/agents/controller/memory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const facts = await searchMemories(identity.identity.workspaceId, {
    query: searchParams.get("query") || undefined,
    category: searchParams.get("category") || undefined,
    limit: Number(searchParams.get("limit") || 60),
  });

  const byCategory: Record<string, number> = {};
  for (const fact of facts) byCategory[fact.category] = (byCategory[fact.category] || 0) + 1;

  return NextResponse.json({ success: true, facts, count: facts.length, byCategory });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const identity = await resolveIdentity(body?.workspaceId);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

  const saved = await rememberFact({
    workspaceId: identity.identity.workspaceId,
    content,
    category: typeof body?.category === "string" ? body.category : "general",
    importance: typeof body?.importance === "number" ? body.importance : 4,
    pinned: body?.pinned === true,
    source: "user",
  });

  if (!saved.saved) return NextResponse.json({ error: "Could not save that memory" }, { status: 500 });
  return NextResponse.json({ success: true, id: saved.id, merged: !!saved.merged });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const identity = await resolveIdentity(body?.workspaceId);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await updateMemory(identity.identity.workspaceId, id, {
    content: typeof body?.content === "string" ? body.content : undefined,
    category: typeof body?.category === "string" ? body.category : undefined,
    importance: typeof body?.importance === "number" ? body.importance : undefined,
    pinned: typeof body?.pinned === "boolean" ? body.pinned : undefined,
  });

  if (!ok) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await forgetMemory(identity.identity.workspaceId, id);
  if (!ok) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
