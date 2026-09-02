import prisma from "@/lib/db";
import { publishToPlatformProvider, normalizePlatformToEnum } from "@/lib/publishers";
import { removeFromScheduleQueue } from "@/lib/redis";

/**
 * Shared publishing dispatcher.
 *
 * Both the cron worker (`/api/cron/publish-scheduled`, `/api/cron/growth-autopilot`)
 * and the in-app dispatcher (`dispatchDueScheduledPosts`) run this exact loop, so
 * the atomic SCHEDULED → PUBLISHING claim and the permanent PublishLog row are
 * guaranteed to behave identically no matter what triggered the publish.
 *
 * Why PublishLog exists: heavy `Post` rows are purged (1 hour for normal posts,
 * 3 days for autopilot posts) to keep the database small. The slim log row keeps
 * the real live link forever so the History tab can honestly say
 * "aaj maine ye post is platform par ki".
 */

/** Marker written into `Post.settings.origin` by the growth autopilot. */
export const AUTOPILOT_ORIGIN = "growth-autopilot";

/** Autopilot posts stay in the Content Library for this long, then only the log remains. */
export const AUTOPILOT_POST_RETENTION_DAYS = 3;

/** Normal (user-created) published posts are a short-lived receipt. */
export const NORMAL_POST_RETENTION_MINUTES = 60;

export interface PublishLogInput {
  workspaceId: string;
  postId?: string | null;
  goalId?: string | null;
  trackedLinkId?: string | null;
  channel: "SOCIAL" | "WEBSITE";
  platform: string;
  format?: string | null;
  status: "PUBLISHED" | "FAILED";
  liveUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  excerpt?: string | null;
  topic?: string | null;
  keyword?: string | null;
  error?: string | null;
  publishedAt?: Date;
}

/**
 * Writes one permanent history row. Never throws — a logging failure must not
 * roll back a successful publish.
 *
 * This is also where the controller's "kept" signal is recorded, because every
 * publish path in the product funnels through here. Only a real PUBLISHED row
 * counts: a FAILED publish is a platform error, not a judgment on the content,
 * so it contributes to neither side of the ledger.
 */
export async function recordPublishLog(input: PublishLogInput): Promise<string | null> {
  try {
    const row = await (prisma as any).publishLog.create({
      data: {
        workspaceId: input.workspaceId,
        postId: input.postId || null,
        goalId: input.goalId || null,
        trackedLinkId: input.trackedLinkId || null,
        channel: input.channel,
        platform: input.platform,
        format: input.format || null,
        status: input.status,
        liveUrl: input.liveUrl || null,
        mediaUrl: input.mediaUrl || null,
        mediaType: input.mediaType || null,
        excerpt: (input.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 240),
        topic: input.topic ? String(input.topic).slice(0, 200) : null,
        keyword: input.keyword ? String(input.keyword).slice(0, 120) : null,
        error: input.error ? String(input.error).slice(0, 500) : null,
        publishedAt: input.publishedAt || new Date(),
      },
    });

    if (input.status === "PUBLISHED") {
      void (async () => {
        try {
          const { recordOutcome } = await import("@/lib/agents/controller/outcomeStore");
          await recordOutcome({
            workspaceId: input.workspaceId,
            event: {
              outcome: "published",
              platform: input.platform,
              format: input.format,
              mediaType: input.mediaType,
            },
          });
        } catch {
          /* non-fatal */
        }
      })();
    }

    return row?.id || null;
  } catch (err) {
    console.warn("[recordPublishLog] skipped:", err);
    return null;
  }
}

function readSettings(post: any): Record<string, any> {
  const s = post?.settings;
  if (!s) return {};
  if (typeof s === "string") {
    try {
      return JSON.parse(s) || {};
    } catch {
      return {};
    }
  }
  return typeof s === "object" ? s : {};
}

export function isAutopilotPost(post: any): boolean {
  return readSettings(post).origin === AUTOPILOT_ORIGIN;
}

export interface PublishDueResult {
  dispatched: number;
  published: number;
  failed: number;
  results: { id: string; platform: string; status: "PUBLISHED" | "FAILED"; liveUrl?: string; error?: string }[];
}

/**
 * Publishes every post whose `scheduledFor` is in the past.
 *
 * A post missed while the app was closed is still published on the next run —
 * that is intentional, and it is what makes daily autopilot survive a Vercel
 * Hobby plan that only allows one cron per day.
 */
export async function publishDuePosts(options?: {
  workspaceIds?: string[];
  postIds?: string[];
  limit?: number;
  /** Only publish posts created by the growth autopilot. */
  autopilotOnly?: boolean;
}): Promise<PublishDueResult> {
  const limit = Math.min(100, options?.limit || 10);
  const out: PublishDueResult = { dispatched: 0, published: 0, failed: 0, results: [] };

  const where: any = {
    status: "SCHEDULED",
    scheduledFor: { lte: new Date() },
  };
  if (options?.workspaceIds?.length) where.workspaceId = { in: options.workspaceIds };
  if (options?.postIds?.length) where.id = { in: options.postIds };

  const due = await prisma.post.findMany({
    where,
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  for (const post of due) {
    if (options?.autopilotOnly && !isAutopilotPost(post)) continue;

    // Atomic claim — a post already grabbed by another worker is skipped
    const claim = await prisma.post.updateMany({
      where: { id: post.id, status: "SCHEDULED" },
      data: { status: "PUBLISHING" },
    });
    if (claim.count === 0) {
      await removeFromScheduleQueue(post.id).catch(() => {});
      continue;
    }

    const settings = readSettings(post);
    const logBase = {
      workspaceId: post.workspaceId,
      postId: post.id,
      goalId: settings.goalId || null,
      trackedLinkId: settings.trackedLinkId || null,
      channel: "SOCIAL" as const,
      platform: post.platform,
      format: post.format,
      mediaUrl: post.imageUrl,
      mediaType: post.mediaType,
      excerpt: post.content,
      topic: (post as any).campaignTopic || null,
    };

    try {
      const platformEnum = normalizePlatformToEnum(post.platform);
      if (!platformEnum) throw new Error(`Unknown platform: ${post.platform}`);

      const account = await prisma.socialAccount.findFirst({
        where: { workspaceId: post.workspaceId, platform: platformEnum as any },
      });
      if (!account) throw new Error(`Social account not connected for ${post.platform}.`);

      const result = await publishToPlatformProvider(post, account);

      if (result.success) {
        const now = new Date();
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: "PUBLISHED",
            publishedAt: now,
            source: result.liveUrl || result.platformPostId || "published",
          },
        });
        await recordPublishLog({
          ...logBase,
          status: "PUBLISHED",
          liveUrl: result.liveUrl || null,
          publishedAt: now,
        });
        out.published++;
        out.results.push({
          id: post.id,
          platform: post.platform,
          status: "PUBLISHED",
          liveUrl: result.liveUrl,
        });
      } else {
        const errMsg = result.error || "Failed to publish to platform";
        await prisma.post.update({
          where: { id: post.id },
          data: { status: "FAILED", publishError: errMsg },
        });
        await recordPublishLog({ ...logBase, status: "FAILED", error: errMsg });
        out.failed++;
        out.results.push({ id: post.id, platform: post.platform, status: "FAILED", error: errMsg });
      }
      out.dispatched++;
    } catch (err: any) {
      const errMsg = err?.message || "Unknown dispatch error";
      await prisma.post
        .update({ where: { id: post.id }, data: { status: "FAILED", publishError: errMsg } })
        .catch(() => {});
      await recordPublishLog({ ...logBase, status: "FAILED", error: errMsg });
      out.failed++;
      out.results.push({ id: post.id, platform: post.platform, status: "FAILED", error: errMsg });
    } finally {
      await removeFromScheduleQueue(post.id).catch(() => {});
    }
  }

  return out;
}

/**
 * Retention split. Normal published posts are a 1-hour receipt (Content Library
 * behaviour). Autopilot posts stay 3 days so the user can review what the AI put
 * out. The PublishLog row is never touched, so History keeps every live link.
 */
export async function purgePublishedPosts(workspaceIds: string[]): Promise<{ normal: number; autopilot: number }> {
  if (!workspaceIds.length) return { normal: 0, autopilot: 0 };

  const publishedStatuses = ["PUBLISHED", "published"];
  const normalCutoff = new Date(Date.now() - NORMAL_POST_RETENTION_MINUTES * 60 * 1000);
  const autopilotCutoff = new Date(Date.now() - AUTOPILOT_POST_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const stale = await prisma.post
    .findMany({
      where: {
        workspaceId: { in: workspaceIds },
        status: { in: publishedStatuses },
        OR: [
          { publishedAt: { lt: normalCutoff } },
          { publishedAt: null, createdAt: { lt: normalCutoff } },
        ],
      },
      select: { id: true, settings: true, publishedAt: true, createdAt: true },
      take: 500,
    })
    .catch(() => [] as any[]);

  const normalIds: string[] = [];
  const autopilotIds: string[] = [];

  for (const p of stale as any[]) {
    const when = p.publishedAt ? new Date(p.publishedAt) : new Date(p.createdAt);
    if (isAutopilotPost(p)) {
      if (when < autopilotCutoff) autopilotIds.push(p.id);
    } else {
      normalIds.push(p.id);
    }
  }

  let normal = 0;
  let autopilot = 0;

  if (normalIds.length) {
    normal = (await prisma.post.deleteMany({ where: { id: { in: normalIds } } }).catch(() => ({ count: 0 }))).count;
  }
  if (autopilotIds.length) {
    autopilot = (
      await prisma.post.deleteMany({ where: { id: { in: autopilotIds } } }).catch(() => ({ count: 0 }))
    ).count;
  }

  return { normal, autopilot };
}
