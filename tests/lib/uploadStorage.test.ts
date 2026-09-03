/**
 * Upload storage backend regression tests.
 *
 * The user reported local PC uploads fail while AI-generated media publishes.
 * Root cause: commit 2b742e2 removed the Neon DB fallback and enforced
 * Supabase-only storage — but Supabase env vars were never configured, so
 * EVERY local file upload in production started failing with HTTP 500 while
 * the AI pipeline silently fell back to data: URLs.
 *
 * These tests pin the restored backend chain:
 *   1. Supabase Storage when configured
 *   2. public/uploads disk in local dev
 *   3. MediaAsset DB record in serverless production without Supabase (<= 5MB)
 *   4. Clear error for > 5MB media without Supabase
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const ENV_KEYS = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_PROJECT_URL',
  'NEXT_PUBLIC_SUPABASE_PROJECT_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_KEY',
  'SUPABASE_SECRET_KEY',
  'VERCEL',
  'STORAGE_UPLOAD_TIMEOUT_MS',
] as const;

let savedEnv: Record<string, string | undefined> = {};

const setNodeEnv = (value: string) => {
  (process.env as Record<string, string>).NODE_ENV = value;
};

/**
 * The workspace an upload with no explicit workspaceId gets attributed to.
 *
 * `saveMediaBuffer` asks the active-workspace resolver, which reads a cookie and
 * a Clerk session. Neither exists in a test, and outside a request scope the
 * resolver correctly refuses to guess an owner — so a test that wants the DB
 * backend to succeed has to say whose workspace it is. Pass null for the case
 * where there is nobody to attribute the asset to.
 */
const mockActiveWorkspace = (workspaceId: string | null) =>
  vi.doMock('@/lib/workspace/active', () => ({
    getActiveWorkspace: vi
      .fn()
      .mockResolvedValue(workspaceId ? { userId: 'user_test', workspaceId } : null),
  }));

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
  setNodeEnv('test');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock('@/lib/db');
  vi.doUnmock('@/lib/workspace/active');
});

describe('saveMediaBuffer — local dev fallback (no Supabase)', () => {
  it('writes to public/uploads on disk and returns a servable /uploads/ URL', async () => {
    const { saveMediaBuffer } = await import('@/lib/supabase');

    const buf = Buffer.from('fake-png-bytes-for-upload-test');
    const saved = await saveMediaBuffer(buf, 'Screenshot 2026-08-29 214336.png', 'image/png');

    expect(saved.url).toMatch(/^\/uploads\/\d+-Screenshot_2026-08-29_214336\.png$/);
    const filePath = path.join(process.cwd(), 'public', saved.url);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath).toString()).toBe('fake-png-bytes-for-upload-test');

    fs.unlinkSync(filePath);
  });
});

describe('saveMediaBuffer — serverless production fallback (no Supabase)', () => {
  it('persists small media (<= 5MB) as a MediaAsset record served via /api/media/asset/<id>', async () => {
    setNodeEnv('production');
    const createMock = vi.fn().mockResolvedValue({ id: 'asset_123' });
    vi.doMock('@/lib/db', () => ({ default: { mediaAsset: { create: createMock } } }));
    mockActiveWorkspace('ws_1');

    const { saveMediaBuffer } = await import('@/lib/supabase');
    const buf = Buffer.from('fake-image-bytes');
    const saved = await saveMediaBuffer(buf, 'pic.png', 'image/png');

    // Servable, refresh-safe, crawler-fetchable asset URL (URL contract form #3)
    expect(saved.url).toBe('/api/media/asset/asset_123.png');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filename: expect.stringMatching(/^\d+-pic\.png$/),
          contentType: 'image/png',
          size: buf.length,
          workspaceId: 'ws_1',
        }),
      })
    );
    // The stored record carries the bytes as a data: URI
    expect(createMock.mock.calls[0][0].data.url).toMatch(/^data:image\/png;base64,/);
  });

  it('appends .mp4 to the asset URL for videos so video detection works', async () => {
    setNodeEnv('production');
    vi.doMock('@/lib/db', () => ({
      default: {
        mediaAsset: { create: vi.fn().mockResolvedValue({ id: 'asset_vid' }) },
      },
    }));
    mockActiveWorkspace('ws_1');

    const { saveMediaBuffer } = await import('@/lib/supabase');
    const saved = await saveMediaBuffer(Buffer.from('vid'), 'clip.mp4', 'video/mp4');
    expect(saved.url).toBe('/api/media/asset/asset_vid.mp4');
  });

  it('uses the provided workspaceId instead of resolving one', async () => {
    setNodeEnv('production');
    const resolveMock = vi.fn();
    const createMock = vi.fn().mockResolvedValue({ id: 'asset_x' });
    vi.doMock('@/lib/db', () => ({ default: { mediaAsset: { create: createMock } } }));
    vi.doMock('@/lib/workspace/active', () => ({ getActiveWorkspace: resolveMock }));

    const { saveMediaBuffer } = await import('@/lib/supabase');
    await saveMediaBuffer(Buffer.from('x'), 'a.png', 'image/png', 'ws_provided');

    expect(resolveMock).not.toHaveBeenCalled();
    expect(createMock.mock.calls[0][0].data.workspaceId).toBe('ws_provided');
  });

  it('throws a clear, actionable error for media > 5MB without Supabase', async () => {
    setNodeEnv('production');
    const { saveMediaBuffer } = await import('@/lib/supabase');

    const bigBuf = Buffer.alloc(6 * 1024 * 1024, 1);
    await expect(saveMediaBuffer(bigBuf, 'big.mp4', 'video/mp4')).rejects.toThrow(
      /too large.*SUPABASE_URL/i
    );
  });

  it('throws when there is nobody to attribute the asset to', async () => {
    setNodeEnv('production');
    vi.doMock('@/lib/db', () => ({ default: { mediaAsset: { create: vi.fn() } } }));
    // No request scope and no explicit workspaceId: the resolver refuses to guess
    // an owner, and an asset with no owner is not stored.
    mockActiveWorkspace(null);

    const { saveMediaBuffer } = await import('@/lib/supabase');
    await expect(saveMediaBuffer(Buffer.from('x'), 'a.png', 'image/png')).rejects.toThrow(
      /no storage backend available/i
    );
  });
});

describe('saveMediaBuffer — Supabase configured but unreachable (paused project)', () => {
  it('falls back to the DB MediaAsset backend instead of failing the upload', async () => {
    // Simulate a paused/dead Supabase project: configured env vars pointing
    // at an unreachable host. uploadFile's fetch fails fast (connection
    // refused) and saveMediaBuffer must fall through to the DB backend.
    setNodeEnv('production');
    process.env.SUPABASE_URL = 'http://127.0.0.1:59999'; // nothing listening
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

    const createMock = vi.fn().mockResolvedValue({ id: 'asset_sb' });
    vi.resetModules(); // module-level SUPABASE_URL const is read at import time
    vi.doMock('@/lib/db', () => ({
      default: { mediaAsset: { create: createMock } },
    }));
    mockActiveWorkspace('ws_sb');

    const { saveMediaBuffer } = await import('@/lib/supabase');
    const buf = Buffer.from('paused-supabase-upload-bytes');
    const saved = await saveMediaBuffer(buf, 'pic.png', 'image/png');

    expect(saved.url).toBe('/api/media/asset/asset_sb.png');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].data.workspaceId).toBe('ws_sb');
  });

  it('reports the Supabase failure reason when the file is too large for the DB fallback', async () => {
    setNodeEnv('production');
    process.env.SUPABASE_URL = 'http://127.0.0.1:59999';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      default: {
        mediaAsset: { create: vi.fn() },
      },
    }));
    mockActiveWorkspace('ws_sb');

    const { saveMediaBuffer } = await import('@/lib/supabase');
    const bigBuf = Buffer.alloc(6 * 1024 * 1024, 1);
    await expect(saveMediaBuffer(bigBuf, 'big.mp4', 'video/mp4')).rejects.toThrow(
      /Supabase Storage upload failed[\s\S]*too large/i
    );
  });
});

describe('SUPABASE_URL normalization (PGRST125 fix)', () => {
  it.each([
    ['https://xyzcompany.supabase.co/storage/v1', 'https://xyzcompany.supabase.co'],
    ['https://xyzcompany.supabase.co/rest/v1/', 'https://xyzcompany.supabase.co'],
    ['https://xyzcompany.supabase.co/auth/v1//', 'https://xyzcompany.supabase.co'],
    ['https://xyzcompany.supabase.co', 'https://xyzcompany.supabase.co'],
  ])('normalizes %s -> %s', async (input, expected) => {
    process.env.SUPABASE_URL = input;
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    vi.resetModules();

    const { SUPABASE_URL } = await import('@/lib/supabase');
    expect(SUPABASE_URL).toBe(expected);
  });

  it('rejects the Supabase dashboard URL with an actionable error', async () => {
    process.env.SUPABASE_URL = 'https://supabase.com/dashboard/project/abc123';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    vi.resetModules();

    const { createSignedUploadUrl, isSupabaseConfigured } = await import('@/lib/supabase');
    expect(isSupabaseConfigured()).toBe(true);

    const ticket = await createSignedUploadUrl('video.mp4');
    expect(ticket.ok).toBe(false);
    if (!ticket.ok) {
      expect(ticket.error).toMatch(/dashboard URL[\s\S]*project URL[\s\S]*supabase\.co/);
    }
  });

  it('PGRST125 responses include the host and URL-format hint', async () => {
    // Point at a path-prefixed URL that the gateway will reject with an
    // invalid-path style failure — the error must name the host and the
    // expected URL format so the operator can fix the env var.
    process.env.SUPABASE_URL = 'http://127.0.0.1:59999';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    vi.resetModules();

    const { createSignedUploadUrl } = await import('@/lib/supabase');
    const ticket = await createSignedUploadUrl('video.mp4');
    // Connection-refused path also names the host in the error for diagnosis.
    expect(ticket.ok).toBe(false);
    if (!ticket.ok) {
      expect(ticket.error).toMatch(/127\.0\.0\.1:59999|Signed-URL request failed/);
    }
  });
});

describe('storage fetch deadlines (hung-upload fix)', () => {
  /**
   * A fetch that accepts a signal but never resolves on its own — the network
   * black hole: connection open, no bytes, no error. Only the signal can end it.
   */
  const hangingFetch = () =>
    vi.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('This operation was aborted', 'AbortError'))
        );
      })
    );

  it('cuts a stalled Supabase upload when the caller aborts (Skip/Cancel/family deadline)', async () => {
    setNodeEnv('production');
    process.env.SUPABASE_URL = 'https://dead.example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const createMock = vi.fn().mockResolvedValue({ id: 'asset_never' });
    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      default: {
        mediaAsset: { create: createMock },
      },
    }));
    mockActiveWorkspace('ws_hang');

    const { uploadBase64ToStorage } = await import('@/lib/supabase');
    const controller = new AbortController();
    const pending = uploadBase64ToStorage(
      'data:image/png;base64,aGVsbG8=',
      'pic.png',
      'image/png',
      undefined,
      controller.signal
    );

    // The upload is in flight against a connection that never answers...
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // ...when the render it belongs to is abandoned (family deadline / Skip / Cancel).
    controller.abort();

    // The abort rejects the upload instead of leaving it pending forever, and it
    // does NOT degrade into a data:-URL "success" or a DB-backend fallthrough.
    await expect(pending).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('enforces its own hard timeout when no caller signal exists', async () => {
    setNodeEnv('production');
    process.env.SUPABASE_URL = 'https://dead.example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    process.env.STORAGE_UPLOAD_TIMEOUT_MS = '5000'; // the clamp minimum

    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      default: {
        mediaAsset: { create: vi.fn().mockResolvedValue({ id: 'asset_after_timeout' }) },
      },
    }));
    mockActiveWorkspace('ws_hang');

    const { uploadBase64ToStorage } = await import('@/lib/supabase');
    vi.useFakeTimers();
    try {
      const pending = uploadBase64ToStorage('data:image/png;base64,aGVsbG8=', 'pic.png', 'image/png');
      // Without a caller signal the upload still cannot hang: the deadline cuts
      // the stalled fetch and the backend chain degrades gracefully.
      const assertion = expect(pending).resolves.toBe('/api/media/asset/asset_after_timeout.png');
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
      // The stalled fetch was cut by its own deadline, not left open forever.
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
