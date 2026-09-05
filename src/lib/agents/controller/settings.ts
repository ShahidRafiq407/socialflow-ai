// ============================================================================
// CONTROLLER SETTINGS — PERSISTENCE
//
// Everything the user can tune about the Automate controller, persisted per
// workspace in ChatSettings. Read paths never throw: a workspace whose row (or
// whose table) does not exist yet gets defaults, so chat always works.
//
// The vocabulary itself lives in ./settingsShape (no database import) and is
// re-exported here, so server callers keep importing from one place while the
// chat UI can pull the same types and defaults without bundling `pg`.
// ============================================================================

import prisma from "@/lib/db";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { getDefaultChatModelId } from "./models";
import { ensureControllerSchema } from "./schema";
import { DEFAULT_CHAT_SETTINGS, normalizeChatSettings, type ChatSettings } from "./settingsShape";

export * from "./settingsShape";

/**
 * Defaults with the admin's live pick as the model.
 *
 * `DEFAULT_CHAT_SETTINGS.model` is the *shipped* id, baked in at build time. The
 * default a workspace should actually get is whatever the back office currently
 * points CHAT_CONTROLLER at, so a deployment that never ships a new build still
 * moves everyone onto the new brain.
 *
 * Exported because callers that race this module's reads against a timeout need
 * somewhere to fall back to, and falling back to `DEFAULT_CHAT_SETTINGS` hands the
 * browser the build-time id — the exact staleness this function exists to avoid.
 * Only safe to call after `ensureRuntimeConfig()` has been awaited somewhere on
 * the request; before that it returns the shipped id, same as the constant.
 */
export function liveDefaults(): ChatSettings {
  return { ...DEFAULT_CHAT_SETTINGS, model: getDefaultChatModelId(), modelPinned: false };
}

/**
 * Settings as the rest of the product should read them.
 *
 * The stored `model` is only authoritative when the user picked it. Otherwise it
 * is a copy of whatever the default was on the day some unrelated setting was
 * saved, and honouring it meant the back office's "default chat brain" only ever
 * reached workspaces that had never opened the settings panel — every established
 * account stayed on the id baked into an old build, which is the opposite of what
 * an admin pressing that switch is asking for.
 */
function withLiveModel(settings: ChatSettings): ChatSettings {
  if (settings.modelPinned) return settings;
  const live = getDefaultChatModelId();
  return settings.model === live ? settings : { ...settings, model: live };
}

/** Reads a workspace's settings, falling back to defaults on any failure. */
export async function getChatSettings(workspaceId: string): Promise<ChatSettings> {
  try {
    // The catalogue has to be loaded before `normalizeChatSettings` can judge a
    // stored model id. Without this, a request served by an instance that never
    // rendered an admin page sees a catalogue of one built-in model and rewrites
    // every custom pick back to the shipped default.
    await Promise.all([ensureControllerSchema(), ensureRuntimeConfig()]);
    const row = await (prisma as any).chatSettings.findUnique({ where: { workspaceId } });
    if (!row) return liveDefaults();
    return withLiveModel(normalizeChatSettings(row, liveDefaults()));
  } catch (err) {
    console.warn("[getChatSettings] falling back to defaults:", err instanceof Error ? err.message : err);
    return liveDefaults();
  }
}

/** Applies a partial patch on top of the stored settings and persists the result. */
export async function saveChatSettings(workspaceId: string, patch: unknown): Promise<ChatSettings> {
  // Same reason as the read: a PATCH is its own request, and validating the
  // posted model against a cold catalogue would reject a model the picker is
  // showing right now.
  await Promise.all([ensureControllerSchema(), ensureRuntimeConfig()]);
  const current = await getChatSettings(workspaceId);
  const next = normalizeChatSettings(patch, current);

  try {
    await (prisma as any).chatSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...next },
      update: next,
    });
  } catch (err) {
    console.error("[saveChatSettings] persist failed:", err instanceof Error ? err.message : err);
    throw new Error("Could not save chat settings.");
  }

  return next;
}
