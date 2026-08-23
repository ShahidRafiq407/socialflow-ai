import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getMimeTypeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Public Media Serving Endpoint
 * GET /api/media/[id]?idx=0
 *
 * Streams the post's image/video binary with proper headers so external social platforms
 * (Instagram Graph API, Facebook Graph API, TikTok, LinkedIn, Pinterest, Twitter)
 * can easily and reliably fetch the media over HTTPS without encountering 403 hotlink blocks.
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

    let targetMediaUrl: string | null = null;
    const cleanId = id.replace(/^asset-/, '');

    // 1. Try finding Post
    const post = await prisma.post.findUnique({
      where: { id },
      select: { imageUrl: true, mediaHistory: true },
    });

    if (post) {
      targetMediaUrl = post.imageUrl;
      const history = post.mediaHistory as any;
      if (history?.mediaUrls && Array.isArray(history.mediaUrls) && history.mediaUrls[slideIdx]) {
        targetMediaUrl = history.mediaUrls[slideIdx];
      }
    }

    // 2. If targetMediaUrl points to an internal asset or post not found, check MediaAsset table
    if (!targetMediaUrl || targetMediaUrl.includes('/api/media/')) {
      const assetId = targetMediaUrl
        ? targetMediaUrl.split('/api/media/asset/')[1] || targetMediaUrl.split('/api/media/')[1] || cleanId
        : cleanId;

      const asset = await prisma.mediaAsset.findUnique({
        where: { id: assetId },
        select: { url: true, contentType: true },
      });
      if (asset) {
        targetMediaUrl = asset.url;
      }
    }

    if (!targetMediaUrl) {
      return new NextResponse('No media available for this post', { status: 404 });
    }

    // A. If it is a base64 Data URI
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

    // B. If it is a local upload path on disk (/uploads/...)
    if (targetMediaUrl.startsWith('/uploads/') || targetMediaUrl.startsWith('uploads/')) {
      const cleanPath = targetMediaUrl.startsWith('/') ? targetMediaUrl.slice(1) : targetMediaUrl;
      const diskPath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(diskPath)) {
        const fileBuffer = await fs.promises.readFile(diskPath);
        const mimeType = getMimeTypeFromFilename(diskPath);
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Length': fileBuffer.length.toString(),
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
          },
        });
      }
    }

    // C. If it is an external HTTP/HTTPS URL (e.g. Pixabay stock media or external CDN)
    // We proxy-fetch on the server with browser headers to bypass 403 anti-hotlink blocks
    if (targetMediaUrl.startsWith('http://') || targetMediaUrl.startsWith('https://')) {
      try {
        const fetchRes = await fetch(targetMediaUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/*,video/*,*/*',
            'Referer': targetMediaUrl.includes('pixabay.com') ? 'https://pixabay.com/' : '',
          },
        });

        if (fetchRes.ok) {
          const contentType = fetchRes.headers.get('content-type') || getMimeTypeFromFilename(targetMediaUrl);
          const arrayBuf = await fetchRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);

          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': buffer.length.toString(),
              'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
            },
          });
        }
      } catch (proxyErr) {
        console.warn('[Media API] Proxy fetch failed, falling back to redirect:', proxyErr);
      }

      // Fallback: direct redirect
      return NextResponse.redirect(targetMediaUrl);
    }

    return new NextResponse('Media not found', { status: 404 });
  } catch (error: any) {
    console.error('[Media API Error]:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
