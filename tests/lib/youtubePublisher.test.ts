import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishToYouTube } from "@/lib/publishers/youtube";

/**
 * Regression test for the YouTube first-comment fix.
 *
 * The studio's First Comment field was previously decorative for YouTube
 * (the OAuth app only requested youtube.readonly + youtube.upload). The
 * official API supports posting a top-level comment via commentThreads.insert
 * with the youtube.force-ssl scope — the OAuth config now requests it and the
 * publisher posts the comment right after the video goes live.
 */

const account = { accessToken: "tok", accountId: "acc", refreshToken: null };

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let idx = 0;
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(idx, responses.length - 1)];
    idx++;
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.json ?? {},
      text: async () => JSON.stringify(r.json ?? {}),
      arrayBuffer: async () => new ArrayBuffer(16),
      headers: { get: (k: string) => (r.headers || {})[k] ?? null },
    } as unknown as Response;
  });
  return calls;
}

function makePost(firstComment?: string) {
  return {
    id: "post_1",
    platform: "youtube",
    format: "Video",
    content: "Video script",
    imageUrl: "https://cdn.example.com/video.mp4",
    settings: {
      contentTitle: "My Video",
      youtubePrivacy: "public",
      ...(firstComment ? { firstComment } : {}),
    },
    mediaType: "video",
  } as any;
}

describe("publishToYouTube — first comment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the first comment via commentThreads.insert after upload", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: {} },                                            // video download
      { ok: true, json: {}, headers: { location: "https://upload.example.com/session" } }, // resumable init
      { ok: true, json: { id: "vid_123" } },                             // PUT upload
      { ok: true, json: { id: "thread_1" } },                            // commentThreads.insert
    ]);

    const res = await publishToYouTube(makePost("Subscribe for more!"), account);
    expect(res.success).toBe(true);
    expect(res.platformPostId).toBe("vid_123");

    const commentCall = calls.find((c) => c.url.includes("/youtube/v3/commentThreads"));
    expect(commentCall).toBeTruthy();
    const body = JSON.parse(String(commentCall!.init!.body));
    expect(body.snippet.videoId).toBe("vid_123");
    expect(body.snippet.topLevelComment.snippet.textOriginal).toBe("Subscribe for more!");
    expect(commentCall!.init!.headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("skips the comment call entirely when no first comment is set", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: {} },
      { ok: true, json: {}, headers: { location: "https://upload.example.com/session" } },
      { ok: true, json: { id: "vid_456" } },
    ]);

    const res = await publishToYouTube(makePost(), account);
    expect(res.success).toBe(true);
    expect(calls.find((c) => c.url.includes("/youtube/v3/commentThreads"))).toBeUndefined();
  });

  it("still succeeds when the comment call fails (best-effort)", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: {} },
      { ok: true, json: {}, headers: { location: "https://upload.example.com/session" } },
      { ok: true, json: { id: "vid_789" } },
      { ok: false, status: 403, json: { error: { message: "insufficientPermissions" } } }, // comment rejected
    ]);

    const res = await publishToYouTube(makePost("Pin this!"), account);
    expect(res.success).toBe(true);
    expect(res.platformPostId).toBe("vid_789");
  });
});
