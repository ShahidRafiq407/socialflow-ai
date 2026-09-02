"use server";

import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import {
  WPConfig,
  testWPConnection,
  fetchWPCategories,
  fetchWPAuthors,
  fetchWPPostTypes,
} from "@/actions/wordpress";
import { getWordPressConfig } from "@/lib/wordpress/siteConfig";

/**
 * Real WordPress connection storage.
 *
 * The app password is encrypted with APP_ENCRYPTION_KEY and is never sent back
 * to the browser — reads only report `hasPassword`. Both the Article Writer and
 * the Lead Goal autopilot read this one record, so a site is connected once.
 *
 * Every export here is a public HTTP endpoint that takes a workspace id from the
 * caller, so each one first proves the signed-in user owns that workspace —
 * otherwise any tenant could read, overwrite or delete another tenant's site
 * connection just by guessing an id.
 */

async function ownsWorkspace(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;
  const { userId } = await auth();
  if (!userId) return false;

  const owned = await prisma.workspace
    .findFirst({ where: { id: workspaceId, userId }, select: { id: true } })
    .catch(() => null);

  return Boolean(owned);
}

const NOT_YOURS = "You do not have access to this workspace.";

function normalizeSiteUrl(raw: string): string {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface WordPressSiteView {
  connected: boolean;
  siteUrl: string;
  username: string;
  hasPassword: boolean;
  defaultStatus: string;
  defaultCategoryId: number | null;
  defaultAuthorId: number | null;
  postType: string;
  enableYoastSeo: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  encryptionConfigured: boolean;
}

const EMPTY_VIEW: WordPressSiteView = {
  connected: false,
  siteUrl: "",
  username: "",
  hasPassword: false,
  defaultStatus: "publish",
  defaultCategoryId: null,
  defaultAuthorId: null,
  postType: "posts",
  enableYoastSeo: true,
  lastVerifiedAt: null,
  lastError: null,
  encryptionConfigured: isEncryptionConfigured(),
};

export async function getWordPressSite(workspaceId: string): Promise<WordPressSiteView> {
  try {
    if (!(await ownsWorkspace(workspaceId))) {
      return { ...EMPTY_VIEW, encryptionConfigured: isEncryptionConfigured() };
    }

    const row = await (prisma as any).wordPressSite.findUnique({ where: { workspaceId } });
    if (!row) return { ...EMPTY_VIEW, encryptionConfigured: isEncryptionConfigured() };

    return {
      connected: Boolean(row.lastVerifiedAt),
      siteUrl: row.siteUrl || "",
      username: row.username || "",
      hasPassword: Boolean(row.appPassword),
      defaultStatus: row.defaultStatus || "publish",
      defaultCategoryId: row.defaultCategoryId ?? null,
      defaultAuthorId: row.defaultAuthorId ?? null,
      postType: row.postType || "posts",
      enableYoastSeo: row.enableYoastSeo !== false,
      lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toISOString() : null,
      lastError: row.lastError || null,
      encryptionConfigured: isEncryptionConfigured(),
    };
  } catch (error) {
    console.warn("[getWordPressSite] unavailable:", error);
    return { ...EMPTY_VIEW, encryptionConfigured: isEncryptionConfigured() };
  }
}

/**
 * Saves and immediately verifies the connection against the real site. A wrong
 * password fails here with the real reason — nothing is faked.
 */
export async function connectWordPressSite(
  workspaceId: string,
  data: {
    siteUrl: string;
    username: string;
    appPassword?: string;
    defaultStatus?: string;
    defaultCategoryId?: number | null;
    defaultAuthorId?: number | null;
    postType?: string;
    enableYoastSeo?: boolean;
  }
): Promise<{
  success: boolean;
  error?: string;
  site?: WordPressSiteView;
  categories?: { id: number; name: string }[];
  authors?: { id: number; name: string }[];
  postTypes?: { slug: string; name: string }[];
}> {
  const siteUrl = normalizeSiteUrl(data.siteUrl);
  const username = (data.username || "").trim();

  if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };
  if (!siteUrl) return { success: false, error: "Enter your WordPress site URL." };
  if (!username) return { success: false, error: "Enter the WordPress username." };

  try {
    const existing = await (prisma as any).wordPressSite
      .findUnique({ where: { workspaceId } })
      .catch(() => null);

    // Password is write-only: keep the stored one when the field is left blank
    let storedPassword: string | null = existing?.appPassword || null;
    if (data.appPassword && data.appPassword.trim()) {
      const raw = data.appPassword.trim();
      const enc = encryptSecret(raw);
      if (!enc) {
        return {
          success: false,
          error:
            "APP_ENCRYPTION_KEY is not set on the server, so the application password cannot be stored securely. Add it to your environment variables and try again.",
        };
      }
      storedPassword = enc;
    }

    if (!storedPassword) {
      return { success: false, error: "Enter the WordPress application password." };
    }

    const plainPassword = decryptSecret(storedPassword);
    if (!plainPassword) {
      return {
        success: false,
        error: "Stored password could not be read. Re-enter the application password.",
      };
    }

    const config: WPConfig = { siteUrl, username, appPassword: plainPassword };
    const ok = await testWPConnection(config);

    if (!ok) {
      await (prisma as any).wordPressSite
        .upsert({
          where: { workspaceId },
          create: {
            workspaceId,
            siteUrl,
            username,
            appPassword: storedPassword,
            lastError: "Authentication failed. Check the username and application password.",
          },
          update: {
            siteUrl,
            username,
            appPassword: storedPassword,
            lastVerifiedAt: null,
            lastError: "Authentication failed. Check the username and application password.",
          },
        })
        .catch(() => null);

      return {
        success: false,
        error:
          "WordPress rejected the credentials. Use an Application Password (Users → Profile → Application Passwords), not your login password.",
      };
    }

    const [categories, authors, postTypes] = await Promise.all([
      fetchWPCategories(config).catch(() => []),
      fetchWPAuthors(config).catch(() => []),
      fetchWPPostTypes(config).catch(() => []),
    ]);

    await (prisma as any).wordPressSite.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        siteUrl,
        username,
        appPassword: storedPassword,
        defaultStatus: data.defaultStatus || "publish",
        defaultCategoryId: data.defaultCategoryId ?? null,
        defaultAuthorId: data.defaultAuthorId ?? null,
        postType: data.postType || "posts",
        enableYoastSeo: data.enableYoastSeo !== false,
        lastVerifiedAt: new Date(),
        lastError: null,
      },
      update: {
        siteUrl,
        username,
        appPassword: storedPassword,
        ...(data.defaultStatus ? { defaultStatus: data.defaultStatus } : {}),
        ...(data.defaultCategoryId !== undefined ? { defaultCategoryId: data.defaultCategoryId } : {}),
        ...(data.defaultAuthorId !== undefined ? { defaultAuthorId: data.defaultAuthorId } : {}),
        ...(data.postType ? { postType: data.postType } : {}),
        ...(data.enableYoastSeo !== undefined ? { enableYoastSeo: data.enableYoastSeo } : {}),
        lastVerifiedAt: new Date(),
        lastError: null,
      },
    });

    revalidatePath("/dashboard/plugins");
    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/article-writer");

    return {
      success: true,
      site: await getWordPressSite(workspaceId),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      authors: authors.map((a) => ({ id: a.id, name: a.name })),
      postTypes,
    };
  } catch (error: any) {
    console.error("[connectWordPressSite] error:", error);
    return { success: false, error: error?.message || "Failed to connect to WordPress." };
  }
}

/** Re-tests the stored credentials without changing them. */
export async function testWordPressSite(workspaceId: string): Promise<{
  success: boolean;
  error?: string;
  lastVerifiedAt?: string;
}> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    const config = await getWordPressConfig(workspaceId);
    if (!config) {
      return { success: false, error: "No WordPress site connected yet." };
    }

    const ok = await testWPConnection({
      siteUrl: config.siteUrl,
      username: config.username,
      appPassword: config.appPassword,
    });

    const now = new Date();
    await (prisma as any).wordPressSite
      .update({
        where: { workspaceId },
        data: ok
          ? { lastVerifiedAt: now, lastError: null }
          : { lastVerifiedAt: null, lastError: "Connection test failed." },
      })
      .catch(() => null);

    revalidatePath("/dashboard/plugins");

    return ok
      ? { success: true, lastVerifiedAt: now.toISOString() }
      : {
          success: false,
          error: "WordPress did not accept the stored credentials. Re-enter the application password.",
        };
  } catch (error: any) {
    return { success: false, error: error?.message || "Connection test failed." };
  }
}

export async function disconnectWordPressSite(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ownsWorkspace(workspaceId))) return { success: false, error: NOT_YOURS };

    await (prisma as any).wordPressSite.delete({ where: { workspaceId } }).catch(() => null);
    revalidatePath("/dashboard/plugins");
    revalidatePath("/dashboard/goals");
    revalidatePath("/dashboard/article-writer");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to disconnect." };
  }
}

/** Categories / authors / post types for the connected site (settings dropdowns). */
export async function fetchWordPressTaxonomies(workspaceId: string): Promise<{
  success: boolean;
  categories: { id: number; name: string }[];
  authors: { id: number; name: string }[];
  postTypes: { slug: string; name: string }[];
  error?: string;
}> {
  const empty = { categories: [], authors: [], postTypes: [] };
  try {
    if (!(await ownsWorkspace(workspaceId))) {
      return { success: false, ...empty, error: NOT_YOURS };
    }

    const config = await getWordPressConfig(workspaceId);
    if (!config) return { success: false, ...empty, error: "No WordPress site connected." };

    const wp: WPConfig = {
      siteUrl: config.siteUrl,
      username: config.username,
      appPassword: config.appPassword,
    };

    const [categories, authors, postTypes] = await Promise.all([
      fetchWPCategories(wp).catch(() => []),
      fetchWPAuthors(wp).catch(() => []),
      fetchWPPostTypes(wp).catch(() => []),
    ]);

    return {
      success: true,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      authors: authors.map((a) => ({ id: a.id, name: a.name })),
      postTypes,
    };
  } catch (error: any) {
    return { success: false, ...empty, error: error?.message };
  }
}
