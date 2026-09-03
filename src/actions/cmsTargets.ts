"use server";

// ============================================================================
// PUBLISHING TARGET ACTIONS
//
// The browser's only door into the CMS layer. WordPress, Shopify and hand-coded
// sites all come through here, and the form that collects their credentials is
// drawn from `providers` — nothing about a platform is hard-coded in the UI.
//
// Every export of a "use server" file is a callable HTTP endpoint, so each one
// re-checks that the caller owns the workspace. Credentials are write-only: they
// go in, and only `hasCredentials` ever comes back.
// ============================================================================

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isEncryptionConfigured } from "@/lib/crypto";
import prisma from "@/lib/db";
import {
  deleteCmsTarget,
  listCmsTargetSummaries,
  saveCmsTarget,
  verifyCmsTarget,
  type CmsTargetSummary,
  type SaveCmsTargetInput,
} from "@/lib/cms";
import { describeCmsProviders, isCmsProviderKey, type CmsProviderDescriptor } from "@/lib/cms/registry";
import type { CmsContentType, CmsPublishStatus, CmsVerifyResult } from "@/lib/cms/types";

export interface PublishTargetsView {
  targets: CmsTargetSummary[];
  providers: CmsProviderDescriptor[];
  /** False when APP_ENCRYPTION_KEY is missing, so the UI can say why saving is blocked. */
  encryptionReady: boolean;
}

/** Verifies the caller owns the workspace before any read of secrets or write. */
async function assertWorkspaceOwnership(workspaceId: string): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return "Sign in required.";
  if (!workspaceId) return "No workspace selected.";

  const workspace = await (prisma as any).workspace
    .findUnique({ where: { id: workspaceId }, select: { userId: true } })
    .catch(() => null);

  if (!workspace || workspace.userId !== userId) {
    return "You do not have access to this workspace.";
  }
  return null;
}

export async function listPublishTargets(workspaceId: string): Promise<PublishTargetsView> {
  const providers = describeCmsProviders();
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { targets: [], providers, encryptionReady: isEncryptionConfigured() };

  return {
    targets: await listCmsTargetSummaries(workspaceId),
    providers,
    encryptionReady: isEncryptionConfigured(),
  };
}

export async function savePublishTarget(
  workspaceId: string,
  input: {
    providerKey: string;
    values: Record<string, string>;
    label?: string;
    defaults?: {
      contentType?: CmsContentType;
      status?: CmsPublishStatus;
      categoryId?: number | null;
      authorId?: number | null;
    };
  }
): Promise<{ success: boolean; error?: string; view?: PublishTargetsView }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  if (!isCmsProviderKey(input?.providerKey)) {
    return { success: false, error: "Unknown publishing platform." };
  }

  const payload: SaveCmsTargetInput = {
    providerKey: input.providerKey,
    values: input.values || {},
    label: input.label,
    defaults: input.defaults,
  };

  const result = await saveCmsTarget(workspaceId, payload);

  revalidatePath("/dashboard/article-writer");
  revalidatePath("/dashboard/plugins");

  return {
    success: result.success,
    error: result.error,
    view: await listPublishTargets(workspaceId),
  };
}

/** Re-tests stored credentials without changing them. */
export async function verifyPublishTarget(
  workspaceId: string,
  targetId: string
): Promise<{ success: boolean; error?: string; label?: string; view?: PublishTargetsView }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  let result: CmsVerifyResult;
  try {
    result = await verifyCmsTarget(workspaceId, targetId);
  } catch (error: any) {
    result = { ok: false, error: error?.message || "The check could not be completed." };
  }

  revalidatePath("/dashboard/article-writer");

  return {
    success: result.ok,
    error: result.ok ? undefined : result.error || "The platform did not accept the credentials.",
    label: result.label,
    view: await listPublishTargets(workspaceId),
  };
}

export async function removePublishTarget(
  workspaceId: string,
  targetId: string
): Promise<{ success: boolean; error?: string; view?: PublishTargetsView }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  const result = await deleteCmsTarget(workspaceId, targetId);

  revalidatePath("/dashboard/article-writer");
  revalidatePath("/dashboard/plugins");

  return { ...result, view: await listPublishTargets(workspaceId) };
}
