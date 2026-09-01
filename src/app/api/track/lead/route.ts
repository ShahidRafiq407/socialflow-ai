import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cacheGet, cacheSet, rateLimit } from "@/lib/redis";
import { hashIdentifier } from "@/lib/crypto";

/**
 * Website lead capture endpoint used by /api/track/t.js.
 *
 * Two event types:
 *  - "install" → proves the tag is live so the dashboard can show a real
 *    "Verified" status. Nothing is stored except a timestamp on the workspace.
 *  - "lead"    → a real intent action (form submit, mailto/tel, WhatsApp,
 *    booking link, data-lead element). Creates one LeadEvent, attributed back
 *    to the post/article that sent the visitor via the stored utm_content.
 *
 * Pageviews are never accepted, so a busy website cannot bloat the database.
 */

export const dynamic = "force-dynamic";

const BOT_UA =
  /bot|crawler|spider|crawl|slurp|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|axios|semrush|ahrefs|monitor/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function noContent(extra?: Record<string, string>) {
  return new NextResponse(null, { status: 204, headers: { ...CORS, ...(extra || {}) } });
}

function json(body: any, status: number) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return noContent();
}

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOT_UA.test(ua)) return noContent();

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid body" }, 400);
    }

    const key = String(body?.k || "").trim();
    const type = String(body?.type || "lead").trim();
    if (!key) return json({ error: "Missing key" }, 400);

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "";
    const ipHash = ip ? hashIdentifier(ip) : "anon";

    // Cheap abuse guard before we touch the database
    const rl = await rateLimit(`track:${key}:${ipHash}`, 30, 3600);
    if (!rl.allowed) return noContent();

    // Workspace lookup is cached — this endpoint is called from the open web
    const wsCacheKey = `trackws:${key}`;
    let ws = await cacheGet<{
      id: string;
      trackingDomain: string | null;
      website: string | null;
      verifiedAt: string | null;
    }>(wsCacheKey);

    if (!ws) {
      const row = await prisma.workspace
        .findFirst({
          where: { trackingKey: key } as any,
          select: {
            id: true,
            website: true,
            trackingDomain: true,
            trackingVerifiedAt: true,
          } as any,
        })
        .catch(() => null);

      if (!row) return json({ error: "Unknown key" }, 404);

      ws = {
        id: (row as any).id,
        website: (row as any).website ?? null,
        trackingDomain: (row as any).trackingDomain ?? null,
        verifiedAt: (row as any).trackingVerifiedAt
          ? new Date((row as any).trackingVerifiedAt).toISOString()
          : null,
      };
      await cacheSet(wsCacheKey, ws, 600).catch(() => {});
    }

    // Origin check: only the site the user registered may send events. When no
    // domain is saved yet we accept the first events so "Verify" can succeed,
    // and the dashboard shows the detected domain for confirmation.
    const expected = hostOf(ws.trackingDomain) || hostOf(ws.website);
    const actual =
      hostOf(req.headers.get("origin")) ||
      hostOf(req.headers.get("referer")) ||
      hostOf(body?.url);

    if (expected && actual && actual !== expected && !actual.endsWith(`.${expected}`)) {
      return json({ error: "Origin not allowed" }, 403);
    }

    // ── install ping: verification only, no row written ──────────────────────
    if (type === "install") {
      const stampKey = `trackseen:${ws.id}`;
      const recentlyStamped = await cacheGet<number>(stampKey);
      if (!recentlyStamped) {
        await cacheSet(stampKey, 1, 3600).catch(() => {});
        await prisma.workspace
          .update({
            where: { id: ws.id },
            data: {
              trackingVerifiedAt: new Date(),
              ...(ws.trackingDomain || !actual ? {} : { trackingDomain: actual }),
            } as any,
          })
          .catch(() => {});
        await cacheSet(wsCacheKey, { ...ws, verifiedAt: new Date().toISOString() }, 600).catch(
          () => {}
        );
      }
      return noContent();
    }

    if (type !== "lead") return noContent();

    const action = String(body?.action || "form_submit").slice(0, 40);
    const path = String(body?.path || "/").slice(0, 300);

    // The same visitor submitting the same form twice is one lead
    const dedupeKey = `tracklead:${ws.id}:${ipHash}:${action}:${path}`;
    if (await cacheGet<number>(dedupeKey)) return noContent();
    await cacheSet(dedupeKey, 1, 1800).catch(() => {});

    // ── attribution: utm_content carries the originating post id ─────────────
    const postId = String(body?.utm_content || "").trim() || null;
    let trackedLinkId: string | null = null;
    let platform: string | null = String(body?.utm_source || "").trim().toLowerCase() || null;

    if (postId) {
      const link = await (prisma as any).trackedLink
        .findFirst({
          where: { postId, workspaceId: ws.id },
          select: { id: true, platform: true },
          orderBy: { createdAt: "desc" },
        })
        .catch(() => null);
      if (link) {
        trackedLinkId = link.id;
        platform = link.platform || platform;
      }
    }

    const goal = await (prisma as any).growthGoal
      .findUnique({
        where: { workspaceId: ws.id },
        select: { id: true, leadType: true },
      })
      .catch(() => null);

    const contact = String(body?.contact || "").slice(0, 160) || null;
    const name = String(body?.name || "").slice(0, 120) || null;

    const noteParts = [
      `Website: ${path}`,
      body?.title ? `Page: ${String(body.title).slice(0, 120)}` : "",
      body?.utm_campaign ? `Campaign: ${String(body.utm_campaign).slice(0, 60)}` : "",
      body?.formId ? `Form: ${String(body.formId).slice(0, 60)}` : "",
    ].filter(Boolean);

    await (prisma as any).leadEvent.create({
      data: {
        workspaceId: ws.id,
        trackedLinkId,
        postId: trackedLinkId ? postId : null,
        platform,
        source: "WEBSITE_TAG",
        channel: "WEBSITE",
        action,
        leadType: goal?.leadType || "QUALIFIED_LEADS",
        contactName: name,
        contactInfo: contact,
        note: noteParts.join(" · "),
        status: "CONFIRMED",
      },
    });

    if (trackedLinkId) {
      await (prisma as any).trackedLink
        .update({ where: { id: trackedLinkId }, data: { leadCount: { increment: 1 } } })
        .catch(() => {});
    }

    if (!ws.verifiedAt) {
      await prisma.workspace
        .update({ where: { id: ws.id }, data: { trackingVerifiedAt: new Date() } as any })
        .catch(() => {});
    }

    return noContent();
  } catch (err) {
    console.error("[/api/track/lead] error:", err);
    // Never surface an error to a visitor's browser
    return noContent();
  }
}
