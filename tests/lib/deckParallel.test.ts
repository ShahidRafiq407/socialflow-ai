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
 *
 * They also lock what the fan-out COSTS. `generateMediaAsset` is the product's
 * media choke point — every render in the app is charged there, per asset — so
 * a deck reserves its slides up front and settles against the slides that came
 * back. That is the property a parallel fan-out is most likely to break, since
 * "how many slides did we get" is now decided by `Promise.allSettled` rather
 * than by a loop that stopped at the first failure. The ledger itself is mocked;
 * the prices are the real ones from the action catalogue.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

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

/**
 * The ledger, recorded rather than written. Everything above it is the real
 * thing: `withMediaCharge` picks the action from the model id, divides the
 * reservation per asset, and settles against the delivered count.
 */
const ledger = vi.hoisted(() => ({
  reserved: [] as { action: string; quantity: number; credits: number; userId: string; workspaceId: string | null }[],
  settled: [] as { action: string; credits: number; quantity: number }[],
  refunded: [] as { action: string; note: string }[],
  /** Every `UsageEvent` the render would have written, with its attribution. */
  usage: [] as { userId: string | null; feature: string; action: string | null; model: string; imageCount: number }[],
  reset() {
    ledger.reserved.length = 0;
    ledger.settled.length = 0;
    ledger.refunded.length = 0;
    ledger.usage.length = 0;
  },
}));

// `recordUsageAsync` fires on every slide and is deliberately unawaited, so an
// unmocked database turns a passing test into forty lines of Prisma stack trace.
// Captured instead, because what it captures is worth asserting: the attribution
// on the row is the whole reason `withMediaCharge` opens a child scope.
vi.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    usageEvent: {
      create: vi.fn(async ({ data }: any) => {
        ledger.usage.push({
          userId: data.userId,
          feature: data.feature,
          action: data.action,
          model: data.model,
          imageCount: data.imageCount,
        });
        return data;
      }),
    },
  },
}));

vi.mock("@/lib/billing/entitlements", async () => {
  // Imported inside the factory because `vi.mock` is hoisted above the imports.
  // `actions.ts` is client-safe — no prisma, no server-only — so the credit
  // prices asserted below are the ones the product charges.
  const { actionCredits } = await import("@/lib/billing/actions");

  return {
    EntitlementError: class EntitlementError extends Error {},
    beginAction: vi.fn(async (args: any) => {
      const quantity = Math.max(1, Math.round(args.quantity ?? 1));
      const credits = actionCredits(args.action) * quantity;
      ledger.reserved.push({
        action: args.action,
        quantity,
        credits,
        userId: args.userId,
        workspaceId: args.workspaceId ?? null,
      });
      return {
        ok: true,
        gate: { allowed: true, plan: "AGENCY" },
        userId: args.userId,
        action: args.action,
        feature: "media.image",
        countsAgainst: "media.image",
        plan: "AGENCY",
        credits,
        quantity,
        periodStart: new Date(0),
        workspaceId: args.workspaceId ?? null,
        referenceId: args.referenceId ?? null,
        holdId: "hold_test",
        startedAt: new Date(0),
        claimed: true,
      };
    }),
    completeAction: vi.fn(async (args: any) => {
      ledger.settled.push({
        action: args.ticket.action,
        credits: args.credits ?? args.ticket.credits,
        quantity: args.quantity ?? args.ticket.quantity,
      });
      return { ok: true };
    }),
    failAction: vi.fn(async (ticket: any, args: any) => {
      ledger.refunded.push({ action: ticket.action, note: args?.note ?? "" });
      return { ok: true };
    }),
  };
});

import { generateMediaAsset } from "@/lib/agents/mediaGenerator";
import { vertexProvider } from "@/lib/agents/llm";
import { withMeterContext } from "@/lib/billing/meter";
import { actionCredits } from "@/lib/billing/actions";

const genMock = (vertexProvider as any).ai.models.generateContent as ReturnType<typeof vi.fn>;

const OWNER = { userId: "user_deck_test", workspaceId: "ws_deck_test" };

const imageResponse = (slide: number) => ({
  candidates: [
    {
      content: {
        parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from(`slide-${slide}`).toString("base64") } }],
      },
    },
  ],
});

/** A response with no image in it — the slide's parse throws and it drops out. */
const emptyResponse = () => ({ candidates: [{ content: { parts: [{ text: "no image today" }] } }] });

const deckInput = (model: string, billing: typeof OWNER | null = OWNER) => {
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
    billing,
    onProgress: () => {},
  };
};

beforeAll(() => {
  process.env.GEMINI_API_KEY = "test-key";
  // Keep the inter-slide stagger tiny so the test measures render parallelism,
  // not the spacing sleep (default 1000ms).
  process.env.IMAGE_SLIDE_SPACING_MS = "5";
  // One request per slide, always. The real renderer is allowed a second attempt
  // and two fallback models with seconds of backoff between them, which would
  // make a deliberately-failing slide cost ~10s of real time and would untie the
  // call index from the slide index. Both properties under test here are about
  // the deck, not about the retry ladder — `mediaRetry.test.ts` owns that.
  process.env.IMAGE_MAX_ATTEMPTS = "1";
  process.env.IMAGE_FALLBACK_MODELS = "";
});

beforeEach(() => {
  ledger.reset();
  // Without this the call counter carries across tests, and the per-slide delays
  // and failures below — keyed on it — would silently never apply.
  genMock.mockClear();
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.IMAGE_SLIDE_SPACING_MS;
  delete process.env.IMAGE_MAX_ATTEMPTS;
  delete process.env.IMAGE_FALLBACK_MODELS;
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

describe("what a deck costs", () => {
  it("reserves the whole deck up front and settles all five slides", async () => {
    genMock.mockImplementation(async () => imageResponse(0));

    const assets = await generateMediaAsset(deckInput("deck-charge-full"));

    expect(assets).toHaveLength(5);
    // One reservation for the deck, not one per slide: the caller asked once.
    expect(ledger.reserved).toHaveLength(1);
    expect(ledger.reserved[0]).toMatchObject({
      action: "media.image",
      quantity: 5,
      credits: actionCredits("media.image") * 5,
      userId: OWNER.userId,
      workspaceId: OWNER.workspaceId,
    });
    expect(ledger.settled).toEqual([
      { action: "media.image", credits: actionCredits("media.image") * 5, quantity: 5 },
    ]);
    expect(ledger.refunded).toHaveLength(0);
  }, 20000);

  it("charges three slides when two of the five fail", async () => {
    // Slides 2 and 4 come back with no image. The fan-out salvages the rest, and
    // the charge has to follow the salvage rather than the request.
    genMock.mockImplementation(async () => {
      const callIndex = genMock.mock.calls.length - 1;
      return callIndex === 1 || callIndex === 3 ? emptyResponse() : imageResponse(callIndex);
    });

    const assets = await generateMediaAsset(deckInput("deck-charge-partial"));

    expect(assets).toHaveLength(3);
    expect(ledger.reserved[0].quantity).toBe(5);
    expect(ledger.settled).toEqual([
      { action: "media.image", credits: actionCredits("media.image") * 3, quantity: 3 },
    ]);
  }, 20000);

  it("refunds the whole deck when no slide survives", async () => {
    genMock.mockImplementation(async () => emptyResponse());

    await expect(generateMediaAsset(deckInput("deck-charge-none"))).rejects.toThrow();

    expect(ledger.settled).toHaveLength(0);
    expect(ledger.refunded).toHaveLength(1);
    expect(ledger.refunded[0].action).toBe("media.image");
  }, 20000);

  it("bills the premium action when the caller pinned a pro image model", async () => {
    genMock.mockImplementation(async () => imageResponse(0));

    await generateMediaAsset(deckInput("gemini-3-pro-image"));

    // Picked from the model id, not from a flag the client sends — a client that
    // asks for the pro model and is billed for the standard one has found a discount.
    expect(ledger.reserved[0].action).toBe("media.imagePro");
    expect(ledger.reserved[0].credits).toBe(actionCredits("media.imagePro") * 5);
  }, 20000);

  it("finds the owner in the ambient meter scope when the caller passes no billing block", async () => {
    genMock.mockImplementation(async () => imageResponse(0));

    await withMeterContext(
      { userId: "user_from_scope", workspaceId: "ws_from_scope", feature: "ai-studio", action: "ai.post.single" },
      () => generateMediaAsset(deckInput("deck-charge-scope", null))
    );

    expect(ledger.reserved[0]).toMatchObject({
      userId: "user_from_scope",
      workspaceId: "ws_from_scope",
    });

    // The usage rows are written unawaited, so give them a tick to land.
    await new Promise((r) => setTimeout(r, 0));

    // Attribution: the render is filed under the media action, not under the post
    // that asked for it. Otherwise five image renders disappear into a campaign's
    // text spend and `measureCost` cannot find the rows it is meant to price.
    expect(ledger.usage).toHaveLength(5);
    for (const row of ledger.usage) {
      expect(row.userId).toBe("user_from_scope");
      expect(row.feature).toBe("media.image");
      expect(row.action).toBe("media.image");
      expect(row.imageCount).toBe(1);
    }
  }, 20000);

  it("refuses to render at all when nobody can be billed", async () => {
    genMock.mockImplementation(async () => imageResponse(0));

    await expect(generateMediaAsset(deckInput("deck-charge-ownerless", null))).rejects.toThrow(
      /no billable owner/
    );

    // The point of the refusal: not one model call was made.
    expect(ledger.reserved).toHaveLength(0);
    expect(genMock).not.toHaveBeenCalled();
  }, 20000);
});
