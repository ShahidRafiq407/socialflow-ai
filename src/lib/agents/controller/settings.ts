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
import { ensureControllerSchema } from "./schema";
import { DEFAULT_CHAT_SETTINGS, normalizeChatSettings, type ChatSettings } from "./settingsShape";

export * from "./settingsShape";

/** Reads a workspace's settings, falling back to defaults on any failure. */
export async function getChatSettings(workspaceId: string): Promise<ChatSettings> {
  try {
    await ensureControllerSchema();
    const row = await (prisma as any).chatSettings.findUnique({ where: { workspaceId } });
    if (!row) return { ...DEFAULT_CHAT_SETTINGS };
    return normalizeChatSettings(row);
  } catch (err) {
    console.warn("[getChatSettings] falling back to defaults:", err instanceof Error ? err.message : err);
    return { ...DEFAULT_CHAT_SETTINGS };
  }
}

/** Applies a partial patch on top of the stored settings and persists the result. */
export async function saveChatSettings(workspaceId: string, patch: unknown): Promise<ChatSettings> {
  await ensureControllerSchema();
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
