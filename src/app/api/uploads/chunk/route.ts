import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { saveMediaBuffer } from '@/lib/supabase';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspace = await prisma.workspace.findFirst({ where: { userId } });
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string, 10);
    const totalChunks = parseInt(formData.get('totalChunks') as string, 10);
    const filename = (formData.get('filename') as string) || 'upload.mp4';
    const contentType = (formData.get('contentType') as string) || 'application/octet-stream';
    const chunk = formData.get('chunk') as File | null;

    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !chunk) {
      return NextResponse.json({ error: 'Invalid chunk parameters' }, { status: 400 });
    }

    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');

    // Save temporary chunk in MediaAsset
    const chunkFilename = `__chunk__${uploadId}__${chunkIndex}__of__${totalChunks}`;
    await prisma.mediaAsset.create({
      data: {
        url: base64Data,
        filename: chunkFilename,
        contentType,
        size: buffer.length,
        workspaceId: workspace.id,
      },
    });

    // Check if this is the final chunk
    if (chunkIndex === totalChunks - 1) {
      // Fetch all chunks for this uploadId
      const allChunks = await prisma.mediaAsset.findMany({
        where: {
          workspaceId: workspace.id,
          filename: { startsWith: `__chunk__${uploadId}__` },
        },
      });

      if (allChunks.length < totalChunks) {
        return NextResponse.json({
          status: 'partial',
          uploadedChunks: allChunks.length,
          totalChunks,
        }, { status: 200 });
      }

      // Sort chunks by index
      allChunks.sort((a, b) => {
        const idxA = parseInt(a.filename.split('__')[3] || '0', 10);
        const idxB = parseInt(b.filename.split('__')[3] || '0', 10);
        return idxA - idxB;
      });

      // Combine buffers
      const buffers = allChunks.map((c) => Buffer.from(c.url, 'base64'));
      const combinedBuffer = Buffer.concat(buffers);

      // Save full file to Supabase / Storage
      const saved = await saveMediaBuffer(combinedBuffer, filename, contentType, workspace.id);

      // Clean up temporary chunk records in background
      prisma.mediaAsset.deleteMany({
        where: {
          workspaceId: workspace.id,
          filename: { startsWith: `__chunk__${uploadId}__` },
        },
      }).catch(() => {});

      // Record final asset in MediaAsset
      if (!saved.url.includes('/api/media/asset/')) {
        await prisma.mediaAsset.create({
          data: {
            url: saved.url,
            filename: saved.filename,
            contentType,
            size: combinedBuffer.length,
            workspaceId: workspace.id,
          },
        }).catch(() => {});
      }

      return NextResponse.json({
        status: 'completed',
        url: saved.url,
        filename: saved.filename,
      }, { status: 200 });
    }

    return NextResponse.json({
      status: 'chunk_received',
      chunkIndex,
      totalChunks,
    }, { status: 200 });
  } catch (error: any) {
    console.error('[Chunk Upload Error]:', error);
    return NextResponse.json({ error: error.message || 'Chunk upload failed' }, { status: 500 });
  }
}
