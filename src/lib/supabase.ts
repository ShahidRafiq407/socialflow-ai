export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

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
  const path = `${timestamp}-${cleanName}`;
  
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketName}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
    },
    body: file as any,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file to Supabase: ${error}`);
  }

  return path;
}

export function getPublicUrl(path: string): string {
  const bucketName = 'uploads';
  return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${path}`;
}

export async function deleteFile(path: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const bucketName = 'uploads';
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketName}/${path}`, {
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
 * Uploads a base64 data string (or Buffer) to Supabase Storage and returns its public URL.
 * If Supabase is not configured or upload fails, returns null gracefully.
 */
export async function uploadBase64ToStorage(
  base64OrDataUrl: string,
  filename: string,
  contentType: string = 'image/png'
): Promise<string | null> {
  if (!isSupabaseConfigured() || !base64OrDataUrl) {
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
    const path = await uploadFile(buffer, filename, resolvedContentType);
    return getPublicUrl(path);
  } catch (err) {
    console.warn('[Supabase Storage] Failed to upload generated asset to Supabase:', err);
    return null;
  }
}
