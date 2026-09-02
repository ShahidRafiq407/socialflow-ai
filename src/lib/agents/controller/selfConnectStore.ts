// ============================================================================
// SELF-CONNECT STORE — parking a proposed connection, and reading the real answer
//
// Two jobs, both of which have to be true rather than convenient:
//
//   1. Park the proposal server-side. The confirm step then takes ONLY a request
//      id, so what the user approved is byte-for-byte what gets attached — the
//      model cannot swap the URL or slip in an extra header after the yes.
//   2. Read the answer out of the Message table. The approval is a row the user
//      created; the controller can neither write it nor fake it.
//
// Auth headers are stored encrypted (APP_ENCRYPTION_KEY) and the row is deleted
// the moment it is used, so a pending secret has a short, bounded life. Failures
// here are returned, not swallowed: a proposal the user cannot later confirm is
// worse than one that never happened.
// ============================================================================

import prisma from "@/lib/db";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { ensureControllerSchema } from "./schema";
import {
  CONNECT_REQUEST_CATEGORY,
  buildConnectRequestContent,
  headerKeysOf,
  parseConnectRequest,
  readApprovalFromReplies,
  toHeaderMap,
  type ApprovalVerdict,
  type ConnectRequestRecord,
  type HeaderPair,
} from "./selfConnect";

/** Replies scanned for an answer. Enough to survive a detour, not a whole chat. */
const MAX_REPLIES_SCANNED = 8;

export interface PendingConnect {
  id: string;
  sessionId: string | null;
  createdAt: Date;
  record: ConnectRequestRecord;
}

export interface ApprovalReading {
  verdict: ApprovalVerdict;
  /** How many messages the user has sent since the proposal. 0 = same turn. */
  replies: number;
}

/**
 * Parks one proposal. Refuses to store auth headers in the clear: without a
 * configured encryption key the user is told to set one, exactly as the Plugins
 * tab does, rather than having a bearer token written to a text column.
 */
export async function savePendingConnect(params: {
  workspaceId: string;
  sessionId?: string | null;
  name: string;
  url: string;
  reason?: string | null;
  toolNames?: string[];
  headers?: HeaderPair[];
}): Promise<{ saved: boolean; id?: string; error?: string }> {
  if (!params.workspaceId) return { saved: false, error: "No workspace." };

  const headers = params.headers || [];
  let secret: string | null = null;

  if (headers.length > 0) {
    if (!isEncryptionConfigured()) {
      return {
        saved: false,
        error:
          "APP_ENCRYPTION_KEY is not set on the server, so auth headers cannot be stored securely. " +
          "Add it to the environment variables, or connect a server that needs no auth headers.",
      };
    }
    secret = encryptSecret(JSON.stringify(toHeaderMap(headers)));
    if (!secret) return { saved: false, error: "Could not encrypt the auth headers." };
  }

  const content = buildConnectRequestContent({
    name: params.name,
    url: params.url,
    reason: params.reason,
    headerKeys: headerKeysOf(headers),
    toolNames: params.toolNames || [],
    secret,
  });
  if (!content) return { saved: false, error: "A connection needs both a name and a URL." };

  try {
    await ensureControllerSchema();
    const row = await (prisma as any).memory.create({
      data: {
        workspaceId: params.workspaceId,
        category: CONNECT_REQUEST_CATEGORY,
        content,
        importance: 1,
        pinned: false,
        source: "auto",
        sessionId: params.sessionId ?? null,
      },
    });
    return { saved: true, id: String(row.id) };
  } catch (err) {
    console.warn("[SelfConnect] savePendingConnect failed:", err instanceof Error ? err.message : err);
    return { saved: false, error: "Could not park the connection request. Try again." };
  }
}

/** Loads one parked proposal, scoped to its own workspace. */
export async function loadPendingConnect(
  workspaceId: string,
  requestId: string
): Promise<PendingConnect | null> {
  if (!workspaceId || !requestId) return null;
  try {
    await ensureControllerSchema();
    const row = await (prisma as any).memory.findFirst({
      where: { id: requestId, workspaceId, category: CONNECT_REQUEST_CATEGORY },
      select: { id: true, content: true, sessionId: true, createdAt: true },
    });
    if (!row) return null;

    const record = parseConnectRequest(String(row.content || ""));
    if (!record) return null;

    return {
      id: String(row.id),
      sessionId: row.sessionId ? String(row.sessionId) : null,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(0),
      record,
    };
  } catch (err) {
    console.warn("[SelfConnect] loadPendingConnect failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Single use: the row (and the secret in it) goes away once it has been acted on. */
export async function discardPendingConnect(workspaceId: string, requestId: string): Promise<void> {
  if (!workspaceId || !requestId) return;
  try {
    await (prisma as any).memory.deleteMany({
      where: { id: requestId, workspaceId, category: CONNECT_REQUEST_CATEGORY },
    });
  } catch {
    /* non-fatal — the TTL retires it anyway */
  }
}

/** Decrypts the parked header map. Empty when the proposal carried no auth. */
export function pendingHeaderMap(record: ConnectRequestRecord): Record<string, string> {
  if (!record.secret) return {};
  const decrypted = decryptSecret(record.secret);
  if (!decrypted) return {};
  try {
    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object") return {};
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v) headers[k] = v;
    }
    return headers;
  } catch {
    return {};
  }
}

/**
 * THE GATE. Reads the user's own messages sent after the proposal was parked and
 * returns what they said. `replies: 0` means they have not answered at all —
 * which is what the model trying to confirm inside the same turn looks like.
 * Any failure reads as "unclear", so a database problem can never be mistaken
 * for consent.
 */
export async function readApprovalAfter(
  sessionId: string | null,
  since: Date
): Promise<ApprovalReading> {
  if (!sessionId) return { verdict: "unclear", replies: 0 };
  try {
    const rows = await prisma.message.findMany({
      where: { chatSessionId: sessionId, role: "USER", createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      take: MAX_REPLIES_SCANNED,
      select: { content: true },
    });
    const replies = (rows || []).map((r) => String(r?.content || ""));
    return { verdict: readApprovalFromReplies(replies), replies: replies.length };
  } catch (err) {
    console.warn("[SelfConnect] readApprovalAfter failed:", err instanceof Error ? err.message : err);
    return { verdict: "unclear", replies: 0 };
  }
}
