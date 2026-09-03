"use server";

// NOTE: maxDuration cannot be exported from a "use server" file (only async
// functions are allowed). The execution window is raised to 300s in the root
// layout and the publish cron route instead — video uploads legitimately take
// minutes.

import prisma from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { publishToPlatformProvider, normalizePlatformToEnum } from '@/lib/publishers';
import { scheduleEnqueue } from '@/lib/redis';

import { uploadBase64ToStorage } from '@/lib/supabase';

export async function saveDraft(postData: any): Promise<any> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Unauthorized. Please sign in again.' };

    let { id, workspaceId, platform, content, imageUrl, videoUrl, imagePrompt, format, hashtags, mediaType, mediaSource, source, campaignTopic, campaignHook, mediaHistory, captionHistory, agentLogs, settings } = postData;

    // The database keeps one canonical media URL column for both stills and
    // videos. Accept videoUrl from callers too, so a generated story/reel is
    // never silently dropped when it is saved from the editor or API.
    imageUrl = imageUrl || videoUrl;

    if (!workspaceId) {
      const workspace = await prisma.workspace.findFirst({ where: { userId } });
      if (!workspace) return { success: false, error: 'Workspace not found. Please complete onboarding first.' };
      workspaceId = workspace.id;
    }

    // If imageUrl is a raw base64 data string, persist it to storage first to keep database and actions light
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      const persistedUrl = await uploadBase64ToStorage(imageUrl, `draft-${platform}-${Date.now()}.png`);
      if (persistedUrl) {
        imageUrl = persistedUrl;
      }
    }

    // Also sanitize mediaHistory if it contains base64 URLs
    if (mediaHistory && Array.isArray(mediaHistory.mediaUrls)) {
      const sanitizedUrls = await Promise.all(
        mediaHistory.mediaUrls.map(async (u: string, idx: number) => {
          if (u && typeof u === 'string' && u.startsWith('data:')) {
            const pUrl = await uploadBase64ToStorage(u, `draft-${platform}-${idx}-${Date.now()}.png`);
            return pUrl || u;
          }
          return u;
        })
      );
      mediaHistory.mediaUrls = sanitizedUrls;
    }

    const data: any = {
      workspaceId,
      platform,
      content: content || '',
      imageUrl: imageUrl || null,
      imagePrompt: imagePrompt || null,
      format: format || 'Feed',
      hashtags: hashtags || [],
      mediaType: mediaType || 'image',
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
    if (settings !== undefined) {
      data.settings = settings;
    }

    let saved: any;
    if (id) {
      saved = await prisma.post.update({
        where: { id },
        data,
      });
    } else {
      saved = await prisma.post.create({
        data,
      });
    }

    return {
      success: true,
      id: saved.id,
      post: {
        id: saved.id,
        platform: saved.platform,
        format: saved.format,
        status: saved.status,
        imageUrl: saved.imageUrl,
      },
    };
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
      await scheduleEnqueue(postId, scheduledFor.getTime()).catch(() => {});
    }

    return {
      success: true,
      id: updated.id,
      post: {
        id: updated.id,
        status: updated.status,
        scheduledFor: scheduledFor instanceof Date ? scheduledFor.toISOString() : String(scheduledFor),
      },
    };
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

    const platformEnum = normalizePlatformToEnum(post.platform);
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

  // Video uploads legitimately take minutes (media download → platform
  // upload → processing polls). Images are fast. The old fixed 30s race
  // killed almost every video publish with a misleading timeout error.
  const formatLower = String(post.format || '').toLowerCase();
  const isVideoPost =
    post.mediaType === 'video' ||
    formatLower.includes('video') ||
    formatLower.includes('reel') ||
    formatLower.includes('short') ||
    String(post.imageUrl || '').toLowerCase().endsWith('.mp4');
  const timeoutMs = isVideoPost ? 300000 : 90000;

  try {
    // Video publishing is genuinely slow: Instagram polls its media container
    // for up to ~45s, Pinterest polls media processing for up to ~45s, and the
    // video bytes must be downloaded + transferred to the platform first.
    // The old 30s race killed these flows mid-flight — that is why IG Reels and
    // Pinterest Video Pins consistently reported "timed out after 30 seconds".
    const PUBLISH_TIMEOUT_MS = 90_000;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Publishing timed out after ${PUBLISH_TIMEOUT_MS / 1000} seconds. The social platform may be slow or your media URL may not be publicly accessible.`)),
        PUBLISH_TIMEOUT_MS
      );
    });

    let result: any;
    try {
      result = await Promise.race([
        publishToPlatformProvider(post, account),
        timeoutPromise,
      ]);
    } finally {
      // Always clear the timer — otherwise the serverless function stays alive
      // (and billing keeps running) until the losing timeout fires.
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    if (result.success) {
      const now = new Date();
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          source: result.liveUrl || result.platformPostId || 'published',
        },
      });
      // Permanent history receipt — survives the Post retention purge
      const { recordPublishLog } = await import('@/lib/publishing/dispatch');
      await recordPublishLog({
        workspaceId: post.workspaceId,
        postId: post.id,
        channel: 'SOCIAL',
        platform: post.platform,
        format: post.format,
        status: 'PUBLISHED',
        liveUrl: result.liveUrl || null,
        mediaUrl: post.imageUrl,
        mediaType: post.mediaType,
        excerpt: post.content,
        topic: post.campaignTopic || null,
        publishedAt: now,
      });
      return {
        success: true,
        post: {
          id: post.id,
          status: 'PUBLISHED',
          platform: post.platform,
          publishedAt: now,
          publishError: null,
        },
        liveUrl: result.liveUrl,
        platformPostId: result.platformPostId,
      };
    } else {
      const errMsg = result.error || 'Failed to publish to platform';
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          publishError: errMsg,
        },
      });
      const { recordPublishLog } = await import('@/lib/publishing/dispatch');
      await recordPublishLog({
        workspaceId: post.workspaceId,
        postId: post.id,
        channel: 'SOCIAL',
        platform: post.platform,
        format: post.format,
        status: 'FAILED',
        mediaUrl: post.imageUrl,
        mediaType: post.mediaType,
        excerpt: post.content,
        topic: post.campaignTopic || null,
        error: errMsg,
      });
      return {
        success: false,
        post: {
          id: post.id,
          status: 'FAILED',
          platform: post.platform,
          publishedAt: null,
          publishError: errMsg,
        },
        error: errMsg,
      };
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error during publishing';
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'FAILED',
        publishError: errorMsg,
      },
    }).catch(() => {});
    return {
      success: false,
      post: {
        id: post.id,
        status: 'FAILED',
        platform: post.platform,
        publishedAt: null,
        publishError: errorMsg,
      },
      error: errorMsg,
    };
  }
}

export async function approvePost(postId: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Unauthorized' };

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) return { success: false, error: 'Post not found' };

    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        status: post.scheduledFor ? 'SCHEDULED' : 'APPROVED',
      },
    });

    return {
      success: true,
      id: updated.id,
      post: {
        id: updated.id,
        status: updated.status,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to approve post' };
  }
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

    const { publishDuePosts, purgePublishedPosts } = await import('@/lib/publishing/dispatch');

    // Retention split: normal published posts are a 1-hour receipt, autopilot
    // posts stay 3 days so the user can review what the AI put out. The slim
    // PublishLog row is never purged, so Lead Goal HQ keeps every live link.
    await purgePublishedPosts(workspaceIds).catch(() => {});

    const result = await publishDuePosts({ workspaceIds, limit: 10 });

    return { success: true, dispatched: result.dispatched };
  } catch (err: any) {
    console.error('[dispatchDueScheduledPosts Error]:', err);
    return { success: false, dispatched: 0, error: err?.message };
  }
}

export async function rejectPost(postId: string, feedback?: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Unauthorized' };

    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        status: 'DRAFT',
        publishError: feedback || 'Rejected by manager',
      },
    });

    return {
      success: true,
      id: updated.id,
      post: {
        id: updated.id,
        status: updated.status,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reject post' };
  }
}

