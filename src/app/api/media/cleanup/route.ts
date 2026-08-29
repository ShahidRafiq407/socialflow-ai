import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/media/cleanup
 * 
 * Deletes all MediaAsset records that have base64 data URIs stored in the `url` field.
 * This frees up Neon PostgreSQL storage and bandwidth that was wasted by the old
 * DB fallback storing images/videos as base64 text blobs.
 * 
 * After running this, all new media goes exclusively through Supabase Storage.
 */
export async function POST(req: NextRequest) {
  try {
    // Count how many base64 assets exist
    const base64Assets = await prisma.mediaAsset.findMany({
      where: {
        url: { startsWith: 'data:' },
      },
      select: { id: true, size: true },
    });

    if (base64Assets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No base64 media assets found in database. Already clean!',
        deleted: 0,
        freedBytes: 0,
      });
    }

    const totalBytes = base64Assets.reduce((sum, a) => sum + (a.size || 0), 0);

    // Delete all base64 assets from DB
    const result = await prisma.mediaAsset.deleteMany({
      where: {
        url: { startsWith: 'data:' },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${result.count} base64 media assets from Neon database.`,
      deleted: result.count,
      freedBytes: totalBytes,
      freedMB: (totalBytes / (1024 * 1024)).toFixed(2),
    });
  } catch (err: any) {
    console.error('[Media Cleanup Error]:', err);
    return NextResponse.json(
      { error: err?.message || 'Cleanup failed' },
      { status: 500 }
    );
  }
}
