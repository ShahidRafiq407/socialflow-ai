import fs from 'fs';
import path from 'path';

/**
 * Normalizes the SUPABASE_URL env value. Common copy-paste mistakes put a
 * service path suffix on the project URL (e.g. ".../rest/v1" from the API
 * page or ".../storage/v1" from the Storage page). Every storage call then
 * builds paths like /rest/v1/storage/v1/object/... which Supabase's gateway
 * rejects with PGRST125 "Invalid path specified in request URL" — exactly the
 * 404 the signed-upload endpoint surfaces. Strip the suffixes instead of
 * failing, and report what was changed so the env var can be fixed properly.
 */
function normalizeSupabaseUrl(raw: string): { url: string; warning: string | null } {
  let url = (raw || '').trim().replace(/\/+$/, '');
  const SERVICE_SUFFIX = /\/(storage|rest|auth)\/v1$/i;
  let stripped = false;
  while (SERVICE_SUFFIX.test(url)) {
    url = url.replace(SERVICE_SUFFIX, '');
    stripped = true;
  }
  const warning = stripped
    ? `SUPABASE_URL ended with a service path (/storage/v1, /rest/v1 or /auth/v1) — normalized to project root "${url}". Update the env var to just the project URL (e.g. https://<project-ref>.supabase.co).`
    : null;
  return { url, warning };
}

const rawSupabaseUrl = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
  ''
);

const normalizedSupabase = normalizeSupabaseUrl(rawSupabaseUrl);
export const SUPABASE_URL = normalizedSupabase.url;
if (normalizedSupabase.warning) {
  console.warn('[Supabase]', normalizedSupabase.warning);
}

export const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  '';

/** Non-secret host for error messages (project refs appear in public URLs anyway). */
function supabaseHostForErrors(): string {
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return SUPABASE_URL.slice(0, 60) || '(empty)';
  }
}

/**
 * Pre-flight validation for common fatal SUPABASE_URL mistakes that the
 * storage API cannot self-heal (dashboard URLs, connection strings, keys).
 * Returns a human-actionable error string, or null when the URL looks sane.
 */
export function validateSupabaseUrlForErrors(): string | null {
  if (!SUPABASE_URL) return null; // "not configured" is handled by isSupabaseConfigured
  const asLower = SUPABASE_URL.toLowerCase();
  if (/^https?:\/\/(www\.)?supabase\.com\//.test(asLower)) {
    return `SUPABASE_URL "${supabaseHostForErrors()}" is the Supabase dashboard URL. Set it to your project URL, e.g. https://<project-ref>.supabase.co (find it in Project Settings → API → Project URL).`;
  }
  if (!/^https?:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(SUPABASE_URL)) {
    return `SUPABASE_URL "${SUPABASE_URL.slice(0, 60)}" is not a valid http(s) project URL. Expected something like https://<project-ref>.supabase.co`;
  }
  return null;
}

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

  // Supabase's /object/upload/sign endpoint returns a relative path like
  //   /object/upload/sign/uploads/123-file.png?token=...
  // which is relative to the Storage API root -- it MUST be prefixed with
  // `${SUPABASE_URL}/storage/v1` (the official storage-js SDK does exactly
  // `new URL(this.url + data.url)` where this.url ends with /storage/v1).
  // Prefixing the bare SUPABASE_URL without /storage/v1 produces a 404 and
  // every large (>3MB) direct upload fails.
  if (cleanPath.startsWith('/storage/v1/')) {
    return `${SUPABASE_URL}${cleanPath}`;
  }
  return `${SUPABASE_URL}/storage/v1${cleanPath}`;
}

// Memoized per serverless process so we only pay for one extra API call.
let bucketPublicEnsured = false;

/**
 * Best-effort: guarantee the `uploads` bucket is PUBLIC.
 * If the bucket exists but is private, uploads succeed (service key bypasses
 * RLS) yet the public object URL 404s -- Meta/LinkedIn/TikTok crawlers then
 * fail to fetch the media and publishing dies with a generic server error.
 */
async function ensureBucketPublic(bucketName: string = 'uploads'): Promise<void> {
  if (bucketPublicEnsured || !isSupabaseConfigured()) return;
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucketName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ public: true }),
    });
    bucketPublicEnsured = true;
  } catch {
    // Non-fatal -- the publishing pipeline surfaces a clear error if unreachable.
  }
}

export type SignedUploadTicket =
  | { ok: true; signedUrl: string; publicUrl: string; storagePath: string }
  | { ok: false; error: string };

/**
 * Creates a Supabase signed UPLOAD URL so the browser can PUT large files
 * directly to Storage, bypassing Vercel's ~4.5MB request-body limit.
 *
 * Previously this silently returned `null` on ANY failure, which surfaced in
 * the UI as the unhelpful "Could not get signed upload URL from backend".
 * Now the exact Supabase response (status + body) is captured, logged, and
 * returned so the UI toast / Vercel logs show the real cause (missing bucket,
 * insufficient key permissions, wrong env key, etc.).
 */
export async function createSignedUploadUrl(filename: string): Promise<SignedUploadTicket> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing in environment).' };
  }
  const urlError = validateSupabaseUrlForErrors();
  if (urlError) {
    return { ok: false, error: `Invalid SUPABASE_URL: ${urlError}` };
  }
  const bucketName = 'uploads';
  await ensureBucketPublic(bucketName);
  const timestamp = Date.now();
  const cleanName = (filename || 'media_asset').replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${timestamp}-${cleanName}`;
  const signEndpoint = `${SUPABASE_URL}/storage/v1/object/upload/sign/${bucketName}/${storagePath}`;

  const attemptSign = async (): Promise<{ signedUrl?: string; error?: string }> => {
    try {
      const res = await fetch(signEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      const text = await res.text();
      if (res.ok) {
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* handled below */ }
        const relativeSignedUrl = data?.url || data?.signedUrl || data?.signedURL;
        if (relativeSignedUrl) return { signedUrl: formatSignedUploadUrl(relativeSignedUrl) };
        return { error: `Supabase sign response did not include a url field (body: ${text.slice(0, 200)})` };
      }
      return {
        error:
          `Supabase sign endpoint returned HTTP ${res.status}: ${text.slice(0, 300)}` +
          (/PGRST125|invalid path/i.test(text)
            ? ` — the request path was rejected. Check SUPABASE_URL (host: ${supabaseHostForErrors()}); it must be the project root URL like https://<project-ref>.supabase.co WITHOUT /storage/v1, /rest/v1, or dashboard paths.`
            : ''),
      };
    } catch (err: any) {
      return { error: `Signed-URL request failed: ${err?.message || String(err)}` };
    }
  };

  let result = await attemptSign();

  // Auto-create the bucket and retry once when it simply does not exist yet.
  if (!result.signedUrl && /404|Bucket not found/i.test(result.error || '')) {
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
    } catch { /* non-fatal — the retry result decides */ }
    result = await attemptSign();
  }

  if (!result.signedUrl) {
    console.error('[Supabase] createSignedUploadUrl failed:', result.error);
    return { ok: false, error: result.error || 'Unknown signed-upload failure' };
  }

  return { ok: true, signedUrl: result.signedUrl, publicUrl: getPublicUrl(storagePath), storagePath };
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
 *   1. Supabase Storage (if configured) — preferred, required for large media
 *   2. Local public/uploads directory (local development only)
 *   3. PostgreSQL MediaAsset record (serverless production without Supabase) —
 *      small media only (<= 5MB). Served via /api/media/asset/<id>.
 *
 * The DB fallback (removed in 2b742e2, restored here) is what made PC uploads
 * work before Supabase was ever configured. Removing it broke ALL local file
 * uploads in production with Supabase env vars unset, while the AI pipeline
 * silently fell back to data: URLs — which is why "AI content publishes fine
 * but my local upload fails". Storage served from the DB is bandwidth-heavy,
 * so configure SUPABASE_URL + SUPABASE_SERVICE_KEY for production quality.
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
  let supabaseError: string | null = null;

  // 1. Supabase Storage — preferred backend when configured.
  if (isSupabaseConfigured()) {
    try {
      const storagePath = await uploadFile(rawBuffer, filename, contentType);
      await ensureBucketPublic();
      return { url: getPublicUrl(storagePath), filename: storagePath };
    } catch (err: any) {
      // A paused/unreachable Supabase project (free tier auto-pauses after
      // inactivity) must NOT take uploads down with it: log and fall through
      // to the next backend instead of hard-failing (pre-2b742e2 behavior).
      supabaseError = err?.message || 'Unknown error';
      console.error('[Storage] Supabase upload FAILED, falling back to local/DB storage:', supabaseError);
    }
  }

  // 2. Local public/uploads fallback — ONLY for local development.
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
      console.warn('[Storage] Local disk save failed:', localErr);
    }
  }

  // 3. PostgreSQL MediaAsset fallback (serverless production, or Supabase down).
  //    Small media only: base64 inflates ~33% and multi-MB blobs are slow to
  //    serve from the DB. Larger files REQUIRE working Supabase (or another
  //    object store) — surface a clear, actionable error instead of bloating Neon.
  const MAX_DB_FALLBACK_BYTES = 5 * 1024 * 1024; // 5MB
  if (rawBuffer.length > MAX_DB_FALLBACK_BYTES) {
    throw new Error(
      (supabaseError
        ? `Supabase Storage upload failed: ${supabaseError}. `
        : '') +
      `Media file (${(rawBuffer.length / (1024 * 1024)).toFixed(1)}MB) is too large to store without working Supabase Storage. ` +
      'Check that your Supabase project is active (not paused) and set SUPABASE_URL + SUPABASE_SERVICE_KEY.'
    );
  }

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
      const ext = contentType.includes('video') ? '.mp4' : '.png';
      return { url: `/api/media/asset/${asset.id}${ext}`, filename };
    }
  } catch (dbErr) {
    console.error('[Storage] Database asset fallback failed:', dbErr);
  }

  throw new Error(
    'Media storage failed: no storage backend available' +
    (supabaseError ? ` (Supabase: ${supabaseError})` : '') +
    '. Configure Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_KEY) for reliable uploads.'
  );
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


