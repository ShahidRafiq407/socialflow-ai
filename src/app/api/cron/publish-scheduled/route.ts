import { NextResponse } from 'next/server';
import {
  acquireCronLock,
  releaseCronLock,
  dequeueDueScheduleJobs,
  removeFromScheduleQueue,
} from '@/lib/redis';
import { publishDuePosts } from '@/lib/publishing/dispatch';

// Video publishing can take minutes — give the cron worker enough runway.
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const keyParam = url.searchParams.get('key');

    // Bearer for Vercel Cron, ?key= so an external scheduler (cron-job.org,
    // QStash) can hit it every few minutes for exact publish times.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && keyParam !== cronSecret) {
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
    // Falls back to a bounded scan inside publishDuePosts when Redis is absent.
    const dueIds = await dequeueDueScheduleJobs(now.getTime(), 100);

    const result = await publishDuePosts(
      dueIds.length > 0 ? { postIds: dueIds, limit: 100 } : { limit: 100 }
    );

    if (result.dispatched === 0) {
      // Clean up any queue entries whose posts are gone or already handled
      for (const id of dueIds) {
        await removeFromScheduleQueue(id).catch(() => {});
      }
    }

    await releaseCronLock();
    return NextResponse.json(
      {
        message: result.dispatched === 0 ? 'No posts to publish' : 'Processed scheduled posts',
        published: result.published,
        failed: result.failed,
        results: result.results,
      },
      { status: 200 }
    );
  } catch (error: any) {
    await releaseCronLock().catch(() => {});
    console.error('Cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
