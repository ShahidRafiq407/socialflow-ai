// ============================================================================
// ADMIN — MODELS VIEW
//
// One shape for the models screen: the rows the admin created, the rate card the
// meter prices against, and which model each agent role runs on right now — with
// the code default beside it so "reset" is never a mystery. The chat picker's
// live list is derived from the same rows by the controller catalogue.
// ============================================================================

import prisma from "@/lib/db";
import { defaultRoleModel, resolveRoleModel, type ModelRole } from "@/lib/agents/llm";
import { MODEL_RATES, allModelRates, hasRateOverride } from "@/lib/billing/modelPricing";
import { BUILT_IN_CHAT_MODEL, getDefaultChatModelId, listChatModels } from "@/lib/agents/controller/models";
import { actionCredits } from "@/lib/billing/actions";
import {
  MODEL_ROLE_KEYS,
  MODEL_ROLE_LABELS,
  describeManagedKeys,
  ensureRuntimeConfig,
  modelForRole,
  type ManagedKeyStatus,
  type ModelRoleKey,
} from "./runtimeConfig";
import { isEncryptionConfigured } from "@/lib/crypto";
import { providerKeyNames } from "@/lib/providers/registry";
import { ensureAdminSchema } from "./schema";

export interface AdminModelRow {
  id: string;
  label: string;
  blurb: string | null;
  provider: string;
  /** Endpoint override. Null means "use the provider's registry default". */
  baseUrl: string | null;
  /** Managed key name holding this row's credential. Null = provider default. */
  apiKeyRef: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  kind: string;
  inputPerMTok: number;
  outputPerMTok: number;
  cachedPerMTok: number | null;
  perImage: number | null;
  perVideoSecond: number | null;
  supportsThinking: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  tier: string;
  enabledForChat: boolean;
  chatCredits: number | null;
  minPlan: string | null;
  isDefaultChat: boolean;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Calls and cost in the last 30 days, from the meter. */
  calls30d: number;
  costMicros30d: number;
  /**
   * Jobs currently pointed at this row, derived by inverting the `ai.model.<ROLE>`
   * pointers. Not a column: the pointer is the only store the product reads at
   * request time, and a second copy here could disagree with it.
   */
  serves: ModelRoleKey[];
}

export interface RoleAssignment {
  role: ModelRoleKey;
  label: string;
  /** What runs right now. */
  current: string;
  /** What runs with no admin override (env var or code default). */
  fallback: string;
  /**
   * The explicit `ai.model.<ROLE>` pointer, or null when none is set. Separate from
   * `overridden` because the two can disagree: the chat brain honours a pointer only
   * if the row behind it is an enabled text model, so a pointer can exist and be
   * ignored — and "reset to default" must only be offered where there is a pointer
   * to clear.
   */
  pinnedTo: string | null;
  /** True when something other than the deployment default is running. */
  overridden: boolean;
}

export interface BuiltInRateRow {
  id: string;
  role: string;
  inputPerMTok: number;
  outputPerMTok: number;
  perImage?: number;
  perVideoSecond?: number;
  /** A catalogue row carrying this same id has replaced the shipped rate. */
  overridden: boolean;
  calls30d: number;
  costMicros30d: number;
}

export interface ModelsView {
  custom: AdminModelRow[];
  roles: RoleAssignment[];
  builtIn: BuiltInRateRow[];
  chatPicker: Array<{ id: string; label: string; chatCredits: number; minPlan: string | null; recommended: boolean; custom: boolean; provider: string }>;
  builtInChatModelId: string;
  flatChatCredits: number;
  /**
   * Connection status for the AI companies only, so the credential can be typed in
   * beside the model that needs it instead of on a separate screen. Carries a mask,
   * never a value — the same shape the keys screen already sends to the browser.
   */
  providerKeys: ManagedKeyStatus[];
  /** False when `APP_ENCRYPTION_KEY` is missing, so no key can be stored at all. */
  encryptionReady: boolean;
}

export async function getModelsView(): Promise<ModelsView> {
  await ensureAdminSchema();
  await ensureRuntimeConfig();
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [rows, usage] = await Promise.all([
    prisma.aiModel.findMany({ orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { label: "asc" }] }).catch(() => []),
    (async () => {
      const grouped = await prisma.usageEvent.groupBy({
        by: ["model"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { costMicros: true },
      });
      return grouped;
    })().catch(() => [] as Array<{ model: string; _count: { _all: number }; _sum: { costMicros: number | null } }>),
  ]);

  const usageFor = (id: string) => {
    const hit = usage.find((u) => u.model === id);
    return { calls30d: hit?._count._all ?? 0, costMicros30d: hit?._sum.costMicros ?? 0 };
  };

  const flat = actionCredits("chat.message");
  // The rates the meter will really charge: the shipped card with any catalogue row
  // of the same id on top. Read once, so every row on the screen is from one snapshot.
  const liveRates = allModelRates();

  // Invert the role pointers once: model id → the jobs it holds. Safe to read
  // synchronously here because `ensureRuntimeConfig()` above has already loaded them.
  const servesById = new Map<string, ModelRoleKey[]>();
  for (const role of MODEL_ROLE_KEYS) {
    const pinned = modelForRole(role);
    if (!pinned) continue;
    const list = servesById.get(pinned);
    if (list) list.push(role);
    else servesById.set(pinned, [role]);
  }

  const providerKeyNameSet = new Set(providerKeyNames());

  return {
    custom: rows.map((r) => ({
      id: r.id,
      label: r.label,
      blurb: r.blurb,
      provider: r.provider,
      baseUrl: r.baseUrl,
      apiKeyRef: r.apiKeyRef,
      contextWindow: r.contextWindow,
      maxOutputTokens: r.maxOutputTokens,
      kind: r.kind,
      inputPerMTok: r.inputPerMTok,
      outputPerMTok: r.outputPerMTok,
      cachedPerMTok: r.cachedPerMTok,
      perImage: r.perImage,
      perVideoSecond: r.perVideoSecond,
      supportsThinking: r.supportsThinking,
      supportsTools: r.supportsTools,
      supportsVision: r.supportsVision,
      tier: r.tier,
      enabledForChat: r.enabledForChat,
      chatCredits: r.chatCredits,
      minPlan: r.minPlan,
      isDefaultChat: r.isDefaultChat,
      sortOrder: r.sortOrder,
      archived: r.archived,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      ...usageFor(r.id),
      serves: servesById.get(r.id) ?? [],
    })),
    roles: MODEL_ROLE_KEYS.map((role) => {
      const fallback = defaultRoleModel(role as ModelRole);
      const pinnedTo = modelForRole(role) ?? null;
      // The chat's default brain is not simply the admin's pointer, so this column
      // cannot be one for CHAT_CONTROLLER. `setChatModelCatalog` refuses a pointer
      // whose row is disabled for chat or is an image model, and a catalogue row
      // flagged "default chat brain" moves the default with no pointer at all — so
      // asking `resolveRoleModel` answered with the request rather than the outcome,
      // and the screen named a brain no new chat was going to use.
      const current =
        role === "CHAT_CONTROLLER" ? getDefaultChatModelId() : resolveRoleModel(role as ModelRole);
      return {
        role,
        label: MODEL_ROLE_LABELS[role],
        current,
        fallback,
        pinnedTo,
        // Read off the outcome, not the pointer: a pointer set to the deployment
        // default changes nothing, and one the chat catalogue rejected changes nothing
        // either. Both used to show as "overridden".
        overridden: current !== fallback,
      };
    }),
    builtIn: Object.keys(MODEL_RATES).map((id) => {
      const rate = liveRates[id] ?? MODEL_RATES[id];
      return {
        id,
        role: rate.role ?? "",
        inputPerMTok: rate.inputPerMTok,
        outputPerMTok: rate.outputPerMTok,
        perImage: rate.perImage,
        perVideoSecond: rate.perVideoSecond,
        overridden: hasRateOverride(id),
        ...usageFor(id),
      };
    }),
    chatPicker: listChatModels().map((m) => ({
      id: m.id,
      label: m.label,
      chatCredits: m.chatCredits ?? flat,
      minPlan: m.minPlan ?? null,
      recommended: m.recommended === true,
      custom: m.custom === true,
      provider: m.provider || "vertex",
    })),
    builtInChatModelId: BUILT_IN_CHAT_MODEL.id,
    flatChatCredits: flat,
    providerKeys: describeManagedKeys().filter((k) => providerKeyNameSet.has(k.name)),
    encryptionReady: isEncryptionConfigured(),
  };
}
