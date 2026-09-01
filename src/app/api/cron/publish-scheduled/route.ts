import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { publishToPlatformProvider } from '@/lib/publishers';
import {
  acquireCronLock,
  releaseCronLock,
  dequeueDueScheduleJobs,
  removeFromScheduleQueue,
} from '@/lib/redis';

// Video publishing can take minutes — give the cron worker enough runway.
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Distributed lock: overlapping cron runs (many users / multiple instances)
    // must never double-publish the same post
    const lockAcquired = await acquireCronLock(240);
    if (!lockAcquired) {
      return NextResponse.json({ message: 'Cron already running — skipped' }, { status: 200 });
    }

    const now = new Date();

    // Redis sorted-set queue first (only the DUE job ids — no full table scan).
    // Falls back to a bounded Prisma scan when Redis is not configured.
    const dueIds = await dequeueDueScheduleJobs(now.getTime(), 100);
    let scheduledPosts;

    if (dueIds.length > 0) {
      scheduledPosts = await prisma.post.findMany({
        where: {
          id: { in: dueIds },
          status: 'SCHEDULED',
          scheduledFor: { lte: now },
        },
        take: 100,
      });
    } else {
      scheduledPosts = await prisma.post.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledFor: { lte: now },
        },
        take: 100,
      });
    }

    if (scheduledPosts.length === 0) {
      // Clean up any queue entries whose posts are gone or already handled
      for (const id of dueIds) {
        await removeFromScheduleQueue(id);
      }
      await releaseCronLock();
      return NextResponse.json({ message: 'No posts to publish' }, { status: 200 });
    }

    const results = [];

    for (const post of scheduledPosts) {
      // Atomic claim (SCHEDULED → PUBLISHING) guards against double-publish if a
      // lock-less run or the in-app dispatcher overlaps this cron execution.
      const claim = await prisma.post.updateMany({
        where: { id: post.id, status: 'SCHEDULED' },
        data: { status: 'PUBLISHING' },
      });
      if (claim.count === 0) {
        await removeFromScheduleQueue(post.id);
        continue;
      }

      try {
        const { normalizePlatformToEnum } = await import('@/lib/publishers');
        const platformEnum = normalizePlatformToEnum(post.platform);

        if (!platformEnum) {
          throw new Error(`Unknown platform: ${post.platform}`);
        }

        const account = await prisma.socialAccount.findFirst({
          where: {
            workspaceId: post.workspaceId,
            platform: platformEnum as any,
          },
        });

        if (!account) {
          throw new Error(`Social account not found for platform: ${post.platform}`);
        }

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
          results.push({ id: post.id, status: 'PUBLISHED' });
        } else {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              publishError: result.error,
            },
          });
          results.push({ id: post.id, status: 'FAILED', error: result.error });
        }
      } catch (error: any) {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: 'FAILED',
            publishError: error.message || 'Unknown error',
          },
        });
        results.push({ id: post.id, status: 'FAILED', error: error.message });
      } finally {
        // Job handled either way — remove it from the Redis queue
        await removeFromScheduleQueue(post.id);
      }
    }

    await releaseCronLock();
    return NextResponse.json({ message: 'Processed scheduled posts', results }, { status: 200 });
  } catch (error: any) {
    await releaseCronLock().catch(() => {});
    console.error('Cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
