import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishToPinterest } from "@/lib/publishers/pinterest";

/**
 * Regression tests for the Pinterest publisher field-sync fixes.
 *
 * Bug being locked out: the Pinterest editor stores the user's Description in
 * settings.contentDescription and Alt Text in settings.altText, but the old
 * publisher built the pin payload from post.content only and never sent
 * alt_text — so on Pinterest only the title + video appeared.
 */

const BOARD_ID = "1234567890";

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
    } as Response;
  });
  return calls;
}

function makeImagePin(): any {
  return {
    id: "post_1",
    platform: "pinterest",
    format: "Pin",
    content: "",
    imageUrl: "https://cdn.example.com/pin.png",
    hashtags: ["#robotics", "#ai"],
    settings: {
      contentTitle: "My Pin Title",
      contentDescription: "Full pin description with keywords",
      altText: "A robot arm assembling a circuit board",
      destinationUrl: "https://smbrobotic.com",
      pinterestBoard: BOARD_ID,
    },
    mediaType: "image",
  };
}

const account = { accessToken: "tok", accountId: "acc" };

describe("publishToPinterest — field sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends description, alt_text, link AND hashtags in the pin payload", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { id: "pin_1" } }, // POST /v5/pins
    ]);

    const res = await publishToPinterest(makeImagePin(), account);

    expect(res.success).toBe(true);
    expect(res.platformPostId).toBe("pin_1");

    const pinCall = calls.find((c) => c.url.endsWith("/v5/pins"));
    expect(pinCall).toBeTruthy();

    const body = JSON.parse(String(pinCall!.init!.body));
    expect(body.title).toBe("My Pin Title");
    expect(body.description).toContain("Full pin description with keywords");
    // Hashtags ride along in the description (Pinterest has no hashtag field)
    expect(body.description).toContain("#robotics");
    expect(body.description).toContain("#ai");
    expect(body.alt_text).toBe("A robot arm assembling a circuit board");
    expect(body.link).toBe("https://smbrobotic.com");
    expect(body.board_id).toBe(BOARD_ID);
    expect(body.media_source.source_type).toBe("image_url");
  });

  it("falls back to caption when no explicit description is set", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { id: "pin_2" } },
    ]);

    const post = makeImagePin();
    post.content = "Caption as description";
    post.settings = { contentTitle: "T", pinterestBoard: BOARD_ID };

    const res = await publishToPinterest(post, account);
    expect(res.success).toBe(true);

    const body = JSON.parse(String(calls.find((c) => c.url.endsWith("/v5/pins"))!.init!.body));
    expect(body.description).toContain("Caption as description");
    expect(body.alt_text).toBeUndefined();
  });

  it("resolves a board NAME to the matching real board id", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { items: [{ id: "111", name: "Other Board" }, { id: "222", name: "Tech Inspiration" }] } }, // GET /v5/boards
      { ok: true, json: { id: "pin_3" } }, // POST /v5/pins
    ]);

    const post = makeImagePin();
    post.settings = {
      contentTitle: "T",
      contentDescription: "D",
      pinterestBoardName: "Tech Inspiration",
    };

    const res = await publishToPinterest(post, account);
    expect(res.success).toBe(true);

    const body = JSON.parse(String(calls.find((c) => c.url.endsWith("/v5/pins"))!.init!.body));
    expect(body.board_id).toBe("222");
  });

  it("includes ai_disclosures when the AI-modified toggle is on", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { id: "pin_4" } },
    ]);

    const post = makeImagePin();
    post.settings.pinterestAiModified = true;

    await publishToPinterest(post, account);

    const body = JSON.parse(String(calls.find((c) => c.url.endsWith("/v5/pins"))!.init!.body));
    expect(body.ai_disclosures).toEqual({ values: ["AI_MODIFIED"] });
  });

  it("caps description at 800 and alt text at 500 characters (API limits)", async () => {
    const calls = mockFetchSequence([
      { ok: true, json: { id: "pin_5" } },
    ]);

    const post = makeImagePin();
    post.settings.contentDescription = "x".repeat(1200);
    post.settings.altText = "y".repeat(700);

    await publishToPinterest(post, account);

    const body = JSON.parse(String(calls.find((c) => c.url.endsWith("/v5/pins"))!.init!.body));
    expect(body.description.length).toBeLessThanOrEqual(800);
    expect(body.alt_text.length).toBeLessThanOrEqual(500);
  });
});
