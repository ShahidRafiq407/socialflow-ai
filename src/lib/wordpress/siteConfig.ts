import prisma from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { WPConfig } from "@/actions/wordpress";

/**
 * Decrypted WordPress credentials for the stored connection.
 *
 * This deliberately does NOT live in `src/actions/wordpressSite.ts`: every
 * export of a `"use server"` file is a callable HTTP endpoint, and this
 * function returns a plaintext application password. Keeping it in a plain
 * server module means only server code that imports it can reach it.
 *
 * Callers that run on behalf of a signed-in user must check workspace
 * ownership themselves; the autopilot cron calls it with a workspace id it
 * already resolved from the database.
 */
export type StoredWordPressConfig = WPConfig & {
  defaultStatus: string;
  defaultCategoryId: number | null;
  defaultAuthorId: number | null;
  postType: string;
  enableYoastSeo: boolean;
};

export async function getWordPressConfig(
  workspaceId: string
): Promise<StoredWordPressConfig | null> {
  try {
    const row = await (prisma as any).wordPressSite.findUnique({ where: { workspaceId } });
    if (!row?.siteUrl || !row?.username || !row?.appPassword) return null;

    const appPassword = decryptSecret(row.appPassword);
    if (!appPassword) return null;

    return {
      siteUrl: row.siteUrl,
      username: row.username,
      appPassword,
      defaultStatus: row.defaultStatus || "publish",
      defaultCategoryId: row.defaultCategoryId ?? null,
      defaultAuthorId: row.defaultAuthorId ?? null,
      postType: row.postType || "posts",
      enableYoastSeo: row.enableYoastSeo !== false,
    };
  } catch (error) {
    console.warn("[getWordPressConfig] unavailable:", error);
    return null;
  }
}
