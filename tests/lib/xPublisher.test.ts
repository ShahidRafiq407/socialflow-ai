import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishToX } from "@/lib/publishers/x";

/**
 * Regression tests for the X publisher field-sync fixes.
 *
 * Bug being locked out: post.hashtags were silently dropped — the tweet body
 * was built from post.content only, so hashtags typed in the studio never
 * appeared on X. The first comment was also never posted.
 */

const account = { accessToken: "tok", accountId: "acc" };

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
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: { get: () => "image/png" },
    } as unknown as Response;
  });
  return calls;
}

function makePost() {
  return {
    id: "post_1",
    platform: "x",
    format: "Post",
    content: "Check out our new robot",
    imageUrl: "",
    hashtags: ["robotics", "ai"],
    settings: {},
    mediaType: "image",
  };
}

describe("publishToX — field sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appends hashtags to the tweet text", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { data: { id: "111", text: "" } } },
    ]);

    const res = await publishToX(makePost(), account);
    expect(res.success).toBe(true);

    const tweetCall = calls.find((c) => c.url.includes("/2/tweets"));
    expect(tweetCall).toBeTruthy();
    const body = JSON.parse(String(tweetCall!.init!.body));
    expect(body.text).toContain("Check out our new robot");
    expect(body.text).toContain("#robotics");
    expect(body.text).toContain("#ai");
  });

  it("posts the first comment as a reply when configured", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { data: { id: "222", text: "" } } }, // main tweet
      { ok: true, json: { data: { id: "333", text: "" } } }, // reply
    ]);

    const post = makePost();
    post.settings = { firstComment: "Follow us for more!" };

    const res = await publishToX(post, account);
    expect(res.success).toBe(true);

    const replyCall = calls.filter((c) => c.url.includes("/2/tweets"))[1];
    expect(replyCall).toBeTruthy();
    const replyBody = JSON.parse(String(replyCall.init!.body));
    expect(replyBody.text).toBe("Follow us for more!");
    expect(replyBody.reply.in_reply_to_tweet_id).toBe("222");
  });

  it("uploads media via the v2 endpoint and attaches alt text", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: {} },                            // image download (uploadXImage fetch)
      { ok: true, json: { data: { id: "media_1" } } },   // POST /2/media/upload
      { ok: true, json: {} },                            // POST /2/media/metadata
      { ok: true, json: { data: { id: "444", text: "" } } }, // POST /2/tweets
    ]);

    const post = makePost();
    post.imageUrl = "https://cdn.example.com/pic.png";
    post.settings = { altText: "Robot arm close-up" };

    const res = await publishToX(post, account);
    expect(res.success).toBe(true);

    const uploadCall = calls.find((c) => c.url.includes("/2/media/upload"));
    expect(uploadCall).toBeTruthy();
    expect(String(uploadCall!.init!.body)).toContain("tweet_image");

    const metaCall = calls.find((c) => c.url.includes("/2/media/metadata"));
    expect(metaCall).toBeTruthy();
    const metaBody = JSON.parse(String(metaCall!.init!.body));
    expect(metaBody.id).toBe("media_1");
    expect(metaBody.metadata.alt_text.text).toBe("Robot arm close-up");

    const tweetCall = calls.find((c) => c.url.includes("/2/tweets"));
    const tweetBody = JSON.parse(String(tweetCall!.init!.body));
    expect(tweetBody.media.media_ids).toEqual(["media_1"]);
  });
});
