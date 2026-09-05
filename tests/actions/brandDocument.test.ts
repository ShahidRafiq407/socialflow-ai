// ============================================================================
// BRAND DNA FROM A DOCUMENT — THE OTHER HALF OF A FREE PLAN'S PROMISE
//
// Free is sold on being able to teach the product a brand, and plenty of small
// businesses have a deck or a one-page brief long before they have a website worth
// scraping. `Upload document` was an `alert("coming soon")` for the entire life of
// the plan, so this is the path that makes the pricing copy true.
//
// It is also a metered path on a plan with three brand reads a month, which makes
// one property matter more than any other: a file we cannot read must cost nothing.
// A scanned PDF, a JPEG dragged into the wrong button, a 4 MB deck — each of those
// is a refusal, and a refusal that burns one of three credits is worse than no
// feature at all. Every test below is about where the charge starts.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = "user_doc_1";
const WORKSPACE = "ws_doc_1";

/** A brief long enough to clear the 200-character floor. */
const REAL_TEXT =
  "Northwind Robotics builds warehouse picking arms for mid-sized distributors. " +
  "Our buyers are operations managers who have been quoted six-figure integrations " +
  "and want a cell they can install in a weekend. We win on install time, not on " +
  "reach. Book a line walkthrough to see the cycle time.";

interface Harness {
  parsed: {
    name: string;
    type: string;
    size: number;
    kind: string;
    text: string;
    sections: unknown[];
    citations: unknown[];
    summary: string;
    error?: string;
  };
  /** Every action that reached the gate, in order. */
  charged: string[];
  /** Every prompt the model was handed. */
  prompts: string[];
  reply: string;
  saved: Record<string, unknown> | null;
}

function file(patch: Partial<{ name: string; type: string; content: string }> = {}) {
  return {
    name: "brand-deck.pdf",
    type: "application/pdf",
    content: "data:application/pdf;base64,JVBERi0=",
    ...patch,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mocks the four seams around the action and nothing inside it.
 *
 * `runAction` is the real gate in production; here it records the action key and
 * runs the body, so "did this charge, and for what" is a list rather than an
 * inference. The parser is stubbed because `documentParser.test.ts` already proves
 * it on real bytes — what matters here is only what this action does with each of
 * its verdicts.
 */
function harness(overrides: Partial<Harness> = {}): Harness {
  const state: Harness = {
    parsed: {
      name: "brand-deck.pdf",
      type: "application/pdf",
      size: 2048,
      kind: "pdf",
      text: REAL_TEXT,
      sections: [],
      citations: [],
      summary: "",
    },
    charged: [],
    prompts: [],
    reply: JSON.stringify({
      companyName: "Northwind Robotics",
      industry: "Industrial automation",
      targetAudience: "Operations managers at mid-sized distributors",
      brandTone: "Direct, technical",
      missionVision: "Picking cells a distributor can install in a weekend",
      painPoints: "Six-figure integration quotes",
      differentiator: "Install time",
      ctaOffer: "Book a line walkthrough",
      competitors: "",
    }),
    saved: null,
    ...overrides,
  };

  vi.doMock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: USER }) }));
  vi.doMock("next/cache", () => ({ revalidatePath: () => undefined }));
  vi.doMock("@/lib/db", () => ({
    default: { workspace: { findFirst: async () => ({ id: WORKSPACE }) } },
  }));
  vi.doMock("@/lib/workspace/active", () => ({ activeWorkspaceQuery: async () => ({ where: {} }) }));
  vi.doMock("@/lib/agents/chat/documentParser", () => ({
    parseUploadedFile: async () => state.parsed,
  }));
  vi.doMock("@/lib/agents/llm", () => ({
    llm: {
      invoke: async (messages: any[]) => {
        state.prompts.push(String(messages[0]?.content ?? ""));
        return { content: state.reply };
      },
    },
  }));
  vi.doMock("@/lib/billing/entitlements", () => ({
    runAction: async (options: any, fn: any) => {
      state.charged.push(options.action);
      return fn({ userId: options.userId, action: options.action, workspaceId: options.workspaceId });
    },
    isEntitlementError: () => false,
  }));

  return state;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("extractFromDocument", () => {
  it("charges brand.document, not the website scan's row", async () => {
    const state = harness();
    const { extractFromDocument } = await import("@/actions/extract");

    const brand = await extractFromDocument(file());

    expect(state.charged).toEqual(["brand.document"]);
    expect(brand.companyName).toBe("Northwind Robotics");
  });

  it("reads the same nine fields the website scan does", async () => {
    harness();
    const { extractFromDocument } = await import("@/actions/extract");

    const brand = await extractFromDocument(file());

    // The two paths are the same price because they are the same request. If one
    // of them stopped asking for a field, that price would stop being true.
    expect(Object.keys(brand).sort()).toEqual(
      [
        "brandTone",
        "companyName",
        "competitors",
        "ctaOffer",
        "differentiator",
        "industry",
        "missionVision",
        "painPoints",
        "targetAudience",
      ].sort()
    );
  });

  it("truncates to the 10k window the price was derived from", async () => {
    const state = harness();
    state.parsed.text = "Northwind. ".repeat(4_000); // ~44k characters
    const { extractFromDocument } = await import("@/actions/extract");

    await extractFromDocument(file());

    // The basis in `actions.ts` says ~2.8k tokens in. A parser that hands over 60k
    // characters would quietly make two credits the wrong number.
    expect(state.prompts[0]).toBeDefined();
    expect(state.prompts[0].length).toBeLessThan(11_000);
  });

  it("passes the workspace through so the usage lands on the one being edited", async () => {
    const state = harness();
    let seen: string | null | undefined;
    vi.doUnmock("@/lib/billing/entitlements");
    vi.doMock("@/lib/billing/entitlements", () => ({
      runAction: async (options: any, fn: any) => {
        seen = options.workspaceId;
        state.charged.push(options.action);
        return fn({});
      },
      isEntitlementError: () => false,
    }));
    const { extractFromDocument } = await import("@/actions/extract");

    await extractFromDocument(file(), { userId: USER, workspaceId: "ws_explicit" });

    expect(seen).toBe("ws_explicit");
  });
});

describe("extractFromDocument refuses before it charges", () => {
  it("costs nothing when the parser rejects the file", async () => {
    const state = harness();
    state.parsed.error = "File is 31.0MB — exceeds the 25MB limit.";
    const { extractFromDocument } = await import("@/actions/extract");

    await expect(extractFromDocument(file())).rejects.toThrow(/exceeds the 25MB limit/);
    expect(state.charged).toEqual([]);
    expect(state.prompts).toEqual([]);
  });

  it("costs nothing for an image, and says what to do instead", async () => {
    const state = harness();
    state.parsed = { ...state.parsed, name: "logo.png", type: "image/png", kind: "image", text: "" };
    const { extractFromDocument } = await import("@/actions/extract");

    await expect(extractFromDocument(file({ name: "logo.png", type: "image/png" }))).rejects.toThrow(
      /no text to read/
    );
    expect(state.charged).toEqual([]);
  });

  it("costs nothing for a file kind we cannot open", async () => {
    const state = harness();
    state.parsed = { ...state.parsed, name: "notes.pages", kind: "unsupported", text: "" };
    const { extractFromDocument } = await import("@/actions/extract");

    await expect(extractFromDocument(file({ name: "notes.pages" }))).rejects.toThrow(/cannot read/);
    expect(state.charged).toEqual([]);
  });

  it("costs nothing for a scan that parses cleanly and says almost nothing", async () => {
    const state = harness();
    // The failure that would otherwise reach the model: a valid PDF of photographs.
    // It comes back as a confidently empty brand, which then overwrites a real one.
    state.parsed.text = "Untitled  \n\n  1";
    const { extractFromDocument } = await import("@/actions/extract");

    await expect(extractFromDocument(file())).rejects.toThrow(/too little readable text/);
    expect(state.charged).toEqual([]);
    expect(state.prompts).toEqual([]);
  });

  it("refuses a signed-out caller before it reads the file", async () => {
    const state = harness();
    vi.doUnmock("@clerk/nextjs/server");
    vi.doMock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }) }));
    const { extractFromDocument } = await import("@/actions/extract");

    await expect(extractFromDocument(file())).rejects.toThrow("Unauthorized");
    expect(state.charged).toEqual([]);
  });
});

describe("extractAndApplyBrandDNAFromDocument", () => {
  /**
   * The one field a PDF cannot carry.
   *
   * A customer who scanned their site last month and uploads a deck today must not
   * lose the URL as the price of the upload — the URL is what the next scan, and
   * every "learn from my site" surface, reads. `extracted.website || existing.website`
   * would be wrong here in a way that only shows up a month later, because the
   * extractor has no `website` field at all: the fallback would always win, and the
   * day someone adds one it would silently start overwriting.
   */
  it("keeps the saved website, and fills the rest from the document", async () => {
    const updates: any[] = [];

    vi.doMock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: USER }) }));
    vi.doMock("next/cache", () => ({ revalidatePath: () => undefined }));
    vi.doMock("@/lib/db", () => ({
      default: {
        workspace: {
          findFirst: async () => ({ id: WORKSPACE }),
          findUnique: async () => ({
            name: "Old Name",
            website: "https://northwind.example",
            industry: "",
            brandDNA: {
              tone: "",
              missionVision: "",
              targetAudience: "",
              writingStyle: JSON.stringify({ competitors: "Acme", rules: "Long-form" }),
              primaryColors: ["#123456"],
              forbiddenWords: ["synergy"],
            },
          }),
          update: async (args: any) => {
            updates.push(args);
            return { id: WORKSPACE };
          },
        },
      },
    }));
    vi.doMock("@/actions/extract", () => ({
      extractFromDocument: async () => ({
        companyName: "Northwind Robotics",
        industry: "Industrial automation",
        targetAudience: "Operations managers",
        brandTone: "Direct, technical",
        missionVision: "Cells a distributor can install in a weekend",
        painPoints: "Six-figure integration quotes",
        differentiator: "Install time",
        ctaOffer: "Book a line walkthrough",
        competitors: "",
      }),
      extractFromUrl: async () => ({}),
    }));

    const { extractAndApplyBrandDNAFromDocument } = await import("@/actions/brand");

    const merged = await extractAndApplyBrandDNAFromDocument(WORKSPACE, file());

    expect(merged.website).toBe("https://northwind.example");
    expect(merged.name).toBe("Northwind Robotics");
    expect(merged.industry).toBe("Industrial automation");
    expect(merged.tone).toBe("Direct, technical");
    // An empty field in the extraction keeps what was already saved, rather than
    // blanking a competitor list the customer typed by hand.
    expect(merged.competitors).toBe("Acme");
    // And the local-only fields survive a merge that never mentions them.
    expect(merged.primaryColors).toEqual(["#123456"]);
    expect(merged.forbiddenWords).toEqual(["synergy"]);

    // Saved, not merely returned — the form is repopulated from the response, so a
    // merge that skipped the write would look right until the page reloaded.
    expect(updates).toHaveLength(1);
    expect(updates[0].data.website).toBe("https://northwind.example");
    expect(updates[0].data.name).toBe("Northwind Robotics");
  });

  it("refuses a workspace the caller does not own, with the same sentence as a missing one", async () => {
    vi.doMock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: USER }) }));
    vi.doMock("next/cache", () => ({ revalidatePath: () => undefined }));
    vi.doMock("@/lib/db", () => ({
      default: { workspace: { findFirst: async () => null, findUnique: async () => null, update: async () => null } },
    }));
    let reached = false;
    vi.doMock("@/actions/extract", () => ({
      extractFromDocument: async () => {
        reached = true;
        return {};
      },
      extractFromUrl: async () => ({}),
    }));

    const { extractAndApplyBrandDNAFromDocument } = await import("@/actions/brand");

    await expect(extractAndApplyBrandDNAFromDocument("ws_someone_else", file())).rejects.toThrow(
      "Workspace not found"
    );
    // The ownership check runs before anything is spent, so a guessed workspace id
    // cannot be used to burn another account's brand reads.
    expect(reached).toBe(false);
  });
});
