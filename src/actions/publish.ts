"use server";

import prisma from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { publishToPlatformProvider } from '@/lib/publishers';

export async function saveDraft(postData: any) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  let { id, workspaceId, platform, content, imageUrl, imagePrompt, format, hashtags, mediaType, mediaSource, source, campaignTopic, campaignHook, mediaHistory, captionHistory, agentLogs } = postData;

  if (!workspaceId) {
    const workspace = await prisma.workspace.findFirst({ where: { userId } });
    if (!workspace) throw new Error('Workspace not found');
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
}

export async function schedulePost(postId: string, scheduledFor: Date) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  return await prisma.post.update({
    where: { id: postId },
    data: {
      status: 'SCHEDULED',
      scheduledFor,
    },
  });
}

export async function publishNow(postId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { workspace: true },
  });

  if (!post) throw new Error('Post not found');

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

  if (!platformEnum) throw new Error(`Unknown platform: ${post.platform}`);

  const account = await prisma.socialAccount.findFirst({
    where: {
      workspaceId: post.workspaceId,
      platform: platformEnum as any,
    },
  });

  if (!account) throw new Error(`Social account not connected for: ${post.platform}`);

  return await publishToPlatform(post, account);
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
      return await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          source: result.platformPostId, // Or wherever you want to store it
        },
      });
    } else {
      return await prisma.post.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          publishError: result.error,
        },
      });
    }
  } catch (error: any) {
    return await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'FAILED',
        publishError: error.message || 'Unknown error',
      },
    });
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

