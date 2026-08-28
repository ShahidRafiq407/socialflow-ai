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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new NextResponse('Asset ID missing', { status: 400 });
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id },
      select: { url: true, contentType: true, filename: true },
    });

    if (!asset || !asset.url) {
      return new NextResponse('Asset not found', { status: 404 });
    }

    const targetUrl = asset.url;

    // 1. Data URI
    if (targetUrl.startsWith('data:')) {
      const match = targetUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        return new NextResponse('Invalid media format', { status: 400 });
      }

      const mimeType = match[1] || asset.contentType || 'image/png';
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

    // 2. Local disk file
    if (targetUrl.startsWith('/uploads/') || targetUrl.startsWith('uploads/')) {
      const cleanPath = targetUrl.startsWith('/') ? targetUrl.slice(1) : targetUrl;
      const diskPath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(diskPath)) {
        const fileBuffer = await fs.promises.readFile(diskPath);
        const mimeType = asset.contentType || getMimeTypeFromFilename(diskPath);
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

    // 3. External URL (Supabase CDN or remote)
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      return NextResponse.redirect(targetUrl, { status: 302 });
    }

    return new NextResponse('Media not found', { status: 404 });
  } catch (err: any) {
    console.error('[Asset API Error]:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
