/**
 * CMS PUBLISHING — workspace resolution and dispatch
 *
 * Turns the rows a workspace has saved into live `CmsTarget`s (secrets decrypted
 * on the server, never returned to the browser) and hands them to the right
 * provider. The article writer calls `publishToCmsTarget` and does not know or
 * care whether the far side is WordPress, Shopify or someone's Next.js handler.
 *
 * Two storage shapes are read, on purpose:
 *   - `UserConnection` rows keyed `cms:<provider>` — every target added from now on,
 *   - the older single `WordPressSite` row — so sites connected before this layer
 *     existed keep publishing without the user reconnecting anything.
 *
 * A plain server module, NOT `"use server"`: it handles decrypted credentials and
 * every export of a server-action file is a callable HTTP endpoint. The Clerk
 * ownership check lives in `src/actions/cmsTargets.ts`, which wraps these.
 */

import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import prisma from "@/lib/db";
import {
  CMS_CONNECTION_PREFIX,
  connectionKeyFor,
  getCmsProvider,
  providerKeyFromConnection,
} from "./registry";
import {
  type CmsContentType,
  type CmsProviderKey,
  type CmsPublishInput,
  type CmsPublishResult,
  type CmsPublishStatus,
  type CmsTarget,
  type CmsTargetMeta,
  type CmsVerifyResult,
} from "./types";

/** The pre-CMS WordPress row, which predates per-provider targets. */
export const LEGACY_WORDPRESS_TARGET_ID = "wp-site";

/** A target as the browser is allowed to see it: configuration, never secrets. */
export interface CmsTargetSummary {
  id: string;
  providerKey: CmsProviderKey;
  providerName: string;
  label: string;
  status: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
  contentTypes: CmsContentType[];
  statuses: CmsPublishStatus[];
  supportsSchema: boolean;
  supportsFeaturedImage: boolean;
  /** Non-secret configuration only — safe to redisplay in the connect form. */
  meta: CmsTargetMeta;
  /** Whether credentials are stored. The values themselves never leave the server. */
  hasCredentials: boolean;
  /** True for the legacy WordPressSite row, which has no per-provider settings. */
  legacy: boolean;
}

interface LoadedTarget {
  target: CmsTarget;
  lastVerifiedAt: Date | null;
  lastError: string | null;
  hasCredentials: boolean;
  legacy: boolean;
}

// ---------------------------------------------------------------------------
// PARSING
// ---------------------------------------------------------------------------

/** Stored meta is our own JSON, but it comes back as `unknown` from Prisma. */
function parseMeta(value: unknown): CmsTargetMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CmsTargetMeta;
}

function parseCredentials(stored: string | null | undefined): Record<string, string> {
  if (!stored) return {};
  const raw = decryptSecret(stored);
  if (!raw) return {};
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value) out[key] = value;
  }
  return out;
}

/** The old single WordPress row, presented as a target so publishing is uniform. */
async function loadLegacyWordPress(workspaceId: string): Promise<LoadedTarget | null> {
  try {
    const row = await (prisma as any).wordPressSite.findUnique({ where: { workspaceId } });
    if (!row?.siteUrl || !row?.username || !row?.appPassword) return null;

    const appPassword = decryptSecret(row.appPassword);
    let host = row.siteUrl;
    try {
      host = new URL(row.siteUrl).host;
    } catch {
      /* keep the raw value as the label */
    }

    return {
      target: {
        id: LEGACY_WORDPRESS_TARGET_ID,
        providerKey: "wordpress",
        label: host,
        status: appPassword ? row.lastVerifiedAt ? "connected" : "pending" : "error",
        meta: {
          siteUrl: row.siteUrl,
          postType: row.postType || "posts",
          // The old flag only ever meant "write SEO meta at all"; `universal`
          // fills every supported plugin's keys, `none` writes none.
          seoPlugin: row.enableYoastSeo === false ? "none" : "universal",
          defaultStatus: normalizeStatus(row.defaultStatus),
          defaultContentType: "post",
          defaultCategoryId: row.defaultCategoryId ?? null,
          defaultAuthorId: row.defaultAuthorId ?? null,
        },
        credentials: appPassword ? { username: row.username, appPassword } : {},
      },
      lastVerifiedAt: row.lastVerifiedAt ?? null,
      lastError:
        row.lastError ||
        (appPassword
          ? null
          : "The stored password could not be read. Set APP_ENCRYPTION_KEY, then reconnect the site."),
      hasCredentials: Boolean(appPassword),
      legacy: true,
    };
  } catch (error) {
    console.warn("[cms] legacy WordPress row unavailable:", error);
    return null;
  }
}

function normalizeStatus(value: unknown): CmsPublishStatus {
  const raw = String(value || "").toLowerCase();
  return raw === "draft" || raw === "pending" || raw === "publish"
    ? (raw as CmsPublishStatus)
    : "publish";
}

// ---------------------------------------------------------------------------
// LOADING
// ---------------------------------------------------------------------------

/**
 * Every publish target a workspace has, secrets decrypted.
 *
 * The legacy WordPress row is only included when the workspace has not connected
 * a `cms:wordpress` target, so a migrated site is not offered twice.
 */
async function loadAll(workspaceId: string): Promise<LoadedTarget[]> {
  const out: LoadedTarget[] = [];

  try {
    const rows = await (prisma as any).userConnection.findMany({
      where: { workspaceId, providerKey: { startsWith: CMS_CONNECTION_PREFIX } },
      orderBy: { createdAt: "asc" },
    });

    for (const row of rows || []) {
      const providerKey = providerKeyFromConnection(row.providerKey);
      if (!providerKey) continue; // a target for a provider this build no longer ships
      const provider = getCmsProvider(providerKey);
      if (!provider) continue;

      const credentials = parseCredentials(row.credentials);
      const meta = parseMeta(row.meta);
      const unreadable = Boolean(row.credentials) && Object.keys(credentials).length === 0;

      out.push({
        target: {
          id: String(row.id),
          providerKey,
          label: row.accountLabel || provider.name,
          status: unreadable ? "error" : String(row.status || "pending"),
          meta,
          credentials,
        },
        lastVerifiedAt: row.lastVerifiedAt ?? null,
        lastError: unreadable
          ? "The saved credentials could not be decrypted. Set APP_ENCRYPTION_KEY, then save them again."
          : row.lastError || null,
        hasCredentials: Object.keys(credentials).length > 0,
        legacy: false,
      });
    }
  } catch (error) {
    console.warn("[cms] connection rows unavailable:", error);
  }

  if (!out.some((t) => t.target.providerKey === "wordpress")) {
    const legacy = await loadLegacyWordPress(workspaceId);
    if (legacy) out.push(legacy);
  }

  return out;
}

/** The live targets, ready to publish through. Server-side callers only. */
export async function loadCmsTargets(workspaceId: string): Promise<CmsTarget[]> {
  return (await loadAll(workspaceId)).map((t) => t.target);
}

export async function loadCmsTarget(
  workspaceId: string,
  targetId: string
): Promise<CmsTarget | null> {
  const all = await loadAll(workspaceId);
  return all.find((t) => t.target.id === targetId)?.target || null;
}

/** The first usable target: a verified one if there is one, otherwise any. */
export async function resolveDefaultCmsTarget(workspaceId: string): Promise<CmsTarget | null> {
  const all = await loadAll(workspaceId);
  const usable = all.filter((t) => t.hasCredentials);
  const verified = usable.find((t) => t.target.status === "connected");
  return (verified || usable[0])?.target || null;
}

function summarise(loaded: LoadedTarget): CmsTargetSummary | null {
  const provider = getCmsProvider(loaded.target.providerKey);
  if (!provider) return null;

  // Only fields the provider declares non-secret may be echoed back.
  const readable: CmsTargetMeta = { ...loaded.target.meta };
  for (const field of provider.fields) {
    if (field.secret) delete (readable as any)[field.key];
  }

  return {
    id: loaded.target.id,
    providerKey: loaded.target.providerKey,
    providerName: provider.name,
    label: loaded.target.label,
    status: loaded.target.status,
    lastVerifiedAt: loaded.lastVerifiedAt ? loaded.lastVerifiedAt.toISOString() : null,
    lastError: loaded.lastError,
    contentTypes: [...provider.contentTypes],
    statuses: [...provider.statuses],
    supportsSchema: provider.supportsSchema,
    supportsFeaturedImage: provider.supportsFeaturedImage,
    meta: readable,
    hasCredentials: loaded.hasCredentials,
    legacy: loaded.legacy,
  };
}

/** What the dashboard renders. Contains no credentials by construction. */
export async function listCmsTargetSummaries(workspaceId: string): Promise<CmsTargetSummary[]> {
  const all = await loadAll(workspaceId);
  return all.map(summarise).filter((s): s is CmsTargetSummary => s !== null);
}

// ---------------------------------------------------------------------------
// DISPATCH
// ---------------------------------------------------------------------------

/**
 * Coerces the request to what the platform can actually do, and says so.
 *
 * A platform that has no pending-review state should not silently publish, and a
 * post-only platform should not fail an otherwise valid page request — both get
 * the nearest supported value plus a warning the user sees on the result.
 */
export function resolvePublishOptions(
  providerKey: CmsProviderKey,
  requested: { contentType: CmsContentType; status: CmsPublishStatus }
): { contentType: CmsContentType; status: CmsPublishStatus; warnings: string[] } {
  const provider = getCmsProvider(providerKey);
  if (!provider) return { ...requested, warnings: [] };

  const warnings: string[] = [];
  let contentType = requested.contentType;
  let status = requested.status;

  if (!provider.contentTypes.includes(contentType)) {
    const fallback = provider.contentTypes[0] || "post";
    warnings.push(`${provider.name} cannot create a ${contentType}, so a ${fallback} was created.`);
    contentType = fallback;
  }
  if (!provider.statuses.includes(status)) {
    // Never silently escalate to live: fall back to the most private state offered.
    const fallback: CmsPublishStatus =
      provider.statuses.find((s) => s === "draft") ||
      provider.statuses.find((s) => s === "pending") ||
      provider.statuses[0] ||
      "draft";
    warnings.push(
      `${provider.name} has no "${status}" state, so it was saved as ${fallback} instead.`
    );
    status = fallback;
  }

  return { contentType, status, warnings };
}

/** Records the outcome so the dashboard can show why a target stopped working. */
async function recordOutcome(
  workspaceId: string,
  target: CmsTarget,
  outcome: { ok: boolean; error?: string | null; meta?: Partial<CmsTargetMeta> }
): Promise<void> {
  const data: Record<string, any> = {
    status: outcome.ok ? "connected" : "error",
    lastError: outcome.ok ? null : (outcome.error || "").slice(0, 1000) || null,
    ...(outcome.ok ? { lastVerifiedAt: new Date() } : {}),
  };

  try {
    if (target.id === LEGACY_WORDPRESS_TARGET_ID) {
      // The legacy row has no status column; only the two audit fields.
      await (prisma as any).wordPressSite.update({
        where: { workspaceId },
        data: { lastError: data.lastError, ...(outcome.ok ? { lastVerifiedAt: new Date() } : {}) },
      });
      return;
    }
    if (outcome.meta && Object.keys(outcome.meta).length > 0) {
      data.meta = { ...target.meta, ...outcome.meta };
    }
    await (prisma as any).userConnection.update({ where: { id: target.id }, data });
  } catch (error) {
    // A failed audit write must never turn a successful publish into an error.
    console.warn("[cms] could not record the target outcome:", error);
  }
}

/** Checks the credentials against the live platform and stores what it learns. */
export async function verifyCmsTarget(
  workspaceId: string,
  targetId: string
): Promise<CmsVerifyResult> {
  const target = await loadCmsTarget(workspaceId, targetId);
  if (!target) return { ok: false, error: "That publishing target no longer exists." };

  const provider = getCmsProvider(target.providerKey);
  if (!provider) return { ok: false, error: "This build no longer supports that platform." };

  const result = await provider.verify(target);
  await recordOutcome(workspaceId, target, {
    ok: result.ok,
    error: result.error,
    meta: result.meta,
  });
  return result;
}

/**
 * Publishes one article to one target.
 *
 * Every failure path returns `success: false` with a sentence the user can act
 * on — a thrown error here would surface as an opaque 500 in the article writer.
 */
export async function publishToCmsTarget(
  workspaceId: string,
  targetId: string,
  input: CmsPublishInput
): Promise<CmsPublishResult & { targetId: string; providerKey?: CmsProviderKey; label?: string }> {
  const target = await loadCmsTarget(workspaceId, targetId);
  if (!target) {
    return { success: false, error: "That publishing target no longer exists.", targetId };
  }
  if (Object.keys(target.credentials).length === 0) {
    return {
      success: false,
      error: `${target.label} has no readable credentials. Reconnect it before publishing.`,
      targetId,
      providerKey: target.providerKey,
      label: target.label,
    };
  }

  const provider = getCmsProvider(target.providerKey);
  if (!provider) {
    return {
      success: false,
      error: "This build no longer supports that platform.",
      targetId,
      providerKey: target.providerKey,
      label: target.label,
    };
  }

  const resolved = resolvePublishOptions(target.providerKey, {
    contentType: input.contentType,
    status: input.status,
  });

  let result: CmsPublishResult;
  try {
    result = await provider.publish(target, {
      ...input,
      contentType: resolved.contentType,
      status: resolved.status,
    });
  } catch (error: any) {
    result = { success: false, error: error?.message || `${provider.name} publishing failed.` };
  }

  await recordOutcome(workspaceId, target, { ok: result.success, error: result.error });

  return {
    ...result,
    warnings: [...resolved.warnings, ...(result.warnings || [])],
    targetId: target.id,
    providerKey: target.providerKey,
    label: target.label,
  };
}

// ---------------------------------------------------------------------------
// SAVING
// ---------------------------------------------------------------------------

export interface SaveCmsTargetInput {
  providerKey: CmsProviderKey;
  /** Raw form values keyed by `CmsField.key`. A blank secret keeps the stored one. */
  values: Record<string, string>;
  label?: string;
  /** Publishing defaults the writer pre-selects. Not credentials. */
  defaults?: {
    contentType?: CmsContentType;
    status?: CmsPublishStatus;
    categoryId?: number | null;
    authorId?: number | null;
  };
}

export interface SaveCmsTargetResult {
  success: boolean;
  error?: string;
  targetId?: string;
  /** Present whenever verification ran, so the UI can show what the platform said. */
  verify?: CmsVerifyResult;
}

/**
 * Creates or updates one target, then proves it works.
 *
 * The row is written even when verification fails — the same shape the Plugins
 * tab uses — so the user keeps their typing and the failure is recorded on the
 * row instead of vanishing with the form.
 */
export async function saveCmsTarget(
  workspaceId: string,
  input: SaveCmsTargetInput
): Promise<SaveCmsTargetResult> {
  const provider = getCmsProvider(input.providerKey);
  if (!provider) return { success: false, error: "Unknown publishing platform." };

  const connectionKey = connectionKeyFor(input.providerKey);

  try {
    const existing = await (prisma as any).userConnection
      .findUnique({ where: { workspaceId_providerKey: { workspaceId, providerKey: connectionKey } } })
      .catch(() => null);

    const storedCredentials = parseCredentials(existing?.credentials);
    const storedMeta = parseMeta(existing?.meta);

    const credentials: Record<string, string> = {};
    const meta: CmsTargetMeta = { ...storedMeta };

    for (const field of provider.fields) {
      // A secret never lands in readable meta, whatever the declaration says.
      const bucket = field.secret ? "credentials" : field.store;
      const incoming = String(input.values?.[field.key] ?? "").trim();
      const previous =
        bucket === "credentials"
          ? storedCredentials[field.key] || ""
          : String((storedMeta as any)[field.key] ?? "");
      const value = incoming || previous;

      if (field.required && !value) {
        return { success: false, error: `${field.label} is required.` };
      }
      if (!value) {
        if (bucket === "meta") delete (meta as any)[field.key];
        continue;
      }
      if (bucket === "credentials") credentials[field.key] = value;
      else (meta as any)[field.key] = value;
    }

    if (input.defaults) {
      if (input.defaults.contentType) meta.defaultContentType = input.defaults.contentType;
      if (input.defaults.status) meta.defaultStatus = input.defaults.status;
      if (input.defaults.categoryId !== undefined) meta.defaultCategoryId = input.defaults.categoryId;
      if (input.defaults.authorId !== undefined) meta.defaultAuthorId = input.defaults.authorId;
    }

    let encrypted: string | null = null;
    if (Object.keys(credentials).length > 0) {
      encrypted = encryptSecret(JSON.stringify(credentials));
      if (!encrypted) {
        return {
          success: false,
          error:
            "APP_ENCRYPTION_KEY is not set on the server, so these credentials cannot be stored securely. Add it to your environment variables and try again.",
        };
      }
    } else if (!isEncryptionConfigured()) {
      return {
        success: false,
        error:
          "APP_ENCRYPTION_KEY is not set on the server, so publishing credentials cannot be stored securely.",
      };
    }

    // Prove it works before anything is marked connected.
    const candidate: CmsTarget = {
      id: existing?.id || "pending",
      providerKey: input.providerKey,
      label: input.label?.trim() || provider.name,
      status: "pending",
      meta,
      credentials,
    };

    let verification: CmsVerifyResult;
    try {
      verification = await provider.verify(candidate);
    } catch (error: any) {
      verification = { ok: false, error: error?.message || `${provider.name} could not be reached.` };
    }

    const finalMeta: CmsTargetMeta = { ...meta, ...(verification.meta || {}) };
    const label = input.label?.trim() || verification.label || provider.name;

    const row = await (prisma as any).userConnection.upsert({
      where: { workspaceId_providerKey: { workspaceId, providerKey: connectionKey } },
      create: {
        workspaceId,
        providerKey: connectionKey,
        authType: "api_key",
        credentials: encrypted,
        accountLabel: label,
        status: verification.ok ? "connected" : "failed",
        lastVerifiedAt: verification.ok ? new Date() : null,
        lastError: verification.ok ? null : (verification.error || "Verification failed.").slice(0, 1000),
        meta: finalMeta as any,
      },
      update: {
        ...(encrypted ? { credentials: encrypted } : {}),
        accountLabel: label,
        status: verification.ok ? "connected" : "failed",
        lastVerifiedAt: verification.ok ? new Date() : null,
        lastError: verification.ok ? null : (verification.error || "Verification failed.").slice(0, 1000),
        meta: finalMeta as any,
      },
    });

    return {
      success: verification.ok,
      error: verification.ok ? undefined : verification.error || "Verification failed.",
      targetId: row?.id ? String(row.id) : undefined,
      verify: verification,
    };
  } catch (error: any) {
    console.error("[cms] saveCmsTarget failed:", error);
    return { success: false, error: error?.message || "The publishing target could not be saved." };
  }
}

/** Removes a target. The legacy WordPress row is deleted from its own table. */
export async function deleteCmsTarget(
  workspaceId: string,
  targetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (targetId === LEGACY_WORDPRESS_TARGET_ID) {
      await (prisma as any).wordPressSite.deleteMany({ where: { workspaceId } });
      return { success: true };
    }
    // Scoped by workspace as well as id so an id from another workspace cannot delete.
    const res = await (prisma as any).userConnection.deleteMany({
      where: { id: targetId, workspaceId, providerKey: { startsWith: CMS_CONNECTION_PREFIX } },
    });
    if (!res?.count) return { success: false, error: "That publishing target no longer exists." };
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "The target could not be removed." };
  }
}
