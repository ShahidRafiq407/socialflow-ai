import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getHeyGenAccount,
  listHeyGenAvatars,
  listHeyGenVoices,
  startHeyGenVideo,
  getHeyGenVideoStatus,
  pickAvatar,
  pickVoice,
} from "@/lib/connectors/heygen";

/**
 * Regression tests for the HeyGen connector client.
 *
 * Locks in: quota-based key verification with real error surfacing, the v2
 * generate payload shape (avatar/voice/dimension), envelope code !== 100
 * treated as an error, status normalization, and avatar/voice keyword
 * selection defaults.
 */

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: unknown }>) {
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
      headers: { get: () => "application/json" },
    } as unknown as Response;
  });
  return calls;
}

describe("getHeyGenAccount", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns quota on a valid key", async () => {
    mockFetchSequence([{ ok: true, json: { code: 100, data: { remaining_quota: 42, used_quota: 8 } } }]);

    const res = await getHeyGenAccount("valid_key");
    expect(res.success).toBe(true);
    expect(res.quota?.remaining).toBe(42);
  });

  it("returns a clear error for a rejected key (401)", async () => {
    mockFetchSequence([{ ok: false, status: 401, json: { message: "Invalid API key" } }]);

    const res = await getHeyGenAccount("bad_key");
    expect(res.success).toBe(false);
    expect(res.error).toContain("HeyGen rejected the API key");
  });

  it("surfaces the envelope message when code is not 100", async () => {
    mockFetchSequence([{ ok: true, json: { code: 401001, message: "quota exhausted" } }]);

    const res = await getHeyGenAccount("key");
    expect(res.success).toBe(false);
    expect(res.error).toContain("quota exhausted");
  });

  it("rejects an empty key without a network call", async () => {
    const calls = mockFetchSequence([]);
    const res = await getHeyGenAccount("  ");
    expect(res.success).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe("startHeyGenVideo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the v2 generate payload with avatar, voice and dimension", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { code: 100, data: { video_id: "vid_123" } } },
    ]);

    const res = await startHeyGenVideo("key", {
      avatarId: "avatar_1",
      voiceId: "voice_1",
      script: "Hello world",
      orientation: "16:9",
      backgroundColor: "#ffffff",
    });

    expect(res.success).toBe(true);
    expect(res.videoId).toBe("vid_123");

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.video_inputs[0].character.avatar_id).toBe("avatar_1");
    expect(body.video_inputs[0].voice.input_text).toBe("Hello world");
    expect(body.video_inputs[0].voice.voice_id).toBe("voice_1");
    expect(body.video_inputs[0].background).toEqual({ type: "color", value: "#ffffff" });
    expect(body.dimension).toEqual({ width: 1280, height: 720 });
  });

  it("defaults to 9:16 (720x1280)", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { code: 100, data: { video_id: "vid_1" } } },
    ]);

    await startHeyGenVideo("key", { avatarId: "a", voiceId: "v", script: "hi" });
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.dimension).toEqual({ width: 720, height: 1280 });
  });

  it("rejects an empty or over-long script without a network call", async () => {
    const calls = mockFetchSequence([]);

    const empty = await startHeyGenVideo("key", { avatarId: "a", voiceId: "v", script: "  " });
    expect(empty.success).toBe(false);

    const long = await startHeyGenVideo("key", {
      avatarId: "a",
      voiceId: "v",
      script: "x".repeat(1501),
    });
    expect(long.success).toBe(false);
    expect(long.error).toContain("too long");

    expect(calls.length).toBe(0);
  });

  it("surfaces a failed generate request", async () => {
    mockFetchSequence([{ ok: false, status: 402, json: { message: "insufficient credits" } }]);

    const res = await startHeyGenVideo("key", { avatarId: "a", voiceId: "v", script: "hi" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("insufficient credits");
  });
});

describe("getHeyGenVideoStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes completed/processing/failed statuses", async () => {
    mockFetchSequence([
      { ok: true, json: { code: 100, data: { status: "completed", video_url: "https://cdn/v.mp4" } } },
      { ok: true, json: { code: 100, data: { status: "processing" } } },
      { ok: true, json: { code: 100, data: { status: "failed", error: { message: "render boom" } } } },
    ]);

    const done = await getHeyGenVideoStatus("key", "v1");
    expect(done.info?.status).toBe("completed");
    expect(done.info?.videoUrl).toBe("https://cdn/v.mp4");

    const waiting = await getHeyGenVideoStatus("key", "v1");
    expect(waiting.info?.status).toBe("processing");

    const failed = await getHeyGenVideoStatus("key", "v1");
    expect(failed.info?.status).toBe("failed");
    expect(failed.info?.error).toContain("render boom");
  });

  it("requires a videoId", async () => {
    const calls = mockFetchSequence([]);
    const res = await getHeyGenVideoStatus("key", "  ");
    expect(res.success).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe("avatar & voice listing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps avatars and voices into flat shapes", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          code: 100,
          data: {
            avatars: [{ avatar_id: "a1", avatar_name: "Sarah", gender: "Female", premium: true }],
          },
        },
      },
      {
        ok: true,
        json: {
          code: 100,
          data: {
            voices: [{ voice_id: "v1", name: "Aria", language: "English (US)", gender: "female" }],
          },
        },
      },
    ]);

    const avatars = await listHeyGenAvatars("key");
    expect(avatars.success).toBe(true);
    expect(avatars.avatars?.[0]).toMatchObject({ avatarId: "a1", name: "Sarah", premium: true });

    const voices = await listHeyGenVoices("key");
    expect(voices.success).toBe(true);
    expect(voices.voices?.[0]).toMatchObject({ voiceId: "v1", language: "English (US)" });
  });

  it("returns an error when the envelope reports failure", async () => {
    mockFetchSequence([{ ok: true, json: { code: 500, message: "boom" } }]);
    const res = await listHeyGenAvatars("key");
    expect(res.success).toBe(false);
    expect(res.error).toContain("boom");
  });
});

describe("pickAvatar / pickVoice", () => {
  const avatars = [
    { avatarId: "a1", name: "Dana Casual", gender: "female", previewImageUrl: null, premium: false },
    { avatarId: "a2", name: "Sarah Professional", gender: "female", previewImageUrl: null, premium: true },
    { avatarId: "a3", name: "Alex Executive", gender: "male", previewImageUrl: null, premium: true },
  ];

  it("matches by keyword, falls back to premium, then first", () => {
    expect(pickAvatar(avatars, "alex")?.avatarId).toBe("a3");
    expect(pickAvatar(avatars, "sarah")?.avatarId).toBe("a2");
    expect(pickAvatar(avatars)?.avatarId).toBe("a2");
    expect(pickAvatar([], "alex")).toBeNull();
  });

  const voices = [
    { voiceId: "v1", name: "Aria", language: "English (US)", gender: "female" },
    { voiceId: "v2", name: "Marcus", language: "English (UK)", gender: "male" },
  ];

  it("matches voice keyword on name, language or gender, prefers English", () => {
    expect(pickVoice(voices, "male")?.voiceId).toBe("v2");
    expect(pickVoice(voices, "UK")?.voiceId).toBe("v2");
    expect(pickVoice(voices)?.voiceId).toBe("v1");
    expect(pickVoice([])).toBeNull();
  });
});
