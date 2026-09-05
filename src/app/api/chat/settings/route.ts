// ============================================================================
// /api/chat/settings
//
// Everything the user can tune about the controller lives here — model, thinking
// depth, language, autonomy, capability switches, memory behaviour — so the whole
// configuration surface sits inside the chat tab itself.
//
// The model list is the live catalogue: the built-in brain plus whatever the
// admin has added and enabled for chat, filtered to what this account's plan may
// pick. A model the plan cannot use is still sent (so the picker can show it as
// an upgrade), flagged with `locked: true`.
//
// That catalogue is built by `chatCataloguePayload`, not here, because the chat
// page sends the same object down with the first render. Two builders meant the
// first paint and the first refresh could disagree about which models exist.
// ============================================================================

import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import { getChatSettings, saveChatSettings } from "@/lib/agents/controller/settings";
import { chatCataloguePayload } from "@/lib/agents/controller/catalogue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  // `chatCataloguePayload` awaits `ensureRuntimeConfig()` before it reads anything,
  // which is also what makes the `getChatSettings` beside it safe to run in
  // parallel — on a cold lambda the catalogue would otherwise be nothing at all.
  const [catalogue, settings] = await Promise.all([
    chatCataloguePayload(identity.identity.userId),
    getChatSettings(identity.identity.workspaceId),
  ]);

  return NextResponse.json(
    {
      success: true,
      settings,
      ...catalogue,
      workspaceId: identity.identity.workspaceId,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
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
