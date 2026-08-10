import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { publishToPlatformProvider } from '@/lib/publishers';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    
    const scheduledPosts = await prisma.post.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: {
          lte: now,
        },
      },
    });

    if (scheduledPosts.length === 0) {
      return NextResponse.json({ message: 'No posts to publish' }, { status: 200 });
    }

    const results = [];

    for (const post of scheduledPosts) {
      // Update to PUBLISHING
      await prisma.post.update({
        where: { id: post.id },
        data: { status: 'PUBLISHING' },
      });

      try {
        const account = await prisma.socialAccount.findFirst({
          where: {
            workspaceId: post.workspaceId,
            platform: post.platform as any,
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
              source: result.platformPostId,
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
      }
    }

    return NextResponse.json({ message: 'Processed scheduled posts', results }, { status: 200 });
  } catch (error: any) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
