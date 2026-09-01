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
