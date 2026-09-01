import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";
import { hashIdentifier } from "@/lib/crypto";
import { withUtmParams } from "@/lib/growth/ctaLinks";
import { getAppBaseUrl } from "@/lib/media/urls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public click-tracking redirect: `/r/<code>` → the user's real destination.
 *
 * This is the only place "clicks" in Lead Goal HQ come from, which is why they
 * are real measurements and not estimates. Bots are filtered out and no raw IP
 * is stored — only a salted hash used to flag repeat clicks.
 */

const BOT_UA =
  /bot|crawler|spider|crawl|slurp|facebookexternalhit|facebot|ia_archiver|preview|monitor|pingdom|uptime|curl|wget|python-requests|axios|headless|lighthouse|gtmetrix|semrush|ahrefs|whatsapp|telegram|discord|skype|linkedinbot|twitterbot|embedly|quora|pinterest\/|slackbot|vkshare|applebot|bingpreview|google(bot|-inspectiontool|other)/i;

interface CachedLink {
  id: string;
  workspaceId: string;
  platform: string;
  destination: string;
  postId: string | null;
}

function detectDevice(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet";
  if (/mobi|iphone|android|phone/.test(s)) return "mobile";
  return "desktop";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const home = getAppBaseUrl().replace(/\/$/, "");

  try {
    const { code: rawCode } = await params;
    const code = (rawCode || "").trim().toLowerCase();
    if (!code) return NextResponse.redirect(home, { status: 302 });

    const cacheKey = `link:${code}`;
    let link = await cacheGet<CachedLink>(cacheKey);

    if (!link) {
      const row = await (prisma as any).trackedLink
        .findUnique({
          where: { code },
          select: {
            id: true,
            workspaceId: true,
            platform: true,
            destination: true,
            postId: true,
          },
        })
        .catch(() => null);

      if (!row) return NextResponse.redirect(home, { status: 302 });

      link = row as CachedLink;
      await cacheSet(cacheKey, link, 3600).catch(() => {});
    }

    const ua = req.headers.get("user-agent") || "";
    const target = withUtmParams(link.destination, {
      platform: link.platform,
      postId: link.postId,
    });

    // Prefetchers, link unfurlers and crawlers must never inflate click counts
    const isBot = !ua || BOT_UA.test(ua);
    const isPrefetch =
      req.headers.get("purpose") === "prefetch" ||
      req.headers.get("sec-purpose")?.includes("prefetch") ||
      req.headers.get("x-moz") === "prefetch";

    if (!isBot && !isPrefetch) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "";
      const ipHash = ip ? hashIdentifier(ip) : null;

      try {
        // A repeat click from the same visitor within 24h still counts as a
        // click but is not counted as a unique visitor.
        let isUnique = true;
        if (ipHash) {
          const seenKey = `linkseen:${link.id}:${ipHash}`;
          const seen = await cacheGet<number>(seenKey);
          if (seen) isUnique = false;
          else await cacheSet(seenKey, 1, 86400).catch(() => {});
        }

        await prisma.$transaction([
          (prisma as any).linkClick.create({
            data: {
              trackedLinkId: link.id,
              workspaceId: link.workspaceId,
              platform: link.platform,
              referrer: req.headers.get("referer")?.slice(0, 500) || null,
              country: req.headers.get("x-vercel-ip-country") || null,
              device: detectDevice(ua),
              ipHash,
              isUnique,
            },
          }),
          (prisma as any).trackedLink.update({
            where: { id: link.id },
            data: { clickCount: { increment: 1 } },
          }),
        ]);
      } catch (err) {
        // Never block the visitor because analytics failed
        console.error("[/r] click log failed:", err);
      }
    }

    const res = NextResponse.redirect(target, { status: 302 });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (err) {
    console.error("[/r] redirect error:", err);
    return NextResponse.redirect(home, { status: 302 });
  }
}
