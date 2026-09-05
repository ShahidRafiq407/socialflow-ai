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
import { MODEL_RATES } from "@/lib/billing/modelPricing";
import { BUILT_IN_CHAT_MODEL, listChatModels } from "@/lib/agents/controller/models";
import { actionCredits } from "@/lib/billing/actions";
import {
  MODEL_ROLE_KEYS,
  MODEL_ROLE_LABELS,
  ensureRuntimeConfig,
  modelForRole,
  type ModelRoleKey,
} from "./runtimeConfig";
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
}

export interface RoleAssignment {
  role: ModelRoleKey;
  label: string;
  /** What runs right now. */
  current: string;
  /** What runs with no admin override (env var or code default). */
  fallback: string;
  overridden: boolean;
}

export interface BuiltInRateRow {
  id: string;
  role: string;
  inputPerMTok: number;
  outputPerMTok: number;
  perImage?: number;
  perVideoSecond?: number;
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
    })),
    roles: MODEL_ROLE_KEYS.map((role) => ({
      role,
      label: MODEL_ROLE_LABELS[role],
      current: resolveRoleModel(role as ModelRole),
      fallback: defaultRoleModel(role as ModelRole),
      overridden: modelForRole(role) !== undefined,
    })),
    builtIn: Object.entries(MODEL_RATES).map(([id, rate]) => ({
      id,
      role: rate.role ?? "",
      inputPerMTok: rate.inputPerMTok,
      outputPerMTok: rate.outputPerMTok,
      perImage: rate.perImage,
      perVideoSecond: rate.perVideoSecond,
      ...usageFor(id),
    })),
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
  };
}
