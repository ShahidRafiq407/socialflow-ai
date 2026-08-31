/**
 * REGRESSION SUITE — Media URL contract (src/lib/media/urls.ts)
 *
 * WHY THIS EXISTS: media URL handling was previously copy-pasted into ~15
 * files with subtle drift between copies. Fixing one copy broke another
 * (preview ↔ publish ping-pong). These tests pin the single shared contract:
 * if a future change breaks any URL kind for any consumer, the suite fails
 * BEFORE deploy instead of surfacing as a "new bug" in production.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAppBaseUrl,
  detectMediaUrlKind,
  parseDataUri,
  extractMediaIdFromApiUrl,
  collectMediaUrls,
  toPublicMediaUrl,
  toAbsoluteAppUrl,
  mimeFromFilename,
  isMediaVideoUrl,
} from '@/lib/media/urls';

// ---------------------------------------------------------------------------
// Env var isolation
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const FALLBACK_BASE = 'https://socialflow-ai-akel.vercel.app';

// ---------------------------------------------------------------------------
// getAppBaseUrl
// ---------------------------------------------------------------------------

describe('getAppBaseUrl', () => {
  it('uses NEXT_PUBLIC_APP_URL when set and not localhost (trailing slash stripped)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com/';
    expect(getAppBaseUrl()).toBe('https://myapp.com');
  });

  it('rejects localhost NEXT_PUBLIC_APP_URL — crawlers cannot reach it', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    expect(getAppBaseUrl()).toBe(FALLBACK_BASE);
  });

  it('rejects 127.0.0.1 NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000';
    expect(getAppBaseUrl()).toBe(FALLBACK_BASE);
  });

  it('falls back to VERCEL_PROJECT_PRODUCTION_URL', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.vercel.app';
    expect(getAppBaseUrl()).toBe('https://prod.vercel.app');
  });

  it('falls back to VERCEL_URL', () => {
    process.env.VERCEL_URL = 'deploy-123.vercel.app';
    expect(getAppBaseUrl()).toBe('https://deploy-123.vercel.app');
  });

  it('prefers NEXT_PUBLIC_APP_URL over Vercel URLs', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.domain';
    process.env.VERCEL_URL = 'deploy.vercel.app';
    expect(getAppBaseUrl()).toBe('https://custom.domain');
  });
});

// ---------------------------------------------------------------------------
// detectMediaUrlKind — the classifier every consumer agrees on
// ---------------------------------------------------------------------------

describe('detectMediaUrlKind', () => {
  it('classifies empty/null/undefined', () => {
    expect(detectMediaUrlKind('')).toBe('empty');
    expect(detectMediaUrlKind(null)).toBe('empty');
    expect(detectMediaUrlKind(undefined)).toBe('empty');
  });

  it('classifies data URIs', () => {
    expect(detectMediaUrlKind('data:image/png;base64,AAA')).toBe('data');
    expect(detectMediaUrlKind('data:video/mp4;base64,AAA')).toBe('data');
  });

  it('classifies blob URLs', () => {
    expect(detectMediaUrlKind('blob:https://x.com/123')).toBe('blob');
  });

  it('classifies internal asset endpoints (with and without leading slash)', () => {
    expect(detectMediaUrlKind('/api/media/asset/abc123')).toBe('asset');
    expect(detectMediaUrlKind('api/media/asset/abc123')).toBe('asset');
  });

  it('classifies internal post streaming endpoints', () => {
    expect(detectMediaUrlKind('/api/media/post123')).toBe('post-media');
    expect(detectMediaUrlKind('/api/media/post123?idx=2')).toBe('post-media');
  });

  it('classifies local uploads (dev-only disk paths)', () => {
    expect(detectMediaUrlKind('/uploads/123-file.png')).toBe('local-upload');
    expect(detectMediaUrlKind('uploads/123-file.png')).toBe('local-upload');
  });

  it('classifies remote URLs', () => {
    expect(detectMediaUrlKind('https://cdn.pixabay.com/photo.jpg')).toBe('remote');
    expect(detectMediaUrlKind('http://example.com/a.png')).toBe('remote');
    expect(
      detectMediaUrlKind('https://proj.supabase.co/storage/v1/object/public/uploads/1-a.png')
    ).toBe('remote');
  });

  it('classifies other relative paths and unknowns', () => {
    expect(detectMediaUrlKind('/static/foo.png')).toBe('relative');
    expect(detectMediaUrlKind('weird-string')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// parseDataUri — the base64 regex that used to live in 14 files
// ---------------------------------------------------------------------------

describe('parseDataUri', () => {
  it('parses a valid base64 data URI', () => {
    expect(parseDataUri('data:image/png;base64,QUJD')).toEqual({
      mimeType: 'image/png',
      base64: 'QUJD',
    });
  });

  it('parses video data URIs', () => {
    expect(parseDataUri('data:video/mp4;base64,QUJD')).toEqual({
      mimeType: 'video/mp4',
      base64: 'QUJD',
    });
  });

  it('returns null for non-data URLs', () => {
    expect(parseDataUri('https://example.com/a.png')).toBeNull();
    expect(parseDataUri('/uploads/a.png')).toBeNull();
  });

  it('returns null for data URIs without the base64 marker', () => {
    expect(parseDataUri('data:image/png,rawdata')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseDataUri('')).toBeNull();
    expect(parseDataUri(null)).toBeNull();
    expect(parseDataUri(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractMediaIdFromApiUrl
// ---------------------------------------------------------------------------

describe('extractMediaIdFromApiUrl', () => {
  it('extracts asset id from /api/media/asset/<id>', () => {
    expect(extractMediaIdFromApiUrl('/api/media/asset/abc123')).toBe('abc123');
  });

  it('extracts post id from /api/media/<id>', () => {
    expect(extractMediaIdFromApiUrl('/api/media/post456')).toBe('post456');
  });

  it('strips file extensions', () => {
    expect(extractMediaIdFromApiUrl('/api/media/asset/abc123.png')).toBe('abc123');
  });

  it('strips query strings', () => {
    expect(extractMediaIdFromApiUrl('/api/media/post456?idx=2')).toBe('post456');
  });

  it('strips the legacy asset- prefix', () => {
    expect(extractMediaIdFromApiUrl('/api/media/asset-xyz')).toBe('xyz');
  });

  it('returns null for non-media URLs', () => {
    expect(extractMediaIdFromApiUrl('https://example.com/a.png')).toBeNull();
    expect(extractMediaIdFromApiUrl('/uploads/a.png')).toBeNull();
    expect(extractMediaIdFromApiUrl('data:image/png;base64,AAA')).toBeNull();
    expect(extractMediaIdFromApiUrl(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// collectMediaUrls
// ---------------------------------------------------------------------------

describe('collectMediaUrls', () => {
  it('prefers mediaHistory.mediaUrls (carousel slides)', () => {
    const post = {
      imageUrl: 'https://a.example/one.png',
      mediaHistory: { mediaUrls: ['https://a.example/1.png', 'https://a.example/2.png'] },
    };
    expect(collectMediaUrls(post)).toEqual(['https://a.example/1.png', 'https://a.example/2.png']);
  });

  it('falls back to imageUrl when no history', () => {
    expect(collectMediaUrls({ imageUrl: 'https://a.example/one.png' })).toEqual([
      'https://a.example/one.png',
    ]);
  });

  it('returns empty array when nothing attached', () => {
    expect(collectMediaUrls({})).toEqual([]);
    expect(collectMediaUrls(null)).toEqual([]);
    expect(collectMediaUrls({ mediaHistory: { mediaUrls: [] } })).toEqual([]);
  });

  it('filters falsy slides out of history', () => {
    const post = {
      mediaHistory: { mediaUrls: ['', null, undefined, 'https://a.example/ok.png'] },
    };
    expect(collectMediaUrls(post)).toEqual(['https://a.example/ok.png']);
  });
});

// ---------------------------------------------------------------------------
// toPublicMediaUrl — THE publish-path invariant
// ---------------------------------------------------------------------------

describe('toPublicMediaUrl', () => {
  const postId = 'post123';

  it('passes absolute public https URLs through as-is', () => {
    const supabase = 'https://proj.supabase.co/storage/v1/object/public/uploads/1-a.png';
    expect(toPublicMediaUrl(supabase, postId)).toBe(supabase);
  });

  it('absolutizes internal asset endpoints', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('/api/media/asset/abc123', postId)).toBe(
      'https://myapp.com/api/media/asset/abc123'
    );
  });

  it('absolutizes internal post streaming endpoints', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('/api/media/post456', postId)).toBe('https://myapp.com/api/media/post456');
  });

  it('proxies data: URIs through the post streaming endpoint', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('data:image/png;base64,AAA', postId)).toBe(
      'https://myapp.com/api/media/post123?idx=0'
    );
  });

  it('proxies blob: URLs', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('blob:https://x/1', postId)).toBe(
      'https://myapp.com/api/media/post123?idx=0'
    );
  });

  it('proxies local /uploads/ paths (disk files do not exist on Vercel)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('/uploads/123-file.png', postId)).toBe(
      'https://myapp.com/api/media/post123?idx=0'
    );
  });

  it('proxies hotlink-protected pixabay URLs even though they are absolute https', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('https://cdn.pixabay.com/photo/123.jpg', postId)).toBe(
      'https://myapp.com/api/media/post123?idx=0'
    );
  });

  it('proxies arbitrary relative paths', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('weird.png', postId)).toBe('https://myapp.com/api/media/post123?idx=0');
  });

  it('carries the carousel slide index', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toPublicMediaUrl('data:image/png;base64,AAA', postId, 3)).toBe(
      'https://myapp.com/api/media/post123?idx=3'
    );
  });

  // THE INVARIANT: external crawlers can only fetch absolute public URLs.
  // If this test ever fails, publishing will break for EVERY platform.
  it('NEVER returns a data:, blob: or relative URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    const inputs = [
      'data:image/png;base64,AAA',
      'data:video/mp4;base64,AAA',
      'blob:https://x/1',
      '/uploads/a.png',
      'uploads/a.png',
      '/api/media/asset/abc',
      '/api/media/post1',
      '/static/a.png',
      'plain-relative.png',
      'https://cdn.pixabay.com/photo/1.jpg',
      'https://proj.supabase.co/storage/v1/object/public/uploads/1.png',
      'http://example.com/a.png',
    ];
    for (const input of inputs) {
      const out = toPublicMediaUrl(input, postId);
      expect(out, `input=${input}`).toMatch(/^https?:\/\//);
      expect(out, `input=${input}`).not.toMatch(/^(data:|blob:)/);
      expect(out, `input=${input}`).not.toMatch(/^\/[^/]/);
    }
  });

  it('returns empty input unchanged', () => {
    expect(toPublicMediaUrl('', postId)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// toAbsoluteAppUrl — server-side byte-download flows (LinkedIn/X/YouTube)
// ---------------------------------------------------------------------------

describe('toAbsoluteAppUrl', () => {
  it('passes data: URIs through unchanged (bytes are inline)', () => {
    expect(toAbsoluteAppUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });

  it('passes absolute URLs through unchanged', () => {
    expect(toAbsoluteAppUrl('https://a.example/x.png')).toBe('https://a.example/x.png');
  });

  it('prepends the app base URL to relative paths', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toAbsoluteAppUrl('/api/media/asset/abc')).toBe('https://myapp.com/api/media/asset/abc');
  });

  it('adds the missing slash for bare relative paths', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    expect(toAbsoluteAppUrl('uploads/a.png')).toBe('https://myapp.com/uploads/a.png');
  });
});

// ---------------------------------------------------------------------------
// mimeFromFilename
// ---------------------------------------------------------------------------

describe('mimeFromFilename', () => {
  it.each([
    ['a.jpg', 'image/jpeg'],
    ['a.jpeg', 'image/jpeg'],
    ['a.PNG', 'image/png'],
    ['a.webp', 'image/webp'],
    ['a.gif', 'image/gif'],
    ['a.mp4', 'video/mp4'],
    ['a.mov', 'video/quicktime'],
    ['a.webm', 'video/webm'],
    ['noext', 'application/octet-stream'],
    ['a.xyz', 'application/octet-stream'],
  ])('maps %s → %s', (filename, expected) => {
    expect(mimeFromFilename(filename)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// isMediaVideoUrl — shared by preview components and publishers
// ---------------------------------------------------------------------------

describe('isMediaVideoUrl', () => {
  it('explicit video type wins', () => {
    expect(isMediaVideoUrl('https://a/x.png', 'video')).toBe(true);
  });

  it('explicit image type wins', () => {
    expect(isMediaVideoUrl('https://a/x.mp4', 'image')).toBe(false);
  });

  it('detects video extensions', () => {
    expect(isMediaVideoUrl('https://a/x.mp4')).toBe(true);
    expect(isMediaVideoUrl('https://a/x.webm')).toBe(true);
    expect(isMediaVideoUrl('https://a/x.mov')).toBe(true);
    expect(isMediaVideoUrl('https://a/x.ogg')).toBe(true);
  });

  it('detects video extensions with query strings', () => {
    expect(isMediaVideoUrl('https://a/x.mp4?token=1')).toBe(true);
  });

  it('detects pixabay video pages', () => {
    expect(isMediaVideoUrl('https://pixabay.com/video/earth-123')).toBe(true);
  });

  it('detects data:video URIs', () => {
    expect(isMediaVideoUrl('data:video/mp4;base64,AAA')).toBe(true);
    expect(isMediaVideoUrl('data:image/png;base64,AAA')).toBe(false);
  });

  it('returns false for image URLs and null', () => {
    expect(isMediaVideoUrl('https://a/x.png')).toBe(false);
    expect(isMediaVideoUrl(null)).toBe(false);
    expect(isMediaVideoUrl('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-path consistency — the exact scenarios that used to ping-pong
// ---------------------------------------------------------------------------

describe('cross-path consistency (preview ↔ publish)', () => {
  it('a Supabase URL previews AND publishes identically (no rewrite)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    const url = 'https://proj.supabase.co/storage/v1/object/public/uploads/1-a.png';
    expect(detectMediaUrlKind(url)).toBe('remote');
    expect(toPublicMediaUrl(url, 'p1')).toBe(url); // publish: as-is
    expect(isMediaVideoUrl(url)).toBe(false); // preview: renders as <img>
  });

  it('a data: URI saved on a draft is publishable via the proxy endpoint', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    const url = 'data:image/png;base64,QUJD';
    expect(detectMediaUrlKind(url)).toBe('data');
    // publish: rewritten to the streaming proxy, which decodes the base64
    expect(toPublicMediaUrl(url, 'p1')).toBe('https://myapp.com/api/media/p1?idx=0');
  });

  it('an /uploads/ path (dev) is proxied for publishing, not sent raw to a crawler', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    const url = '/uploads/123-file.png';
    expect(detectMediaUrlKind(url)).toBe('local-upload');
    expect(toPublicMediaUrl(url, 'p1')).toBe('https://myapp.com/api/media/p1?idx=0');
  });

  it('collectMediaUrls + toPublicMediaUrl keep carousel slide indexes aligned', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.com';
    const post = {
      imageUrl: 'data:image/png;base64,AAA',
      mediaHistory: {
        mediaUrls: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
      },
    };
    const urls = collectMediaUrls(post);
    expect(urls).toHaveLength(2);
    expect(toPublicMediaUrl(urls[0], 'p1', 0)).toBe('https://myapp.com/api/media/p1?idx=0');
    expect(toPublicMediaUrl(urls[1], 'p1', 1)).toBe('https://myapp.com/api/media/p1?idx=1');
  });
});
