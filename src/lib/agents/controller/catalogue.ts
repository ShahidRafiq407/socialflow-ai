// ============================================================================
// CHAT CATALOGUE PAYLOAD
//
// One description of "what may this account pick, and what does each pick cost",
// built on the server and consumed in two places: the chat page, which sends it
// down with the first render, and `GET /api/chat/settings`, which the open tab
// re-fetches whenever the config revision moves.
//
// It exists because those two used to disagree. The route built the payload; the
// page sent none, so the browser's copy of the catalogue started as the single
// model compiled into the bundle and only became real once a `useEffect` had
// round-tripped. Every model the admin added was missing from the first paint —
// the composer label, the picker and the header all rendered the shipped default
// for a beat, and if the fetch failed they rendered it for the whole session.
//
// Building it once, here, is also the only way the two stay in agreement: the
// filtering, the per-model price fallback and the plan locks are decisions, and
// two copies of a decision is one copy plus a bug waiting for someone to edit the
// wrong file.
// ============================================================================

import { planMayUseModel, serializeChatModels, getDefaultChatModelId, type ChatModelInfo } from "./models";
import { getPlanContext } from "@/lib/billing/entitlements";
import { planRank, type PlanTier } from "@/lib/billing/plans";
import { actionCredits } from "@/lib/billing/actions";
import { ensureRuntimeConfig, getFlags } from "@/lib/admin/runtimeConfig";
import { configRevision } from "@/lib/admin/revision";

/**
 * A catalogue row as the browser receives it: whatever `serializeChatModels`
 * chose to expose, plus the two things only a request can know — what a turn on
 * it costs, and whether this plan may pick it.
 */
export type ChatCatalogueModel = ChatModelInfo & {
  /** Credits one turn costs on this model — never undefined on the wire. */
  chatCredits: number;
  /** True when the plan cannot pick it; still sent, so the picker can upsell. */
  locked: boolean;
};

export interface ChatCataloguePayload {
  models: ChatCatalogueModel[];
  flags: { modelPicker: boolean; feedback: boolean };
  /** What one turn costs on a model with no price of its own. */
  defaultChatCredits: number;
  /** The brain the back office currently points chat at. */
  defaultModelId: string;
  plan: PlanTier;
  /** Lets the client tell whether its catalogue is still current. */
  revision: string;
}

/**
 * The catalogue for one account.
 *
 * `ensureRuntimeConfig()` is awaited first and unconditionally: every read below
 * it — the model list, the flags, the plan prices behind `planMayUseModel` — is a
 * synchronous read of a table the back office patches in place, so on an instance
 * that has not loaded the settings cache they all return what shipped with the
 * build. That is precisely the "I added a model and nothing happened" report.
 */
export async function chatCataloguePayload(userId: string): Promise<ChatCataloguePayload> {
  await ensureRuntimeConfig();

  const [ctx, revision] = await Promise.all([getPlanContext(userId), configRevision()]);
  const flags = getFlags();
  const flat = actionCredits("chat.message");

  const models: ChatCatalogueModel[] = serializeChatModels().map((m) => ({
    ...m,
    chatCredits: m.chatCredits ?? flat,
    locked: !planMayUseModel(m, ctx.plan, planRank),
  }));

  return {
    models,
    flags: {
      modelPicker: flags.chatModelPickerEnabled,
      feedback: flags.chatFeedbackEnabled,
    },
    defaultChatCredits: flat,
    defaultModelId: getDefaultChatModelId(),
    plan: ctx.plan,
    revision,
  };
}
