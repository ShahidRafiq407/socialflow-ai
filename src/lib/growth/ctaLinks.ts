import crypto from "crypto";
import prisma from "@/lib/db";
import { getAppBaseUrl } from "@/lib/media/urls";

/**
 * Tracked CTA links.
 *
 * Every AI-generated post/article carries a short link of the form
 * `<app>/r/<code>`. A visitor coming from social media hits that route, we log a
 * real LinkClick, and they are forwarded to the user's own destination with UTM
 * parameters attached. That is how "clicks" and "leads" in Lead Goal HQ become
 * measured numbers instead of estimates.
 */

export const LINK_PLACEHOLDER = "{{LINK}}";

/**
 * Platform fact (not business content): whether a URL inside the caption /
 * description is actually clickable. Instagram and TikTok strip caption links,
 * so there the link is still generated but the user is told to use it as a bio
 * link (and can copy it).
 */
export const CAPTION_LINK_CLICKABLE: Record<string, boolean> = {
  linkedin: true,
  facebook: true,
  x: true,
  youtube: true,
  pinterest: true,
  instagram: false,
  tiktok: false,
};

export function isCaptionLinkClickable(platform: string): boolean {
  return CAPTION_LINK_CLICKABLE[(platform || "").toLowerCase()] ?? true;
}

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

/**
 * Resolves the real destination for a platform's CTA.
 *
 * Order: goal.ctaDestinations[platform] → goal.ctaDestinations.default →
 * workspace.website. Returns null when the user has not given us a link — we
 * never invent one, because a wrong link means zero leads.
 */
export function resolveDestination(params: {
  ctaDestinations?: Record<string, string> | null;
  workspaceWebsite?: string | null;
  platform: string;
}): string | null {
  const map = params.ctaDestinations || {};
  const key = (params.platform || "").toLowerCase();

  return (
    normalizeUrl(map[key]) ||
    normalizeUrl(map[params.platform]) ||
    normalizeUrl(map.default) ||
    normalizeUrl(params.workspaceWebsite) ||
    null
  );
}

function generateLinkCode(length = 7): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789"; // no look-alikes
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function buildShortUrl(code: string): string {
  return `${getAppBaseUrl().replace(/\/$/, "")}/r/${code}`;
}

export interface CreateTrackedLinkInput {
  workspaceId: string;
  platform: string;
  destination: string;
  postId?: string | null;
  goalId?: string | null;
  channel?: "SOCIAL" | "WEBSITE";
  pillar?: string | null;
}

export interface TrackedLinkResult {
  id: string;
  code: string;
  shortUrl: string;
  destination: string;
}

/**
 * Creates a tracked link, retrying on the (very unlikely) code collision.
 */
export async function createTrackedLink(
  input: CreateTrackedLinkInput
): Promise<TrackedLinkResult | null> {
  const destination = normalizeUrl(input.destination);
  if (!destination) return null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLinkCode();
    try {
      const link = await (prisma as any).trackedLink.create({
        data: {
          code,
          workspaceId: input.workspaceId,
          platform: input.platform,
          destination,
          postId: input.postId || null,
          goalId: input.goalId || null,
          channel: input.channel || "SOCIAL",
          pillar: input.pillar || null,
        },
      });
      return { id: link.id, code: link.code, shortUrl: buildShortUrl(link.code), destination };
    } catch (err: any) {
      // Unique constraint on `code` — try another one
      if (err?.code === "P2002") continue;
      console.error("[createTrackedLink] failed:", err);
      return null;
    }
  }
  return null;
}

/**
 * Puts the short URL into generated copy. The prompt asks the model to place a
 * {{LINK}} placeholder in the CTA; if it forgets, we append the link instead of
 * dropping it silently.
 */
export function injectTrackedLink(
  text: string,
  shortUrl: string,
  options?: { clickable?: boolean }
): string {
  const body = text || "";
  if (body.includes(LINK_PLACEHOLDER)) {
    return body.split(LINK_PLACEHOLDER).join(shortUrl);
  }
  if (body.includes(shortUrl)) return body;

  const suffix = options?.clickable === false ? `\n\n🔗 ${shortUrl} (link in bio)` : `\n\n👉 ${shortUrl}`;
  return `${body.trimEnd()}${suffix}`;
}

/**
 * Strips any leftover placeholder when no destination was available.
 */
export function stripLinkPlaceholder(text: string): string {
  return (text || "").split(LINK_PLACEHOLDER).join("").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Appends attribution parameters so the user can also see the traffic in their
 * own analytics, and so the website tag can tie a lead back to this exact post.
 */
export function withUtmParams(
  destination: string,
  params: { platform: string; postId?: string | null; campaign?: string }
): string {
  try {
    const url = new URL(destination);
    if (!url.searchParams.has("utm_source")) {
      url.searchParams.set("utm_source", (params.platform || "social").toLowerCase());
    }
    if (!url.searchParams.has("utm_medium")) {
      url.searchParams.set("utm_medium", "organic_social");
    }
    if (!url.searchParams.has("utm_campaign")) {
      url.searchParams.set("utm_campaign", params.campaign || "lead-goal");
    }
    if (params.postId && !url.searchParams.has("utm_content")) {
      url.searchParams.set("utm_content", params.postId);
    }
    return url.toString();
  } catch {
    return destination;
  }
}

/**
 * Stable per-workspace key used by the website lead-capture tag.
 */
export async function ensureTrackingKey(workspaceId: string): Promise<string> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { trackingKey: true },
  });
  if ((ws as any)?.trackingKey) return (ws as any).trackingKey;

  const key = `sf_${crypto.randomBytes(9).toString("base64url")}`;
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { trackingKey: key } as any,
  });
  return key;
}

export function buildTagSnippet(trackingKey: string): string {
  const base = getAppBaseUrl().replace(/\/$/, "");
  return `<script defer src="${base}/api/track/t.js?k=${trackingKey}"></script>`;
}
