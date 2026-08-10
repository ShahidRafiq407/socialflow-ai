export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export async function uploadFile(file: ArrayBuffer, filename: string, contentType: string): Promise<string> {
  const bucketName = 'uploads';
  const timestamp = Date.now();
  const path = `${timestamp}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucketName}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
    },
    body: file,
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
