// ============================================================================
// FEATURE REQUEST SHAPE
//
// What gets written down when the controller has to say "I can't do that yet".
// The payload lives as JSON inside one Memory row (category "feature_request"),
// the same schema-free pattern billing history uses — so capturing user demand
// needs no migration and cannot break an existing deploy.
//
// Pure module: parsing, slugging and merging are all here, so the dedupe rule
// ("the same ask twice is one row with a counter, not two rows") is unit-tested
// without a database.
// ============================================================================

import { isLimitReason, type LimitReason } from "./limits";

export type FeatureRequestStatus = "open" | "planned" | "shipped" | "declined";

const STATUSES: FeatureRequestStatus[] = ["open", "planned", "shipped", "declined"];

export function isFeatureRequestStatus(value: unknown): value is FeatureRequestStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

/** How many different phrasings of the same ask are worth keeping. */
export const MAX_REQUEST_EXAMPLES = 5;

const MAX_TITLE = 120;
const MAX_REQUEST = 600;
const MAX_DETAIL = 400;
const MAX_NEAREST = 240;
const MAX_SLUG = 64;

export interface FeatureRequestPayload {
  v: 1;
  slug: string;
  /** Short name of the missing capability — the row's identity. */
  title: string;
  /** The most recent way the user asked for it. */
  request: string;
  /** Earlier phrasings, so the developer sees the range of the same ask. */
  examples: string[];
  reason: LimitReason;
  /** Why it could not be done at the time it was asked. */
  detail: string;
  /** What was offered instead, if anything. */
  nearest: string | null;
  status: FeatureRequestStatus;
  timesAsked: number;
  firstAskedAt: string;
  lastAskedAt: string;
  sessionId: string | null;
}

export interface FeatureRequest extends FeatureRequestPayload {
  id: string;
}

export interface FeatureRequestInput {
  title: string;
  request: string;
  reason?: unknown;
  detail?: string | null;
  nearest?: string | null;
  sessionId?: string | null;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/**
 * Stable id for "the same thing asked again". Deliberately derived from the title
 * alone: two users phrasing one missing feature differently must land on one row,
 * otherwise the counter that tells the developer what to build never rises.
 */
export function slugifyRequest(title: string): string {
  const slug = String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  return slug || "unnamed-request";
}

/** First time this ask is seen. */
export function newRequestPayload(input: FeatureRequestInput, now: Date = new Date()): FeatureRequestPayload {
  const stamp = now.toISOString();
  const title = clean(input.title, MAX_TITLE) || "Unnamed request";
  const request = clean(input.request, MAX_REQUEST) || title;

  return {
    v: 1,
    slug: slugifyRequest(title),
    title,
    request,
    examples: [request],
    reason: isLimitReason(input.reason) ? input.reason : "out_of_scope",
    detail: clean(input.detail, MAX_DETAIL),
    nearest: clean(input.nearest, MAX_NEAREST) || null,
    status: "open",
    timesAsked: 1,
    firstAskedAt: stamp,
    lastAskedAt: stamp,
    sessionId: typeof input.sessionId === "string" && input.sessionId ? input.sessionId : null,
  };
}

/**
 * The same ask, again. Raises the counter and keeps the new phrasing, but never
 * resets the status a human set: a request marked "planned" that gets asked twice
 * more is still planned — it is just more urgent now.
 */
export function mergeRequestPayload(
  existing: FeatureRequestPayload,
  input: FeatureRequestInput,
  now: Date = new Date()
): FeatureRequestPayload {
  const request = clean(input.request, MAX_REQUEST) || existing.request;
  const detail = clean(input.detail, MAX_DETAIL) || existing.detail;
  const nearest = clean(input.nearest, MAX_NEAREST) || existing.nearest;

  const examples = [...(existing.examples || [])];
  if (request && !examples.some((e) => e.toLowerCase() === request.toLowerCase())) {
    examples.unshift(request);
  }

  return {
    ...existing,
    request,
    examples: examples.slice(0, MAX_REQUEST_EXAMPLES),
    reason: isLimitReason(input.reason) ? input.reason : existing.reason,
    detail,
    nearest,
    timesAsked: Math.max(1, Number(existing.timesAsked) || 1) + 1,
    lastAskedAt: now.toISOString(),
    sessionId:
      typeof input.sessionId === "string" && input.sessionId ? input.sessionId : existing.sessionId ?? null,
  };
}

/**
 * Reads one stored row back. A row written by an older version — or corrupted by
 * hand — must never break the panel, so every field falls back rather than throws.
 */
export function parseRequestRow(row: { id: unknown; content: unknown }): FeatureRequest | null {
  let raw: any;
  try {
    raw = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const title = clean(raw.title, MAX_TITLE);
  const request = clean(raw.request, MAX_REQUEST);
  if (!title && !request) return null;

  const stamp = typeof raw.lastAskedAt === "string" ? raw.lastAskedAt : new Date(0).toISOString();
  const examples = Array.isArray(raw.examples)
    ? raw.examples.map((e: unknown) => clean(e, MAX_REQUEST)).filter(Boolean).slice(0, MAX_REQUEST_EXAMPLES)
    : [];

  return {
    id: String(row.id ?? ""),
    v: 1,
    slug: typeof raw.slug === "string" && raw.slug ? raw.slug : slugifyRequest(title || request),
    title: title || request.slice(0, MAX_TITLE),
    request: request || title,
    examples: examples.length > 0 ? examples : [request || title].filter(Boolean),
    reason: isLimitReason(raw.reason) ? raw.reason : "out_of_scope",
    detail: clean(raw.detail, MAX_DETAIL),
    nearest: clean(raw.nearest, MAX_NEAREST) || null,
    status: isFeatureRequestStatus(raw.status) ? raw.status : "open",
    timesAsked: Math.max(1, Math.round(Number(raw.timesAsked) || 1)),
    firstAskedAt: typeof raw.firstAskedAt === "string" ? raw.firstAskedAt : stamp,
    lastAskedAt: stamp,
    sessionId: typeof raw.sessionId === "string" && raw.sessionId ? raw.sessionId : null,
  };
}

const STATUS_RANK: Record<FeatureRequestStatus, number> = { open: 0, planned: 1, shipped: 2, declined: 3 };

/**
 * Reading order for the developer: still-open asks first, loudest first, then
 * whatever was asked most recently. Returns a new array.
 */
export function sortRequests(requests: FeatureRequest[]): FeatureRequest[] {
  return [...requests].sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (a.timesAsked !== b.timesAsked) return b.timesAsked - a.timesAsked;
    return b.lastAskedAt.localeCompare(a.lastAskedAt);
  });
}




