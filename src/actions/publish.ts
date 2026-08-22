"use server";

export const maxDuration = 60;

import prisma from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { publishToPlatformProvider } from '@/lib/publishers';
import { scheduleEnqueue, removeFromScheduleQueue } from '@/lib/redis';

export async function saveDraft(postData: any): Promise<any> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Unauthorized. Please sign in again.' };

    let { id, workspaceId, platform, content, imageUrl, imagePrompt, format, hashtags, mediaType, mediaSource, source, campaignTopic, campaignHook, mediaHistory, captionHistory, agentLogs, settings } = postData;

    if (!workspaceId) {
      const workspace = await prisma.workspace.findFirst({ where: { userId } });
      if (!workspace) return { success: false, error: 'Workspace not found. Please complete onboarding first.' };
      workspaceId = workspace.id;
    }

    const data: any = {
      workspaceId,
      platform,
      content,
      imageUrl,
      imagePrompt,
      format,
      hashtags: hashtags || [],
      mediaType,
      mediaSource,
      source,
      campaignTopic,
      campaignHook,
      status: 'DRAFT',
    };

    if (mediaHistory !== undefined) {
      data.mediaHistory = mediaHistory;
    }
    if (captionHistory !== undefined) {
      data.captionHistory = captionHistory;
    }
    if (agentLogs !== undefined) {
      data.agentLogs = agentLogs;
    }
    // Platform-native publishing settings (visibility, reply settings, engagement
    // toggles) — applied by the real platform publishers at publish time.
    if (settings !== undefined) {
      data.settings = settings;
    }

  if (id) {
      return await prisma.post.update({
        where: { id },
        data,
      });
    } else {
      return await prisma.post.create({
        data,
      });
    }
  } catch (err: any) {
    console.error('[saveDraft Action Error]:', err);
    return {
      success: false,
      error: err?.message || 'Server error while saving the post draft.',
    };
  }
}

export async function schedulePost(postId: string, scheduledFor: Date) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Unauthorized. Please sign in again.' };

    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        status: 'SCHEDULED',
        scheduledFor,
      },
    });

    // Best-effort Redis queue registration — the cron worker pulls due jobs from
    // this sorted set instead of scanning the whole Post table at scale.
    if (updated && scheduledFor.getTime() > Date.now()) {
      await scheduleEnqueue(postId, scheduledFor.getTime());
    }

    return updated;
  } catch (err: any) {
    console.error('[schedulePost Action Error]:', err);
    return {
      success: false,
      error: err?.message || 'Server error while scheduling the post.',
    };
  }
}

export async function publishNow(postId: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Unauthorized. Please sign in to publish posts.' };

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { workspace: true },
    });

    if (!post) return { success: false, error: 'Post not found in database.' };

    // Map post.platform (e.g. "Instagram Feed", "Facebook Reel") to SocialAccount enum (e.g. "INSTAGRAM")
    const platformEnumMap: Record<string, string> = {
      instagram: 'INSTAGRAM',
      facebook: 'FACEBOOK',
      linkedin: 'LINKEDIN',
      x: 'X',
      youtube: 'YOUTUBE',
      tiktok: 'TIKTOK',
      pinterest: 'PINTEREST',
    };
    const basePlatform = post.platform.split(/[\s-_]+/)[0].toLowerCase();
    const platformEnum = platformEnumMap[basePlatform];

    if (!platformEnum) return { success: false, error: `Unknown platform: ${post.platform}` };

    const account = await prisma.socialAccount.findFirst({
      where: {
        workspaceId: post.workspaceId,
        platform: platformEnum as any,
      },
    });

    if (!account) {
      return {
        success: false,
        error: `Social account not connected for ${post.platform}. Please connect it on the Integrations page.`,
      };
    }

    return await publishToPlatform(post, account);
  } catch (err: any) {
    console.error('[publishNow Action Error]:', err);
    return {
      success: false,
      error: err.message || 'Server error occurred while preparing post for dispatch.',
    };
  }
}

export async function publishToPlatform(post: any, account: any) {
  // Update status to PUBLISHING
  await prisma.post.update({
    where: { id: post.id },
    data: { status: 'PUBLISHING' },
  });

  try {
    const result = await publishToPlatformProvider(post, account);

    if (result.success) {
      const updated = await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          source: result.liveUrl || result.platformPostId || 'published',
        },
      });
      return {
        success: true,
        post: updated,
        liveUrl: result.liveUrl,
        platformPostId: result.platformPostId,
      };
    } else {
      const updated = await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          publishError: result.error || 'Failed to publish to platform',
        },
      });
      return {
        success: false,
        post: updated,
        error: result.error || 'Failed to publish to platform',
      };
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error during publishing';
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'FAILED',
        publishError: errorMsg,
      },
    });
    return {
      success: false,
      post: updated,
      error: errorMsg,
    };
  }
}

export async function approvePost(postId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post) throw new Error('Post not found');

  return await prisma.post.update({
    where: { id: postId },
    data: {
      status: post.scheduledFor ? 'SCHEDULED' : 'APPROVED',
    },
  });
}

/**
 * In-app scheduler dispatcher — fires from the dashboard on load, focus and
 * every 60s. The Vercel Hobby cron only runs once a day, so this is what keeps
 * scheduled posts publishing at their exact due time while the app is open.
 * Posts are claimed atomically (SCHEDULED → PUBLISHING via updateMany) so it
 * never double-publishes when overlapping the cron worker.
 */
export async function dispatchDueScheduledPosts() {
  try {
    const { userId } = await auth();
    if (!userId) return { success: true, dispatched: 0 };

    const workspaces = await prisma.workspace.findMany({
      where: { userId },
      select: { id: true },
    });
    const workspaceIds = workspaces.map((w) => w.id);
    if (workspaceIds.length === 0) return { success: true, dispatched: 0 };

    const due = await prisma.post.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        status: 'SCHEDULED',
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 10,
    });

    const platformEnumMap: Record<string, string> = {
      instagram: 'INSTAGRAM',
      facebook: 'FACEBOOK',
      linkedin: 'LINKEDIN',
      x: 'X',
      youtube: 'YOUTUBE',
      tiktok: 'TIKTOK',
      pinterest: 'PINTEREST',
    };

    let dispatched = 0;
    for (const post of due) {
      // Atomic claim — skips posts already grabbed by the cron or another tab
      const claim = await prisma.post.updateMany({
        where: { id: post.id, status: 'SCHEDULED' },
        data: { status: 'PUBLISHING' },
      });
      if (claim.count === 0) continue;

      try {
        const basePlatform = post.platform.split(/[\s-_]+/)[0].toLowerCase();
        const platformEnum = platformEnumMap[basePlatform];
        if (!platformEnum) throw new Error(`Unknown platform: ${post.platform}`);

        const account = await prisma.socialAccount.findFirst({
          where: {
            workspaceId: post.workspaceId,
            platform: platformEnum as any,
          },
        });
        if (!account) throw new Error(`Social account not connected for ${post.platform}.`);

        const result = await publishToPlatformProvider(post, account);
        if (result.success) {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              source: result.liveUrl || result.platformPostId || 'published',
            },
          });
        } else {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              publishError: result.error || 'Failed to publish to platform',
            },
          });
        }
        dispatched++;
      } catch (err: any) {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: 'FAILED',
            publishError: err?.message || 'Unknown dispatch error',
          },
        }).catch(() => {});
      } finally {
        await removeFromScheduleQueue(post.id);
      }
    }

    return { success: true, dispatched };
  } catch (err: any) {
    console.error('[dispatchDueScheduledPosts Error]:', err);
    return { success: false, dispatched: 0, error: err?.message };
  }
}

export async function rejectPost(postId: string, feedback?: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  // If rejected, it goes back to DRAFT state, perhaps saving feedback in a notes field or publishError
  return await prisma.post.update({
    where: { id: postId },
    data: {
      status: 'DRAFT',
      publishError: feedback || 'Rejected by manager',
    },
  });
}

