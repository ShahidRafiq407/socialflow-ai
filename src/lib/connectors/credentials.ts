// ============================================================================
// SERVER-ONLY credential access for connectors. Deliberately NOT a
// "use server" file: these helpers must never be invokable as server actions
// from the browser. Only import from server-side code (API routes, chat
// tools, server actions).
// ============================================================================

import prisma from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export interface ResolvedConnection {
  providerKey: string;
  accountLabel: string | null;
  credentials: Record<string, string>;
}

/**
 * Returns the decrypted credential map for a workspace connector, or null
 * when the connector is not connected. Decrypted values stay on the server.
 */
export async function getConnectorCredentials(
  workspaceId: string,
  providerKey: string
): Promise<ResolvedConnection | null> {
  try {
    const row = await (prisma as any).userConnection.findUnique({
      where: { workspaceId_providerKey: { workspaceId, providerKey } },
    });
    if (!row || !row.credentials) return null;

    const raw = decryptSecret(row.credentials);
    if (!raw) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;

    const credentials: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v) credentials[k] = v;
    }
    if (Object.keys(credentials).length === 0) return null;

    return {
      providerKey,
      accountLabel: row.accountLabel || null,
      credentials,
    };
  } catch (error) {
    console.warn(`[getConnectorCredentials] ${providerKey} unavailable:`, error);
    return null;
  }
}

/**
 * Merges a few keys into a stored credential map and re-encrypts it.
 *
 * This exists for one reason: some providers rotate a refresh token every time
 * you use it (Canva does), and the old one stops working. Without writing the
 * new one back, the connector would break on its second call. Nothing here is
 * ever returned to the browser.
 */
export async function patchConnectorCredentials(
  workspaceId: string,
  providerKey: string,
  patch: Record<string, string>
): Promise<boolean> {
  const entries = Object.entries(patch).filter(([, v]) => typeof v === "string" && v);
  if (entries.length === 0) return false;

  try {
    const current = await getConnectorCredentials(workspaceId, providerKey);
    if (!current) return false;

    const merged = { ...current.credentials, ...Object.fromEntries(entries) };
    const { encryptSecret } = await import("@/lib/crypto");

    await (prisma as any).userConnection.update({
      where: { workspaceId_providerKey: { workspaceId, providerKey } },
      data: { credentials: encryptSecret(JSON.stringify(merged)) },
    });
    return true;
  } catch (error) {
    console.warn(`[patchConnectorCredentials] ${providerKey} not updated:`, error);
    return false;
  }
}
