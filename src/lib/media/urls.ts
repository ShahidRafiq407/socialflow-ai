/**
 * ============================================================================
 * MEDIA URL CONTRACT — SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * This module is the ONLY place that decides how a media URL looks, how it is
 * classified, and how it is converted for a given consumer. It is used by:
 *
 *   - Publishers (src/lib/publishers/*)        → server, publish time
 *   - Media streaming routes (/api/media/**)    → server, fetch time
 *   - Preview components (ContentMediaRenderer) → client, render time
 *   - AI Studio (ensureCleanMediaUrl)           → client, save time
 *
 * WHY THIS EXISTS: this logic used to be copy-pasted into 15+ files with
 * subtle drift between the copies (different env precedence, different
 * pixabay handling, one copy's branch even being dead code). Fixing a bug in
 * one copy left the others stale, so every fix reintroduced a "new" bug
 * elsewhere (preview ↔ publish ping-pong). Change URL behavior HERE only.
 *
 * VALID URL FORMATS STORED ON A POST (Post.imageUrl / mediaHistory.mediaUrls):
 *   1. https://<project>.supabase.co/storage/v1/object/public/uploads/...   ← canonical, preferred
 *   2. data:<mime>;base64,<payload>                                          ← allowed fallback (decoded by /api/media)
 *   3. /api/media/asset/<assetId>                                            ← internal asset endpoint
 *   4. /api/media/<postId>                                                   ← internal post streaming endpoint
 *   5. /uploads/<file>                                                       ← LOCAL DEV ONLY (never exists on Vercel)
 *   6. https://cdn.pixabay.com/... (or other remote CDN)                     ← legacy stock URLs
 *
 * INVARIANT (enforced by tests): toPublicMediaUrl() must NEVER return a
 * relative path, a `data:` URI or a `blob:` URI — external platform crawlers
 * (Meta, TikTok, LinkedIn, Pinterest, X) can only fetch public absolute HTTPS.
 *
 * This module is intentionally pure (no DB, no fs, no fetch) so it runs
 * identically on the server, in route handlers, and in client components.
 */

// ---------------------------------------------------------------------------
// App base URL
// ---------------------------------------------------------------------------

/**
 * Public origin of this deployment. Used to absolute-ify internal media
 * endpoints for external platform crawlers.
 *
 * Precedence: NEXT_PUBLIC_APP_URL (if not localhost) → Vercel production URL
 * → Vercel deployment URL → hardcoded production fallback.
 * Localhost values are rejected because Meta/TikTok crawlers cannot reach
 * a local machine.
 */
export function getAppBaseUrl(): string {
  if (
    process.env.NEXT_PUBLIC_APP_URL &&
    !process.env.NEXT_PUBLIC_APP_URL.includes('localhost') &&
    !process.env.NEXT_PUBLIC_APP_URL.includes('127.0.0.1')
  ) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'https://socialflow-ai-akel.vercel.app';
}

// ---------------------------------------------------------------------------
// URL classification
// ---------------------------------------------------------------------------

export type MediaUrlKind =
  | 'empty'
  | 'data' // base64 data URI — self-contained bytes
  | 'blob' // client-only blob: URL — meaningless on the server
  | 'asset' // /api/media/asset/<id> — internal asset streaming endpoint
  | 'post-media' // /api/media/<postId> — internal post streaming endpoint
  | 'local-upload' // /uploads/<file> — local dev disk only
  | 'remote' // absolute http(s) URL (Supabase CDN, stock CDN, ...)
  | 'relative' // any other same-origin path
  | 'unknown';

/** Classifies a stored media URL into one of the contract kinds above. */
export function detectMediaUrlKind(url: string | null | undefined): MediaUrlKind {
  if (!url) return 'empty';
  if (url.startsWith('data:')) return 'data';
  if (url.startsWith('blob:')) return 'blob';
  if (url.startsWith('/api/media/asset/') || url.startsWith('api/media/asset/')) return 'asset';
  if (url.startsWith('/api/media/') || url.startsWith('api/media/')) return 'post-media';
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) return 'local-upload';
  if (url.startsWith('https://') || url.startsWith('http://')) return 'remote';
  if (url.startsWith('/')) return 'relative';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Data URI parsing (the base64 regex — previously duplicated in 14 files)
// ---------------------------------------------------------------------------

export interface ParsedDataUri {
  mimeType: string;
  base64: string;
}

/**
 * Parses `data:<mime>;base64,<payload>` into its parts.
 * Returns null for anything else (non-data URLs, data URLs without the
 * `;base64` marker, ...).
 */
export function parseDataUri(url: string | null | undefined): ParsedDataUri | null {
  if (!url || !url.startsWith('data:')) return null;
  const match = url.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

// ---------------------------------------------------------------------------
// Internal endpoint IDs
// ---------------------------------------------------------------------------

/**
 * Extracts the MediaAsset/Post id from an internal `/api/media/...` URL.
 * Handles the `asset-` prefix, file extensions and query strings.
 * Returns null when the URL is not an internal media endpoint URL.
 */
export function extractMediaIdFromApiUrl(url: string | null | undefined): string | null {
  if (!url || !url.includes('/api/media/')) return null;
  const after =
    url.split('/api/media/asset/')[1] || url.split('/api/media/')[1];
  if (!after) return null;
  let id = after.split(/[?#]/)[0];
  id = id.replace(/\.[^/.]+$/, ''); // strip extension (e.g. ".png")
  id = id.replace(/^asset-/, ''); // legacy prefix used by uploads flow
  return id || null;
}

// ---------------------------------------------------------------------------
// Media collection (which URLs belong to a post)
// ---------------------------------------------------------------------------

/**
 * All media URLs attached to a post, in slide order.
 * Prefers mediaHistory.mediaUrls (carousel slides) and falls back to
 * the single imageUrl.
 */
export function collectMediaUrls(post: {
  imageUrl?: string | null;
  videoUrl?: string | null;
  mediaHistory?: unknown;
} | null | undefined): string[] {
  const history = post?.mediaHistory as { mediaUrls?: unknown } | undefined;
  const urls = history?.mediaUrls;
  if (Array.isArray(urls) && urls.length > 0) {
    return urls.filter(Boolean).map((u: unknown) => String(u));
  }
  if (post?.videoUrl) return [post.videoUrl];
  if (post?.imageUrl) return [post.imageUrl];
  return [];
}

// ---------------------------------------------------------------------------
// Public URL conversion (publish path)
// ---------------------------------------------------------------------------

/**
 * Converts a stored media URL into one that an EXTERNAL platform crawler can
 * fetch over public HTTPS:
 *
 *   - `/api/media/...` internal endpoints → absolute URL (base prepended)
 *   - everything a crawler cannot fetch (data:, blob:, relative paths,
 *     hotlink-protected CDNs like Pixabay) → post streaming proxy
 *     `${base}/api/media/${postId}?idx=<slideIdx>`
 *   - absolute https/http URLs → used as-is
 *
 * GUARANTEE: the result is never a data:/blob:/relative URL (see tests).
 */
export function toPublicMediaUrl(url: string, postId: string, slideIdx = 0): string {
  if (!url) return url;

  // Our internal asset streaming endpoint — prepend app base URL
  if (url.startsWith('/api/media/')) return `${getAppBaseUrl()}${url}`;

  // Hotlink-protected CDNs (Pixabay) and non-public references
  // (data:, blob:, relative paths, anything non-http) — proxy them through
  // the post streaming endpoint, which fetches with browser headers.
  if (
    url.includes('pixabay.com') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('/') ||
    !url.startsWith('http')
  ) {
    return `${getAppBaseUrl()}/api/media/${postId}?idx=${slideIdx}`;
  }

  // Fully-qualified public URL (Supabase CDN, etc.) — use as-is
  return url;
}

/**
 * Absolute-ifies a URL for SERVER-SIDE fetching (not for external crawlers).
 * `data:` and absolute http(s) URLs pass through unchanged; anything else
 * gets the app base URL prepended. Used where the bytes are downloaded by
 * our own server (LinkedIn/X/YouTube byte-upload flows).
 */
export function toAbsoluteAppUrl(url: string): string {
  if (!url) return url;
  if (/^(https?:|data:)/i.test(url)) return url;
  return `${getAppBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
}

// ---------------------------------------------------------------------------
// Mime type & video detection (preview path + publishers)
// ---------------------------------------------------------------------------

/** Best-effort MIME type from a file extension. */
export function mimeFromFilename(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Heuristic video detection shared by the preview components and publishers:
 * explicit mediaType wins, then URL extension / known video hosts.
 */
export function isMediaVideoUrl(
  url: string | null,
  explicitType?: 'image' | 'video' | string
): boolean {
  if (explicitType === 'video') return true;
  if (explicitType === 'image') return false;
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.endsWith('.mp4') ||
    lowerUrl.endsWith('.webm') ||
    lowerUrl.endsWith('.mov') ||
    lowerUrl.endsWith('.ogg') ||
    lowerUrl.includes('.mp4?') ||
    lowerUrl.includes('.webm?') ||
    lowerUrl.includes('pixabay.com/video/') ||
    lowerUrl.startsWith('data:video/')
  );
}
