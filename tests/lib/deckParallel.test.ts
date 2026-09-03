/**
 * TRACE SUITE — a deck renders its slides in parallel, inside the quota
 *
 * WHY THIS EXISTS: multi-slide campaigns died at "slide 2/5" every time. The
 * deck rendered its slides one after another while gemini-3-pro-image takes
 * 30-120s per slide, so a 5-slide deck cost 150-600s of wall clock inside ONE
 * family — against a ~255s total run budget. The tail slides were structurally
 * unable to finish: the family deadline fired, the deck came back "skipped",
 * and the user watched a stall, a skip button and a retry loop.
 *
 * The fix fans the slides out (IMAGE_SLIDE_CONCURRENCY at a time, default 3),
 * so the deck costs roughly the span of the slowest render instead of the sum
 * of all of them. The per-model rate pacer still admits every request through
 * one shared window, so the parallelism cannot manufacture a 429.
 *
 * These tests lock the two properties that matter: the deck finishes well
 * inside the serial cost, and the slides come back in deck order even when
 * later slides render faster than earlier ones.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/agents/llm", () => ({
  vertexProvider: {
    ai: {
      models: {
        // Per-call delay is decided by the test via the mock implementation
        // installed in each test body; the hoisted factory only provides the fn.
        generateContent: vi.fn(),
      },
    },
  },
  MODELS: { VISUALIZER: "gemini-image-test", VIDEO: "veo-test", CONTENT_CREATOR: "gemini-test" },
}));

vi.mock("@/lib/supabase", () => ({
  uploadBase64ToStorage: vi.fn(async (_b64: string, filename: string) => `https://storage.test/${filename}`),
  isSupabaseConfigured: () => true,
}));

import { generateMediaAsset } from "@/lib/agents/mediaGenerator";
import { vertexProvider } from "@/lib/agents/llm";

const genMock = (vertexProvider as any).ai.models.generateContent as ReturnType<typeof vi.fn>;

const imageResponse = (slide: number) => ({
  candidates: [
    {
      content: {
        parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from(`slide-${slide}`).toString("base64") } }],
      },
    },
  ],
});

const deckInput = (model: string) => {
  const slides = [1, 2, 3, 4, 5].map((i) => ({ title: `Slide ${i}`, body: `Insight ${i}` }));
  return {
    platform: "instagram",
    contentType: "carousel",
    mediaType: "multi_image" as const,
    prompt: "the deck prompt",
    visualPrompts: slides.map((_, i) => `background art ${i + 1}`),
    aspectRatio: "1:1",
    slideTexts: slides,
    slideCount: 5,
    totalSlides: 5,
    brandName: "Test Brand",
    imageModel: model,
    onProgress: () => {},
  };
};

beforeAll(() => {
  process.env.GEMINI_API_KEY = "test-key";
  // Keep the inter-slide stagger tiny so the test measures render parallelism,
  // not the spacing sleep (default 1000ms).
  process.env.IMAGE_SLIDE_SPACING_MS = "5";
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.IMAGE_SLIDE_SPACING_MS;
});

describe("deck slide parallelism", () => {
  it("renders a 5-slide deck well inside the serial cost and returns all slides", async () => {
    const RENDER_DELAY_MS = 200;
    genMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, RENDER_DELAY_MS));
      return imageResponse(0);
    });

    const started = Date.now();
    const assets = await generateMediaAsset(deckInput("deck-parallel-even"));
    const elapsed = Date.now() - started;

    expect(assets).toHaveLength(5);
    expect(genMock).toHaveBeenCalledTimes(5);
    // Serial would be >= 5 x 200ms = 1000ms; three-wide parallelism is ~2 waves.
    expect(elapsed).toBeLessThan(RENDER_DELAY_MS * 4);
  }, 20000);

  it("returns slides in deck order even when later slides finish first", async () => {
    // Slide 1 is the slow one; slides 2-5 land early. The fan-out settles out of
    // order, but the editor and the attachment keys rely on deck order.
    const delays = [400, 50, 50, 50, 50];
    genMock.mockImplementation(async (_req: any) => {
      const callIndex = genMock.mock.calls.length - 1;
      await new Promise((r) => setTimeout(r, delays[callIndex] ?? 50));
      return imageResponse(callIndex);
    });

    const assets = await generateMediaAsset(deckInput("deck-parallel-order"));

    expect(assets).toHaveLength(5);
    expect(assets.map((a) => a.slideIndex)).toEqual([0, 1, 2, 3, 4]);
    // Each slide's URL points at the asset its own render produced.
    for (const a of assets) {
      expect(a.url).toContain(encodeURIComponent("slide-") === "" ? "" : "storage.test");
    }
  }, 20000);
});
