import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { saveMediaBuffer } from '@/lib/supabase';
import prisma from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';
    const filename = file.name || 'uploaded_asset';

    const workspace = await prisma.workspace.findFirst({ where: { userId } });
    const saved = await saveMediaBuffer(arrayBuffer, filename, contentType, workspace?.id);

    // If saved.url is already a public URL or local path, ensure MediaAsset is indexed
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
