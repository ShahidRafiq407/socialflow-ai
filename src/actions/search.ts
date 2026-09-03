// ============================================================================
// GLOBAL SEARCH — SERVER ACTION
//
// Backs the header's search box. Everything returned is real data from the
// caller's *active* workspace: switch workspaces and the same query returns a
// different set, which is the whole point of the switcher.
//
// Deliberately not a full-text index: these tables are per-workspace and small,
// so five capped `contains` queries in parallel answer faster than the user can
// type the next character, and nothing has to be kept in sync.
// ============================================================================

"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/db";
import { resolveActiveWorkspaceId } from "@/lib/workspace/active";

export type SearchHitKind =
  | "post"
  | "published"
  | "article"
  | "chat"
  | "account"
  | "hashtags"
  | "workspace";

export interface SearchHit {
  id: string;
  kind: SearchHitKind;
  title: string;
  subtitle?: string;
  /** Internal route, or an external live URL for published pieces. */
  href: string;
  external?: boolean;
  badge?: string;
  at?: string;
}

/** Per-source cap: enough to be useful, small enough to stay one screen. */
const PER_SOURCE = 4;

/** Collapses a post body to something that fits on one row. */
function excerpt(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export async function searchWorkspace(rawQuery: string): Promise<SearchHit[]> {
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (query.length < 2) return [];

  const { userId } = await auth();
  if (!userId) return [];

  const workspaceId = await resolveActiveWorkspaceId(userId);
  if (!workspaceId) return [];

  const contains = { contains: query, mode: "insensitive" as const };

  const [posts, published, chats, accounts, hashtags, runs, otherWorkspaces] = await Promise.all([
    prisma.post
      .findMany({
        where: { workspaceId, content: contains },
        select: { id: true, content: true, platform: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      })
      .catch(() => []),
    prisma.publishLog
      .findMany({
        where: { workspaceId, OR: [{ excerpt: contains }, { topic: contains }] },
        select: {
          id: true,
          excerpt: true,
          topic: true,
          platform: true,
          status: true,
          liveUrl: true,
          publishedAt: true,
        },
        orderBy: { publishedAt: "desc" },
        take: PER_SOURCE,
      })
      .catch(() => []),
    prisma.chatSession
      .findMany({
        where: { workspaceId, title: contains },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: PER_SOURCE,
      })
      .catch(() => []),
    prisma.socialAccount
      .findMany({
        where: { workspaceId, OR: [{ handle: contains }, { pageName: contains }] },
        select: { id: true, platform: true, handle: true, pageName: true },
        take: PER_SOURCE,
      })
      .catch(() => []),
    prisma.hashtagGroup
      .findMany({
        where: { workspaceId, OR: [{ name: contains }, { tags: { has: query } }] },
        select: { id: true, name: true, tags: true },
        take: PER_SOURCE,
      })
      .catch(() => []),
    // The article brief is a JSON column: reading the recent runs and matching
    // in memory keeps this honest without a JSON-path query per field.
    prisma.articleRun
      .findMany({
        where: { workspaceId },
        select: { id: true, brief: true, status: true, mode: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      })
      .catch(() => []),
    // Matching another workspace by name turns the search box into a second way
    // to switch — the id is handed to the switch action, never trusted as data.
    prisma.workspace
      .findMany({
        where: { userId, name: contains, id: { not: workspaceId } },
        select: { id: true, name: true },
        take: PER_SOURCE,
      })
      .catch(() => []),
  ]);

  const hits: SearchHit[] = [];

  for (const ws of otherWorkspaces) {
    hits.push({
      id: ws.id,
      kind: "workspace",
      title: ws.name,
      subtitle: "Switch to this workspace",
      href: "",
    });
  }

  for (const post of posts) {
    hits.push({
      id: post.id,
      kind: "post",
      title: excerpt(post.content),
      subtitle: `${post.platform} · ${titleCase(post.status.replace(/_/g, " "))}`,
      href: "/dashboard/content",
      badge: "Content",
      at: post.createdAt.toISOString(),
    });
  }

  for (const log of published) {
    const live = log.liveUrl || "";
    hits.push({
      id: log.id,
      kind: "published",
      title: log.topic || excerpt(log.excerpt),
      subtitle: `${log.platform} · ${log.status === "FAILED" ? "Failed" : "Published"}`,
      href: live || "/dashboard/analytics",
      external: Boolean(live),
      badge: live ? "Live" : "Log",
      at: log.publishedAt.toISOString(),
    });
  }

  for (const run of runs) {
    const brief = (run.brief ?? {}) as Record<string, unknown>;
    const title = typeof brief.title === "string" && brief.title.trim() ? brief.title : "";
    const keyword = typeof brief.keyword === "string" ? brief.keyword : "";
    const label = title || keyword;
    if (!label) continue;
    if (!`${title} ${keyword}`.toLowerCase().includes(query.toLowerCase())) continue;

    hits.push({
      id: run.id,
      kind: "article",
      title: label,
      subtitle: `Article · ${run.mode} · ${titleCase(run.status)}`,
      href: "/dashboard/article-writer",
      badge: "Article",
      at: run.createdAt.toISOString(),
    });
    if (hits.filter((h) => h.kind === "article").length >= PER_SOURCE) break;
  }

  for (const chat of chats) {
    hits.push({
      id: chat.id,
      kind: "chat",
      title: chat.title || "Untitled task",
      subtitle: "Automate Task session",
      href: "/dashboard/chat",
      badge: "Task",
      at: chat.updatedAt.toISOString(),
    });
  }

  for (const account of accounts) {
    hits.push({
      id: account.id,
      kind: "account",
      title: account.pageName || account.handle || account.platform,
      subtitle: `Connected ${titleCase(account.platform)} account`,
      href: "/dashboard/integrations",
      badge: "Account",
    });
  }

  for (const group of hashtags) {
    hits.push({
      id: group.id,
      kind: "hashtags",
      title: group.name,
      subtitle: group.tags.slice(0, 6).join(" "),
      href: "/dashboard/ai-studio",
      badge: "Hashtags",
    });
  }

  return hits;
}


