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
] as const;

let savedEnv: Record<string, string | undefined> = {};

const setNodeEnv = (value: string) => {
  (process.env as Record<string, string>).NODE_ENV = value;
};

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
  vi.doUnmock('@/lib/db');
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
    const findFirstMock = vi.fn().mockResolvedValue({ id: 'ws_1' });
    vi.doMock('@/lib/db', () => ({ default: { mediaAsset: { create: createMock }, workspace: { findFirst: findFirstMock } } }));

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
        workspace: { findFirst: vi.fn().mockResolvedValue({ id: 'ws_1' }) },
      },
    }));

    const { saveMediaBuffer } = await import('@/lib/supabase');
    const saved = await saveMediaBuffer(Buffer.from('vid'), 'clip.mp4', 'video/mp4');
    expect(saved.url).toBe('/api/media/asset/asset_vid.mp4');
  });

  it('uses the provided workspaceId instead of querying for one', async () => {
    setNodeEnv('production');
    const findFirstMock = vi.fn();
    const createMock = vi.fn().mockResolvedValue({ id: 'asset_x' });
    vi.doMock('@/lib/db', () => ({ default: { mediaAsset: { create: createMock }, workspace: { findFirst: findFirstMock } } }));

    const { saveMediaBuffer } = await import('@/lib/supabase');
    await saveMediaBuffer(Buffer.from('x'), 'a.png', 'image/png', 'ws_provided');

    expect(findFirstMock).not.toHaveBeenCalled();
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

  it('throws when no workspace exists (cannot attribute the asset)', async () => {
    setNodeEnv('production');
    vi.doMock('@/lib/db', () => ({
      default: {
        mediaAsset: { create: vi.fn() },
        workspace: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    }));

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
    const findFirstMock = vi.fn().mockResolvedValue({ id: 'ws_sb' });
    vi.resetModules(); // module-level SUPABASE_URL const is read at import time
    vi.doMock('@/lib/db', () => ({
      default: { mediaAsset: { create: createMock }, workspace: { findFirst: findFirstMock } },
    }));

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
        workspace: { findFirst: vi.fn().mockResolvedValue({ id: 'ws_sb' }) },
      },
    }));

    const { saveMediaBuffer } = await import('@/lib/supabase');
    const bigBuf = Buffer.alloc(6 * 1024 * 1024, 1);
    await expect(saveMediaBuffer(bigBuf, 'big.mp4', 'video/mp4')).rejects.toThrow(
      /Supabase Storage upload failed[\s\S]*too large/i
    );
  });
});
