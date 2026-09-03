import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { saveMediaBuffer, createSignedUploadUrl, indexMediaAsset } from '@/lib/supabase';
import prisma from '@/lib/db';
import { activeWorkspaceQuery } from '@/lib/workspace/active';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('filename') || 'media_asset';

    const signed = await createSignedUploadUrl(filename);
    if (signed.ok) {
      return NextResponse.json(signed, { status: 200 });
    }

    // Surface the REAL reason (bad key, missing bucket, RLS, ...) instead of a
    // generic 404 — it lands in the UI toast and in Vercel function logs.
    console.error('[Uploads] Signed upload ticket failed:', signed.error);
    return NextResponse.json({ error: signed.error }, { status: 500 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create upload ticket' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspace = await prisma.workspace.findFirst(await activeWorkspaceQuery(userId));

    // ------------------------------------------------------------------
    // Path A: Server-side download from a remote URL (stock media, etc.)
    // Client sends POST /api/uploads?url=https://cdn.pixabay.com/...
    // We fetch on the server (no CORS) and persist to Supabase/DB.
    // ------------------------------------------------------------------
    const { searchParams } = new URL(req.url);
    const remoteUrl = searchParams.get('url');

    if (remoteUrl && remoteUrl.startsWith('http')) {
      try {
        const dlRes = await fetch(remoteUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/*,video/*,*/*',
            'Referer': remoteUrl.includes('pixabay.com') ? 'https://pixabay.com/'
                     : remoteUrl.includes('pexels.com') ? 'https://www.pexels.com/' : '',
          },
        });

        if (!dlRes.ok) {
          return NextResponse.json(
            { error: `Failed to download remote media (HTTP ${dlRes.status})` },
            { status: 502 }
          );
        }

        const contentType = dlRes.headers.get('content-type') || 'application/octet-stream';
        const arrayBuffer = await dlRes.arrayBuffer();

        // Derive filename from URL
        const urlPath = new URL(remoteUrl).pathname;
        const filename = urlPath.split('/').pop() || `stock_${Date.now()}.${contentType.includes('video') ? 'mp4' : 'png'}`;

        const saved = await saveMediaBuffer(arrayBuffer, filename, contentType, workspace?.id);

        // Index in MediaAsset if not already an asset URL
        if (workspace && !saved.url.includes('/api/media/asset/')) {
          await indexMediaAsset(saved.url, saved.filename, contentType, arrayBuffer.byteLength, workspace.id);
        }

        return NextResponse.json({ url: saved.url, filename: saved.filename }, { status: 200 });
      } catch (dlErr: any) {
        console.error('[Uploads] Remote URL download failed:', dlErr);
        return NextResponse.json(
          { error: dlErr.message || 'Failed to download remote media' },
          { status: 502 }
        );
      }
    }

    // ------------------------------------------------------------------
    // Path B: Standard multipart file upload from the client
    // ------------------------------------------------------------------
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';
    const filename = file.name || 'uploaded_asset';

    const saved = await saveMediaBuffer(arrayBuffer, filename, contentType, workspace?.id);

    // Index in MediaAsset if not already an asset URL
    if (workspace && !saved.url.includes('/api/media/asset/')) {
      try {
        await prisma.mediaAsset.create({
          data: {
            url: saved.url,
            filename: saved.filename,
            contentType,
            size: file.size,
            workspaceId: workspace.id,
          },
        });
      } catch (dbErr) {
        console.warn('[Uploads] Could not record media asset in DB:', dbErr);
      }
    }

    return NextResponse.json({ url: saved.url, filename: saved.filename }, { status: 200 });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Failed to upload file' }, { status: 500 });
  }
}
