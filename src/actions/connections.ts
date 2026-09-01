"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getConnector, CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { getGitHubAccount } from "@/lib/connectors/github";

// ============================================================================
// CONNECTOR CONNECTION ACTIONS
// Real connect → real API test → encrypted store. Credentials are write-only:
// the browser never receives them back, only `hasCredentials`.
// ============================================================================

export interface ConnectorView {
  providerKey: string;
  status: string; // "connected" | "failed" | "pending"
  accountLabel: string | null;
  hasCredentials: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
}

/** Verifies the caller owns the workspace before any write. */
async function assertWorkspaceOwnership(workspaceId: string): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return "Sign in required.";

  const workspace = await (prisma as any).workspace
    .findUnique({ where: { id: workspaceId }, select: { userId: true } })
    .catch(() => null);

  if (!workspace || workspace.userId !== userId) {
    return "You do not have access to this workspace.";
  }
  return null;
}

export async function listConnections(workspaceId: string): Promise<ConnectorView[]> {
  try {
    const rows = await (prisma as any).userConnection.findMany({
      where: { workspaceId },
    });
    const byKey = new Map<string, any>(rows.map((r: any) => [r.providerKey, r]));

    return CONNECTOR_REGISTRY.map((c) => {
      const row = byKey.get(c.key);
      return {
        providerKey: c.key,
        status: row?.status || "pending",
        accountLabel: row?.accountLabel || null,
        hasCredentials: Boolean(row?.credentials),
        lastVerifiedAt: row?.lastVerifiedAt ? new Date(row.lastVerifiedAt).toISOString() : null,
        lastError: row?.lastError || null,
      };
    });
  } catch (error: any) {
    console.warn("[listConnections] unavailable:", error);
    return CONNECTOR_REGISTRY.map((c) => ({
      providerKey: c.key,
      status: "pending",
      accountLabel: null,
      hasCredentials: false,
      lastVerifiedAt: null,
      lastError: null,
    }));
  }
}

/**
 * Runs the provider's real verification call. Returns the account label on
 * success. Add new providers here as they get API clients.
 */
async function verifyProvider(
  providerKey: string,
  credentials: Record<string, string>
): Promise<{ ok: boolean; accountLabel?: string; error?: string }> {
  if (providerKey === "github") {
    const res = await getGitHubAccount(credentials.personalAccessToken);
    return res.success
      ? { ok: true, accountLabel: res.account?.login ?? undefined }
      : { ok: false, error: res.error };
  }
  if (providerKey === "heygen") {
    const { getHeyGenAccount } = await import("@/lib/connectors/heygen");
    const res = await getHeyGenAccount(credentials.apiKey);
    if (!res.success) return { ok: false, error: res.error };
    const label =
      res.quota?.remaining != null ? `${res.quota.remaining} credits left` : "verified";
    return { ok: true, accountLabel: label };
  }
  return { ok: false, error: `Provider "${providerKey}" has no verification implemented yet.` };
}

export async function connectConnector(
  workspaceId: string,
  providerKey: string,
  fields: Record<string, string>
): Promise<{ success: boolean; error?: string; view?: ConnectorView }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  const connector = getConnector(providerKey);
  if (!connector) return { success: false, error: "Unknown connector." };

  try {
    const existing = await (prisma as any).userConnection
      .findUnique({
        where: { workspaceId_providerKey: { workspaceId, providerKey } },
      })
      .catch(() => null);

    // Credentials are write-only: keep stored values when a field is blank.
    const merged: Record<string, string> = {};
    let stored: Record<string, string> = {};
    if (existing?.credentials) {
      try {
        const raw = decryptSecret(existing.credentials);
        if (raw) stored = JSON.parse(raw);
      } catch {
        stored = {};
      }
    }

    for (const field of connector.fields) {
      const incoming = (fields?.[field.key] || "").trim();
      const value = incoming || stored[field.key] || "";
      if (field.required && !value) {
        return { success: false, error: `${field.label} is required.` };
      }
      if (value) merged[field.key] = value;
    }

    if (Object.keys(merged).length === 0) {
      return { success: false, error: "Enter your credentials first." };
    }

    const encrypted = encryptSecret(JSON.stringify(merged));
    if (!encrypted) {
      return {
        success: false,
        error:
          "APP_ENCRYPTION_KEY is not set on the server, so credentials cannot be stored securely. Add it to your environment variables and try again.",
      };
    }

    // REAL verification before we mark anything connected.
    const verification = await verifyProvider(providerKey, merged);

    await (prisma as any).userConnection.upsert({
      where: { workspaceId_providerKey: { workspaceId, providerKey } },
      create: {
        workspaceId,
        providerKey,
        authType: "api_key",
        credentials: encrypted,
        accountLabel: verification.ok ? verification.accountLabel || null : null,
        status: verification.ok ? "connected" : "failed",
        lastVerifiedAt: verification.ok ? new Date() : null,
        lastError: verification.ok ? null : verification.error || "Verification failed.",
      },
      update: {
        credentials: encrypted,
        accountLabel: verification.ok ? verification.accountLabel || null : null,
        status: verification.ok ? "connected" : "failed",
        lastVerifiedAt: verification.ok ? new Date() : null,
        lastError: verification.ok ? null : verification.error || "Verification failed.",
      },
    });

    revalidatePath("/dashboard/plugins");

    if (!verification.ok) {
      return { success: false, error: verification.error || "Verification failed." };
    }

    const views = await listConnections(workspaceId);
    return {
      success: true,
      view: views.find((v) => v.providerKey === providerKey) || undefined,
    };
  } catch (error: any) {
    console.error("[connectConnector] error:", error);
    return { success: false, error: error?.message || "Failed to connect." };
  }
}

/** Re-tests the stored credentials without changing them. */
export async function testConnector(
  workspaceId: string,
  providerKey: string
): Promise<{ success: boolean; error?: string; view?: ConnectorView }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  const connector = getConnector(providerKey);
  if (!connector) return { success: false, error: "Unknown connector." };

  try {
    const row = await (prisma as any).userConnection.findUnique({
      where: { workspaceId_providerKey: { workspaceId, providerKey } },
    });
    if (!row?.credentials) return { success: false, error: "Nothing connected yet." };

    const raw = decryptSecret(row.credentials);
    if (!raw) return { success: false, error: "Stored credentials could not be read. Re-enter them." };

    let credentials: Record<string, string> = {};
    try {
      credentials = JSON.parse(raw);
    } catch {
      return { success: false, error: "Stored credentials are invalid. Re-enter them." };
    }

    const verification = await verifyProvider(providerKey, credentials);

    await (prisma as any).userConnection
      .update({
        where: { workspaceId_providerKey: { workspaceId, providerKey } },
        data: verification.ok
          ? {
              status: "connected",
              accountLabel: verification.accountLabel || row.accountLabel,
              lastVerifiedAt: new Date(),
              lastError: null,
            }
          : { status: "failed", lastVerifiedAt: null, lastError: verification.error || "Connection test failed." },
      })
      .catch(() => null);

    revalidatePath("/dashboard/plugins");

    const views = await listConnections(workspaceId);
    return {
      success: verification.ok,
      error: verification.ok ? undefined : verification.error || "Connection test failed.",
      view: views.find((v) => v.providerKey === providerKey) || undefined,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || "Connection test failed." };
  }
}

export async function disconnectConnector(
  workspaceId: string,
  providerKey: string
): Promise<{ success: boolean; error?: string }> {
  const denied = await assertWorkspaceOwnership(workspaceId);
  if (denied) return { success: false, error: denied };

  if (!getConnector(providerKey)) return { success: false, error: "Unknown connector." };

  try {
    await (prisma as any).userConnection
      .delete({ where: { workspaceId_providerKey: { workspaceId, providerKey } } })
      .catch(() => null);

    revalidatePath("/dashboard/plugins");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to disconnect." };
  }
}

/** Server-side flag for the UI: whether secret encryption is configured. */
export async function connectionsEncryptionStatus(): Promise<boolean> {
  return isEncryptionConfigured();
}
