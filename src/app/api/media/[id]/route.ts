import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Public Media Serving Endpoint
 * GET /api/media/[id]?idx=0
 *
 * Streams the post's image binary with proper headers so external social platforms
 * (Instagram Graph API, Facebook Graph API, LinkedIn, Pinterest, Twitter)
 * can easily and reliably fetch the image over HTTPS.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new NextResponse('Media ID missing', { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const slideIdx = parseInt(searchParams.get('idx') || '0', 10);

    const post = await prisma.post.findUnique({
      where: { id },
      select: { imageUrl: true, mediaHistory: true },
    });

    if (!post) {
      return new NextResponse('Post not found', { status: 404 });
    }

    let targetMediaUrl = post.imageUrl;
    const history = post.mediaHistory as any;
    if (history?.mediaUrls && Array.isArray(history.mediaUrls) && history.mediaUrls[slideIdx]) {
      targetMediaUrl = history.mediaUrls[slideIdx];
    }

    if (!targetMediaUrl) {
      return new NextResponse('No media available for this post', { status: 404 });
    }

    // If it is a base64 Data URI
    if (targetMediaUrl.startsWith('data:')) {
      const match = targetMediaUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        return new NextResponse('Invalid media format', { status: 400 });
      }

      const mimeType = match[1] || 'image/png';
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
      });
    }

    // If it is already a public HTTP/HTTPS URL, redirect or fetch & pipe
    return NextResponse.redirect(targetMediaUrl);
  } catch (error: any) {
    console.error('[Media API Error]:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
