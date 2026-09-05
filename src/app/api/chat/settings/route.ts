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
// ============================================================================

import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import { getChatSettings, saveChatSettings } from "@/lib/agents/controller/settings";
import { planMayUseModel, serializeChatModels } from "@/lib/agents/controller/models";
import { getPlanContext } from "@/lib/billing/entitlements";
import { planRank } from "@/lib/billing/plans";
import { actionCredits } from "@/lib/billing/actions";
import { getFlags } from "@/lib/admin/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = await resolveIdentity(searchParams.get("workspaceId"));
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  const [settings, ctx] = await Promise.all([
    getChatSettings(identity.identity.workspaceId),
    getPlanContext(identity.identity.userId),
  ]);
  const flags = getFlags();
  const flat = actionCredits("chat.message");

  return NextResponse.json({
    success: true,
    settings,
    models: serializeChatModels().map((m) => ({
      ...m,
      chatCredits: m.chatCredits ?? flat,
      locked: !planMayUseModel(m, ctx.plan, planRank),
    })),
    flags: {
      modelPicker: flags.chatModelPickerEnabled,
      feedback: flags.chatFeedbackEnabled,
    },
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
