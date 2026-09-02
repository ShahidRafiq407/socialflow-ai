// ============================================================================
// /api/chat/settings
//
// Everything the user can tune about the controller lives here — model, thinking
// depth, language, autonomy, capability switches, memory behaviour — so the whole
// configuration surface sits inside the chat tab itself.
// ============================================================================

import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import { getChatSettings, saveChatSettings } from "@/lib/agents/controller/settings";
import { CHAT_MODELS } from "@/lib/agents/controller/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const settings = await getChatSettings(identity.identity.workspaceId);
  return NextResponse.json({
    success: true,
    settings,
    models: CHAT_MODELS,
    workspaceId: identity.identity.workspaceId,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const identity = await resolveIdentity(body?.workspaceId);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const patch = body?.settings && typeof body.settings === "object" ? body.settings : body;

  try {
    const settings = await saveChatSettings(identity.identity.workspaceId, patch);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    console.error("[chat/settings PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
