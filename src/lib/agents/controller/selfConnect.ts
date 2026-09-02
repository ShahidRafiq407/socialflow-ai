// ============================================================================
// SELF-CONNECT — proposing a new tool server, and reading the human's answer
//
// The controller can attach an MCP server to this workspace mid-conversation,
// so a capability the user asks for can exist by the next message instead of
// after a trip to the Plugins tab. That is a real privilege: it points this
// product at an outside host and hands that host the user's auth headers. So it
// is split into two calls with a human in between:
//
//   1. propose_tool_connection — validate the URL, connect once to list what the
//      server actually exposes, park the request. Nothing is attached.
//   2. connect_tool_server     — only proceeds once the USER has answered yes.
//
// The gate lives in readApproval + the Message table, NOT in the model's own
// claim that permission was granted: step 2 re-reads the user's real reply out
// of the database, so "they said yes" can never be asserted by the same thing
// that is asking for the permission. Everything here fails closed — silence, a
// changed subject, or a reply we cannot read all mean "not yet".
//
// Pure by design (no prisma, no crypto, no network) so every rule is unit
// testable. The database half lives in selfConnectStore.ts.
// ============================================================================

/** Parked requests are stored as system rows, never as remembered facts. */
export const CONNECT_REQUEST_CATEGORY = "connect_request";

/** Consent is for this conversation, not forever. */
export const CONNECT_REQUEST_TTL_MS = 15 * 60 * 1000;

/** Auth headers one proposal may carry. More than this is a config file. */
export const MAX_CONNECT_HEADERS = 6;

/**
 * A yes/no answer is short. Past this, treat the message as the user talking
 * about something else rather than mining consent out of a paragraph.
 */
export const MAX_APPROVAL_CHARS = 160;

const MAX_NAME_CHARS = 40;
const MAX_URL_CHARS = 400;
const MAX_REASON_CHARS = 240;
const MAX_HEADER_KEY_CHARS = 80;
const MAX_HEADER_VALUE_CHARS = 4096;
const MAX_TOOL_NAME_CHARS = 80;
const MAX_TOOL_NAMES = 50;
const MAX_TOOLS_SHOWN = 12;

export type ApprovalVerdict = "approved" | "declined" | "unclear";

export interface HeaderPair {
  key: string;
  value: string;
}

/** One parked proposal: exactly what will be attached if the user says yes. */
export interface ConnectRequestRecord {
  name: string;
  url: string;
  reason: string;
  /** Header names only. Values never reach a tool result or the prompt. */
  headerKeys: string[];
  /** What the server exposed when the proposal was made. */
  toolNames: string[];
  /** Opaque ciphertext for the header map, or null when no auth is needed. */
  secret: string | null;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Accepts either shape a model tends to emit — `[{key, value}]` or a plain
 * `{Authorization: "Bearer …"}` object — and returns a trimmed, deduplicated,
 * capped list. Values are trimmed but never whitespace-collapsed: a token is
 * not prose.
 */
export function normalizeHeaders(raw: unknown): HeaderPair[] {
  const pairs: HeaderPair[] = [];

  const push = (key: unknown, value: unknown) => {
    if (pairs.length >= MAX_CONNECT_HEADERS) return;
    const k = clean(key, MAX_HEADER_KEY_CHARS);
    const v = String(value ?? "").trim().slice(0, MAX_HEADER_VALUE_CHARS);
    if (!k || !v) return;
    if (pairs.some((p) => p.key.toLowerCase() === k.toLowerCase())) return;
    pairs.push({ key: k, value: v });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        push((item as any).key ?? (item as any).name, (item as any).value);
      }
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) push(k, v);
  }

  return pairs;
}

export function headerKeysOf(headers: HeaderPair[]): string[] {
  return headers.map((h) => h.key);
}

export function toHeaderMap(headers: HeaderPair[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) map[h.key] = h.value;
  return map;
}

/**
 * Serializes one parked proposal. Returns "" when there is nothing coherent to
 * park (no name or no URL), so the caller stores nothing rather than a stub the
 * user could later be asked to approve.
 */
export function buildConnectRequestContent(rec: {
  name: string;
  url: string;
  reason?: string | null;
  headerKeys?: string[] | null;
  toolNames?: string[] | null;
  secret?: string | null;
}): string {
  const name = clean(rec.name, MAX_NAME_CHARS);
  const url = clean(rec.url, MAX_URL_CHARS);
  if (!name || !url) return "";

  return JSON.stringify({
    kind: CONNECT_REQUEST_CATEGORY,
    name,
    url,
    reason: clean(rec.reason, MAX_REASON_CHARS),
    headerKeys: (rec.headerKeys || [])
      .map((k) => clean(k, MAX_HEADER_KEY_CHARS))
      .filter(Boolean)
      .slice(0, MAX_CONNECT_HEADERS),
    toolNames: (rec.toolNames || [])
      .map((t) => clean(t, MAX_TOOL_NAME_CHARS))
      .filter(Boolean)
      .slice(0, MAX_TOOL_NAMES),
    secret: typeof rec.secret === "string" && rec.secret ? rec.secret : null,
  });
}

/**
 * Reads a stored row back. The `kind` marker is required, so a row from any of
 * the other system categories sharing this table (outcomes, playbooks, billing)
 * can never be mistaken for a pending connection.
 */
export function parseConnectRequest(content: string): ConnectRequestRecord | null {
  const raw = (content || "").trim();
  if (!raw.startsWith("{")) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || parsed.kind !== CONNECT_REQUEST_CATEGORY) return null;

  const name = clean(parsed.name, MAX_NAME_CHARS);
  const url = clean(parsed.url, MAX_URL_CHARS);
  if (!name || !url) return null;

  return {
    name,
    url,
    reason: clean(parsed.reason, MAX_REASON_CHARS),
    headerKeys: Array.isArray(parsed.headerKeys)
      ? parsed.headerKeys.map((k: unknown) => clean(k, MAX_HEADER_KEY_CHARS)).filter(Boolean)
      : [],
    toolNames: Array.isArray(parsed.toolNames)
      ? parsed.toolNames.map((t: unknown) => clean(t, MAX_TOOL_NAME_CHARS)).filter(Boolean)
      : [],
    secret: typeof parsed.secret === "string" && parsed.secret ? parsed.secret : null,
  };
}

/** A parked proposal past its TTL is dead: re-propose rather than reuse consent. */
export function isConnectRequestExpired(
  createdAt: Date | number | null | undefined,
  now: number = Date.now(),
  ttlMs: number = CONNECT_REQUEST_TTL_MS
): boolean {
  if (createdAt === null || createdAt === undefined) return true;
  const ms = createdAt instanceof Date ? createdAt.getTime() : Number(createdAt);
  if (!Number.isFinite(ms)) return true;
  return now - ms > ttlMs;
}

// ---------------------------------------------------------------------------
// Reading the answer
//
// The user answers in whatever they actually speak, so both lists carry English
// and Roman Urdu. Deliberately NOT treated as a yes: bare "ha", "na" and "ya" —
// in Roman Urdu they land inside ordinary sentences ("ya kia hai", "theek hai
// na") far too often to spend a workspace's credentials on. A user who types
// one of those simply gets asked again, which is the cheap failure.
// ---------------------------------------------------------------------------

const DECLINE_PHRASES = [
  "no", "nope", "nahi", "nahin", "nai", "mat", "mat karo", "mat kro",
  "cancel", "cancelled", "ruko", "ruk", "stop", "dont", "do not",
  "not now", "abhi nahi", "abhi mat", "later", "baad me", "baad mein",
  "skip", "wait", "hold on", "chor do", "chhor do", "chhod do",
  "reject", "decline", "forget it", "never mind", "nevermind",
];

const APPROVE_PHRASES = [
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "okey",
  "haan", "han", "hn", "hanji", "ji", "bilkul", "zaroor", "zarur",
  "theek", "thik", "sahi", "chalo",
  "karo", "kro", "kar do", "kardo", "kr do", "krdo", "kardein", "kar dein", "krdein",
  "karna chahiye", "krna chahiye", "krna chye", "karna chye",
  "connect", "add it", "add karo", "approve", "approved", "confirm", "confirmed",
  "go ahead", "do it", "proceed", "please do",
];

/** Lowercased, apostrophes dropped, punctuation to spaces, padded for whole-word matching. */
function normalizeForMatch(text: string): string {
  const squashed = String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${squashed} `;
}

function containsPhrase(padded: string, phrase: string): boolean {
  return padded.includes(` ${phrase} `);
}

/**
 * Turns one user message into a verdict. A decline anywhere in the message wins
 * over an approval in the same message ("haan mat karo" is a no), and anything
 * that is neither is "unclear" — which the caller must treat as "not yet".
 */
export function readApproval(text: string | null | undefined): ApprovalVerdict {
  const raw = String(text || "").trim();
  if (!raw || raw.length > MAX_APPROVAL_CHARS) return "unclear";

  const padded = normalizeForMatch(raw);
  if (padded.trim().length === 0) return "unclear";
  if (DECLINE_PHRASES.some((p) => containsPhrase(padded, p))) return "declined";
  if (APPROVE_PHRASES.some((p) => containsPhrase(padded, p))) return "approved";
  return "unclear";
}

/**
 * Walks the user's replies since the proposal in order and takes the FIRST one
 * that is a clear yes or no. Scanning past an unclear reply matters: if the user
 * asked something unrelated first and answered afterwards, their answer still
 * counts. A no found before any yes still wins — a decline is final, and getting
 * consent after it requires a fresh proposal.
 */
export function readApprovalFromReplies(replies: (string | null | undefined)[]): ApprovalVerdict {
  for (const reply of replies || []) {
    const verdict = readApproval(reply);
    if (verdict !== "unclear") return verdict;
  }
  return "unclear";
}

function listTools(toolNames: string[]): string {
  const shown = toolNames.slice(0, MAX_TOOLS_SHOWN);
  const extra = toolNames.length - shown.length;
  return `${shown.join(", ")}${extra > 0 ? `, +${extra} more` : ""}`;
}

/**
 * The confirmation the user has to see before anything is attached. Built here
 * rather than left to the model so the URL, the header names and the real tool
 * list are quoted from the parked record instead of from the model's memory of
 * what it typed a moment ago.
 */
export function describeProposalForUser(rec: ConnectRequestRecord): string {
  const lines = [`Connect "${rec.name}" to this workspace?`, `- Server: ${rec.url}`];

  lines.push(
    rec.headerKeys.length > 0
      ? `- Auth headers it will be sent: ${rec.headerKeys.join(", ")} (values hidden)`
      : "- Auth headers: none"
  );

  if (rec.toolNames.length > 0) {
    lines.push(`- Tools this would add (${rec.toolNames.length}): ${listTools(rec.toolNames)}`);
  }
  if (rec.reason) lines.push(`- Why: ${rec.reason}`);

  lines.push("Reply yes to connect it, or no to leave it. Nothing is attached until you answer.");
  return lines.join("\n");
}

/** What to tell the user once it is really attached. */
export function describeConnectedServer(name: string, toolNames: string[]): string {
  const names = (toolNames || []).filter(Boolean);
  if (names.length === 0) {
    return `Connected "${name}". It exposed no tools, so nothing new is callable yet.`;
  }
  return (
    `Connected "${name}" — ${names.length} tool${names.length === 1 ? "" : "s"} attached: ` +
    `${listTools(names)}. They are callable from your next message.`
  );
}
