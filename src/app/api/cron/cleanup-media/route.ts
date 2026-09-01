import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RETENTION_HOURS = 24;
const FAILED_RETENTION_DAYS = 7;
const PUBLISHED_RETENTION_HOURS = 1;

/**
 * Auto-Cleanup Cron Job — runs every 6 hours via Vercel Cron
 *
 * Cleans up old data to keep free tiers healthy:
 *
 * 1. Supabase Storage: Deletes media files older than 24 hours
 * 2. Neon DB - MediaAsset: Deletes asset records older than 24 hours
 * 3. Neon DB - Posts: Deletes PUBLISHED posts 1 hour after they go live
 *    (the library keeps them only as a short-lived receipt) and FAILED
 *    posts after 7 days.
 *
 * NEVER deletes: Users, Workspaces, Brand DNA, Settings, Integrations,
 * drafts, scheduled, in-review, or rejected posts.
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (Vercel sets this header for cron jobs)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoffDate = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      retention: `${RETENTION_HOURS} hours`,
      cutoffDate: cutoffDate.toISOString(),
    };

    // =====================================================================
    // 1. Delete old MediaAsset records + their Supabase Storage files
    // =====================================================================
    const oldAssets = await prisma.mediaAsset.findMany({
      where: { createdAt: { lt: cutoffDate } },
      select: { id: true, url: true, filename: true, size: true },
    });

    if (oldAssets.length > 0) {
      // Delete files from Supabase Storage bucket
      if (isSupabaseConfigured()) {
        const supabaseFiles = oldAssets
          .filter(a => a.url?.includes('supabase') || (!a.url?.startsWith('data:') && !a.url?.startsWith('/uploads/')))
          .map(a => {
            // Extract storage path from public URL
            const match = a.url?.match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/);
            return match ? match[1] : a.filename;
          })
          .filter(Boolean);

        if (supabaseFiles.length > 0) {
          try {
            // Supabase Storage bulk delete API
            const deleteRes = await fetch(`${SUPABASE_URL}/storage/v1/object/uploads`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'apikey': SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ prefixes: supabaseFiles }),
            });
            results.supabaseStorageDelete = {
              attempted: supabaseFiles.length,
              status: deleteRes.ok ? 'success' : `failed (${deleteRes.status})`,
            };
          } catch (err: any) {
            results.supabaseStorageDelete = { error: err?.message };
          }
        }
      }

      // Delete DB records
      const deleteResult = await prisma.mediaAsset.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      });

      const freedBytes = oldAssets.reduce((sum, a) => sum + (a.size || 0), 0);
      results.mediaAssets = {
        deleted: deleteResult.count,
        freedMB: (freedBytes / (1024 * 1024)).toFixed(2),
      };
    } else {
      results.mediaAssets = { deleted: 0, message: 'No old assets found' };
    }

    // =====================================================================
    // 2. Delete PUBLISHED posts 1 hour after they go live (short-lived
    //    receipt only — saves DB space) and FAILED posts after 7 days.
    //    Drafts, scheduled, in-review and rejected posts are always kept.
    // =====================================================================
    const publishedCutoff = new Date(
      Date.now() - PUBLISHED_RETENTION_HOURS * 60 * 60 * 1000
    );
    const failedCutoff = new Date(
      Date.now() - FAILED_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const oldPosts = await prisma.post.deleteMany({
      where: {
        OR: [
          { publishedAt: { lt: publishedCutoff }, status: { in: ['PUBLISHED', 'published'] } },
          { publishedAt: null, createdAt: { lt: publishedCutoff }, status: { in: ['PUBLISHED', 'published'] } },
          { createdAt: { lt: failedCutoff }, status: { in: ['FAILED', 'failed'] } },
        ],
      },
    });
    results.posts = {
      deleted: oldPosts.count,
      note: 'Published posts kept for 1 hour, failed posts for 7 days. Drafts, scheduled, in-review and rejected posts are always kept.',
    };

    // =====================================================================
    // 3. Clean up any remaining base64 data URIs in MediaAsset (legacy)
    // =====================================================================
    const base64Cleanup = await prisma.mediaAsset.deleteMany({
      where: { url: { startsWith: 'data:' } },
    });
    if (base64Cleanup.count > 0) {
      results.legacyBase64Cleanup = { deleted: base64Cleanup.count };
    }

    console.log('[Cron: cleanup-media] Completed:', JSON.stringify(results));
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[Cron: cleanup-media] Error:', err);
    return NextResponse.json({ error: err?.message || 'Cleanup failed' }, { status: 500 });
  }
}
