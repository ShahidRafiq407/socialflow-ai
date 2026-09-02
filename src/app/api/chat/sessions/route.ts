// ============================================================================
// /api/chat/sessions
//
// The session rail: list, open, rename, pin, archive, delete. Every operation is
// scoped to the caller's workspace inside the session helpers.
// ============================================================================

import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import {
  deleteSession,
  listSessions,
  loadSessionMessages,
  updateSession,
} from "@/lib/agents/controller/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const sessionId = searchParams.get("sessionId");

  try {
    if (sessionId) {
      const { session, messages } = await loadSessionMessages(identity.identity.workspaceId, sessionId);
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      return NextResponse.json({ success: true, session, messages });
    }

    const sessions = await listSessions(identity.identity.workspaceId, {
      archived: searchParams.get("archived") === "true",
      limit: Number(searchParams.get("limit") || 40),
    });
    return NextResponse.json({ success: true, sessions, workspaceId: identity.identity.workspaceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load sessions";
    console.error("[chat/sessions GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const identity = await resolveIdentity(body?.workspaceId);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  try {
    const ok = await updateSession(identity.identity.workspaceId, sessionId, {
      title: body?.title,
      pinned: body?.pinned,
      archived: body?.archived,
    });
    if (!ok) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  try {
    const ok = await deleteSession(identity.identity.workspaceId, sessionId);
    if (!ok) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
