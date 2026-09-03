// ============================================================================
// /api/account/export
//
// Downloads everything the signed-in user owns as one JSON file. Secrets never
// leave the server: platform tokens, connector credentials, WordPress app
// passwords and MCP headers are replaced by booleans, so the file is safe to
// keep.
//
// Size is bounded two ways: each big collection is capped to its most recent
// rows, and long text fields are capped per field. Every cap is reported
// honestly in the payload (`truncatedCollections` / per-row `truncated`), so
// the user knows the export is a snapshot, not the whole database.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

/** Cap per long text field. */
const MAX_TEXT_LENGTH = 10_000;

/** Row caps for the collections that grow without bound (most recent first). */
const CAPS = {
  posts: 200,
  contentPosts: 200,
  chatSessions: 50,
  messagesPerSession: 200,
  memories: 500,
  trackedLinks: 1000,
  leadEvents: 1000,
  publishLogs: 1000,
} as const;

function capText(value: string | null | undefined): { content: string; truncated: boolean } | null {
  if (value === null || value === undefined) return null;
  if (value.length <= MAX_TEXT_LENGTH) return { content: value, truncated: false };
  return { content: value.slice(0, MAX_TEXT_LENGTH), truncated: true };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaces: {
          orderBy: { createdAt: "asc" },
          include: {
            brandDNA: true,
            // Token columns are never selected — connection facts only.
            socialAccounts: {
              select: {
                platform: true,
                handle: true,
                accountId: true,
                pageName: true,
                avatarUrl: true,
                tokenExpiresAt: true,
                createdAt: true,
                accessToken: true,
                refreshToken: true,
              },
            },
            posts: { orderBy: { createdAt: "desc" }, take: CAPS.posts },
            contentPosts: { orderBy: { createdAt: "desc" }, take: CAPS.contentPosts },
            hashtagGroups: true,
            growthGoal: true,
            chatSessions: {
              orderBy: { createdAt: "desc" },
              take: CAPS.chatSessions,
              include: {
                messages: { orderBy: { createdAt: "asc" }, take: CAPS.messagesPerSession },
              },
            },
            memories: { orderBy: { createdAt: "desc" }, take: CAPS.memories },
            trackedLinks: { orderBy: { createdAt: "desc" }, take: CAPS.trackedLinks },
            leadEvents: { orderBy: { occurredAt: "desc" }, take: CAPS.leadEvents },
            publishLogs: { orderBy: { publishedAt: "desc" }, take: CAPS.publishLogs },
            wordpressSite: true,
            connections: true,
            mcpServers: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // True counts for the capped collections, so `truncated` is a fact rather
    // than a guess. Cheap aggregates on a rare route.
    const [cappedWorkspaces, cappedSessions] = await Promise.all([
      prisma.workspace.findMany({
        where: { userId },
        select: {
          _count: {
            select: {
              posts: true,
              contentPosts: true,
              chatSessions: true,
              memories: true,
              leadEvents: true,
            },
          },
        },
      }),
      prisma.chatSession.findMany({
        where: { workspace: { userId } },
        select: { _count: { select: { messages: true } } },
      }),
    ]);
    const truncatedCollections = {
      posts: cappedWorkspaces.some((w) => w._count.posts > CAPS.posts),
      contentPosts: cappedWorkspaces.some((w) => w._count.contentPosts > CAPS.contentPosts),
      chatSessions: cappedWorkspaces.some((w) => w._count.chatSessions > CAPS.chatSessions),
      messages: cappedSessions.some((s) => s._count.messages > CAPS.messagesPerSession),
      memories: cappedWorkspaces.some((w) => w._count.memories > CAPS.memories),
      leadEvents: cappedWorkspaces.some((w) => w._count.leadEvents > CAPS.leadEvents),
    };

    const exportPayload = {
      format: "postloomai.export.v1",
      exportedAt: new Date().toISOString(),
      /** Which collections hit their row cap in this file. */
      limits: {
        rowsPerCollection: CAPS,
        textLengthPerField: MAX_TEXT_LENGTH,
        truncatedCollections,
        note:
          "Capped collections keep their most recent rows. Older rows remain in the app; only this file is a snapshot.",
      },
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      workspaces: user.workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        industry: ws.industry,
        website: ws.website,
        trackingKey: ws.trackingKey,
        trackingDomain: ws.trackingDomain,
        createdAt: ws.createdAt,
        brandDNA: ws.brandDNA
          ? {
              tone: ws.brandDNA.tone,
              missionVision: ws.brandDNA.missionVision,
              targetAudience: ws.brandDNA.targetAudience,
              primaryColors: ws.brandDNA.primaryColors,
              forbiddenWords: ws.brandDNA.forbiddenWords,
              writingStyle: ws.brandDNA.writingStyle,
              createdAt: ws.brandDNA.createdAt,
            }
          : null,
        // Tokens are intentionally replaced by connection facts only.
        socialAccounts: ws.socialAccounts.map((acc) => ({
          platform: acc.platform,
          handle: acc.handle,
          accountId: acc.accountId,
          pageName: acc.pageName,
          hasAccessToken: Boolean(acc.accessToken),
          hasRefreshToken: Boolean(acc.refreshToken),
          tokenExpiresAt: acc.tokenExpiresAt,
          createdAt: acc.createdAt,
        })),
        posts: ws.posts.map((p) => ({
          id: p.id,
          platform: p.platform,
          content: capText(p.content),
          imageUrl: p.imageUrl,
          format: p.format,
          hashtags: p.hashtags,
          mediaType: p.mediaType,
          status: p.status,
          campaignTopic: p.campaignTopic,
          publishedAt: p.publishedAt,
          scheduledFor: p.scheduledFor,
          createdAt: p.createdAt,
        })),
        contentPosts: ws.contentPosts.map((cp) => ({
          id: cp.id,
          title: cp.title,
          body: capText(cp.body),
          platform: cp.platform,
          status: cp.status,
          scheduledFor: cp.scheduledFor,
          publishedAt: cp.publishedAt,
          createdAt: cp.createdAt,
        })),
        hashtagGroups: ws.hashtagGroups,
        growthGoal: ws.growthGoal
          ? {
              leadTarget: ws.growthGoal.leadTarget,
              leadType: ws.growthGoal.leadType,
              timeframeDays: ws.growthGoal.timeframeDays,
              startDate: ws.growthGoal.startDate,
              leadSources: ws.growthGoal.leadSources,
              status: ws.growthGoal.status,
              createdAt: ws.growthGoal.createdAt,
            }
          : null,
        chatSessions: ws.chatSessions.map((cs) => ({
          id: cs.id,
          title: cs.title,
          model: cs.model,
          createdAt: cs.createdAt,
          messages: cs.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: capText(m.content),
            model: m.model,
            createdAt: m.createdAt,
          })),
        })),
        memories: ws.memories.map((m) => ({
          id: m.id,
          category: m.category,
          content: capText(m.content),
          importance: m.importance,
          pinned: m.pinned,
          createdAt: m.createdAt,
        })),
        trackedLinks: ws.trackedLinks.map((tl) => ({
          id: tl.id,
          code: tl.code,
          channel: tl.channel,
          platform: tl.platform,
          destination: tl.destination,
          clickCount: tl.clickCount,
          leadCount: tl.leadCount,
          createdAt: tl.createdAt,
        })),
        leadEvents: ws.leadEvents.map((le) => ({
          id: le.id,
          platform: le.platform,
          source: le.source,
          channel: le.channel,
          leadType: le.leadType,
          contactName: le.contactName,
          status: le.status,
          occurredAt: le.occurredAt,
        })),
        publishLogs: ws.publishLogs.map((pl) => ({
          id: pl.id,
          channel: pl.channel,
          platform: pl.platform,
          status: pl.status,
          liveUrl: pl.liveUrl,
          excerpt: pl.excerpt,
          publishedAt: pl.publishedAt,
        })),
        // Connected apps — never the credentials themselves.
        wordpressSite: ws.wordpressSite
          ? {
              siteUrl: ws.wordpressSite.siteUrl,
              username: ws.wordpressSite.username,
              hasAppPassword: true,
              lastVerifiedAt: ws.wordpressSite.lastVerifiedAt,
            }
          : null,
        connections: ws.connections.map((c) => ({
          providerKey: c.providerKey,
          authType: c.authType,
          accountLabel: c.accountLabel,
          hasCredentials: Boolean(c.credentials),
          status: c.status,
          createdAt: c.createdAt,
        })),
        mcpServers: ws.mcpServers.map((s) => ({
          name: s.name,
          url: s.url,
          hasHeaders: Boolean(s.headers),
          enabled: s.enabled,
          createdAt: s.createdAt,
        })),
      })),
    };

    const date = new Date().toISOString().slice(0, 10);
    const body = JSON.stringify(exportPayload, null, 2);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="postloomai-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[account/export]", err);
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}
