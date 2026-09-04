import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { saveMediaBuffer, createSignedUploadUrl, indexMediaAsset } from '@/lib/supabase';
import prisma from '@/lib/db';
import { activeWorkspaceQuery } from '@/lib/workspace/active';
import { checkStorage, gateToResponseBody } from '@/lib/billing/entitlements';

/**
 * The plan's storage ceiling, as a response.
 *
 * Uploads are the other half of the check in `lib/billing/media.ts`: a render is
 * refused there, a file the customer brought is refused here. Both read the same
 * ceiling, and both have to, because bytes cost the same however they arrived.
 *
 * Returns null when there is room, so a caller reads as `const full = await …; if
 * (full) return full;`.
 */
async function storageRefusal(userId: string, addBytes: number): Promise<NextResponse | null> {
  const gate = await checkStorage(userId, addBytes);
  if (gate.allowed) return null;
  const body = gateToResponseBody(gate);
  return NextResponse.json(
    // `error` holds the sentence, not a sentinel: every one of this route's callers —
    // the AI Studio pickers, the three platform editors, the article Media Studio —
    // renders `data.error` in its toast, so a machine code there would put the words
    // "UPGRADE_REQUIRED" in front of the customer. The machine-readable parts travel
    // beside it (`reason`, `upgrade`, `requiredPlan`, `limitMb`, `usedMb`) for a
    // caller that wants to open the upgrade dialog instead.
    { ...body, message: body.error },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('filename') || 'media_asset';

    // A signed ticket is the one upload path whose bytes never touch this server —
    // the browser PUTs them straight into the bucket. If the ceiling is checked only
    // where we can see the file, this is the door around it, so a full account does
    // not get a ticket. The size is unknown here, hence the check for "any room at
    // all"; the exact figure is enforced on the POST paths below.
    const full = await storageRefusal(userId, 0);
    if (full) return full;

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
        // Before the download, not after: a full account should not cause a fetch of
        // bytes that have nowhere to land.
        const preFull = await storageRefusal(userId, 0);
        if (preFull) return preFull;

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

        // Now the size is known, so the ceiling is enforced exactly rather than as
        // "any room at all". Nothing has been persisted yet.
        const sizedFull = await storageRefusal(userId, arrayBuffer.byteLength);
        if (sizedFull) return sizedFull;

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

    const full = await storageRefusal(userId, file.size);
    if (full) return full;

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
