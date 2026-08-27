import fs from 'fs';
import path from 'path';

export const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
  ''
).replace(/\/+$/, '');

export const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  '';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

export async function uploadFile(file: ArrayBuffer | Buffer, filename: string, contentType: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_KEY) are not configured.');
  }

  const bucketName = 'uploads';
  const timestamp = Date.now();
  const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${timestamp}-${cleanName}`;
  
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucketName}/${storagePath}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: file as any,
  });

  if (!response.ok) {
    const errorText = await response.text();
    // If bucket does not exist, attempt to create it automatically
    if (response.status === 404 || errorText.includes('Bucket not found')) {
      try {
        await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: bucketName, name: bucketName, public: true }),
        });
        // Retry upload once
        const retryRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY,
            'Content-Type': contentType,
          },
          body: file as any,
        });
        if (retryRes.ok) return storagePath;
      } catch {}
    }
    throw new Error(`Failed to upload file to Supabase: ${errorText}`);
  }

  return storagePath;
}

function formatSignedUploadUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http')) return rawUrl;
  const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  if (cleanPath.startsWith('/storage/v1/')) {
    return `${SUPABASE_URL}${cleanPath}`;
  }
  return `${SUPABASE_URL}/storage/v1${cleanPath}`;
}

export async function createSignedUploadUrl(filename: string): Promise<{ signedUrl: string; publicUrl: string; storagePath: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const bucketName = 'uploads';
  const timestamp = Date.now();
  const cleanName = (filename || 'media_asset').replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${timestamp}-${cleanName}`;

  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${bucketName}/${storagePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    });

    if (res.ok) {
      const data = await res.json();
      const relativeSignedUrl = data.url || data.signedUrl || data.signedURL;
      if (relativeSignedUrl) {
        const fullSignedUrl = formatSignedUploadUrl(relativeSignedUrl);
        const publicUrl = getPublicUrl(storagePath);
        return { signedUrl: fullSignedUrl, publicUrl, storagePath };
      }
    }

    // Auto-create bucket if missing
    if (res.status === 404) {
      await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: bucketName, name: bucketName, public: true }),
      });
      const retryRes = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${bucketName}/${storagePath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const relativeSignedUrl = retryData.url || retryData.signedUrl || retryData.signedURL;
        if (relativeSignedUrl) {
          const fullSignedUrl = formatSignedUploadUrl(relativeSignedUrl);
          const publicUrl = getPublicUrl(storagePath);
          return { signedUrl: fullSignedUrl, publicUrl, storagePath };
        }
      }
    }
  } catch (err) {
    console.warn('[Supabase] createSignedUploadUrl error:', err);
  }
  return null;
}

export function getPublicUrl(storagePath: string): string {
  const bucketName = 'uploads';
  return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${storagePath}`;
}

/**
 * Creates a MediaAsset DB record for a persisted media URL so the media is
 * indexed and resolvable via /api/media/asset/[id] even if the raw URL is a
 * relative path or a data URI. Returns the asset id (or null on failure).
 */
export async function indexMediaAsset(
  url: string,
  filename: string,
  contentType: string,
  size: number,
  workspaceId?: string
): Promise<string | null> {
  try {
    const prisma = (await import('@/lib/db')).default;
    let targetWorkspaceId = workspaceId;
    if (!targetWorkspaceId) {
      const firstWs = await prisma.workspace.findFirst({ select: { id: true } });
      targetWorkspaceId = firstWs?.id;
    }
    if (!targetWorkspaceId) return null;

    const asset = await prisma.mediaAsset.create({
      data: {
        url,
        filename,
        contentType,
        size,
        workspaceId: targetWorkspaceId,
      },
    });
    return asset.id;
  } catch (err) {
    console.warn('[Storage] Could not index media asset in DB:', err);
    return null;
  }
}

export async function deleteFile(storagePath: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const bucketName = 'uploads';
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketName}/${storagePath}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete file from Supabase: ${error}`);
  }
}


/**
 * Saves a binary media buffer using the best available storage backend:
 * 1. Supabase Storage (if configured)
 * 2. Local public/uploads/ directory (on local disk or Node server)
 * 3. PostgreSQL MediaAsset record (on Vercel Serverless read-only filesystem)
 */
export async function saveMediaBuffer(
  buffer: Buffer | ArrayBuffer,
  originalFilename: string,
  contentType: string = 'image/png',
  workspaceId?: string
): Promise<{ url: string; filename: string }> {
  const timestamp = Date.now();
  const cleanName = (originalFilename || 'media_asset').replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${timestamp}-${cleanName}`;
  const rawBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // 1. Try Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const storagePath = await uploadFile(rawBuffer, filename, contentType);
      return { url: getPublicUrl(storagePath), filename: storagePath };
    } catch (err) {
      console.warn('[Storage] Supabase upload failed, falling back to local/DB storage:', err);
    }
  }

  // 2. Local public/uploads fallback — ONLY for local development.
  //    On Vercel the filesystem is read-only/ephemeral, so a `/uploads/...` URL
  //    would be dead by the time the social platform crawler fetches it. We must
  //    never return a `/uploads/...` URL in production.
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (!isProduction) {
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filePath = path.join(uploadDir, filename);
      await fs.promises.writeFile(filePath, rawBuffer);
      return { url: `/uploads/${filename}`, filename };
    } catch (localErr) {
      console.warn('[Storage] Local disk file save not available, persisting to DB MediaAsset:', localErr);
    }
  }

  // 3. PostgreSQL MediaAsset storage fallback (Vercel Serverless)
  try {
    const prisma = (await import('@/lib/db')).default;
    let targetWorkspaceId = workspaceId;
    if (!targetWorkspaceId) {
      const firstWs = await prisma.workspace.findFirst({ select: { id: true } });
      targetWorkspaceId = firstWs?.id;
    }

    if (targetWorkspaceId) {
      const base64Data = `data:${contentType};base64,${rawBuffer.toString('base64')}`;
      const asset = await prisma.mediaAsset.create({
        data: {
          url: base64Data,
          filename,
          contentType,
          size: rawBuffer.length,
          workspaceId: targetWorkspaceId,
        },
      });
      return { url: `/api/media/asset/${asset.id}`, filename };
    }
  } catch (dbErr) {
    console.error('[Storage] Database asset fallback failed:', dbErr);
  }

  // Emergency fallback
  const base64 = rawBuffer.toString('base64');
  return { url: `data:${contentType};base64,${base64}`, filename };
}

/**
 * Uploads a base64 data string (or Buffer) to Storage and returns its public URL.
 */
export async function uploadBase64ToStorage(
  base64OrDataUrl: string,
  filename: string,
  contentType: string = 'image/png',
  workspaceId?: string
): Promise<string | null> {
  if (!base64OrDataUrl) {
    return null;
  }

  try {
    let cleanBase64 = base64OrDataUrl;
    let resolvedContentType = contentType;

    if (base64OrDataUrl.startsWith('data:')) {
      const match = base64OrDataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        resolvedContentType = match[1] || contentType;
        cleanBase64 = match[2];
      }
    }

    const buffer = Buffer.from(cleanBase64, 'base64');
    const saved = await saveMediaBuffer(buffer, filename, resolvedContentType, workspaceId);
    return saved.url;
  } catch (err) {
    console.warn('[Storage] Failed to save generated asset:', err);
    return null;
  }
}
