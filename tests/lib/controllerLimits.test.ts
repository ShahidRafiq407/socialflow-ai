/**
 * TRACE SUITE — the capability boundary and the feedback loop behind it
 *
 * WHY THIS EXISTS: when a user asks the chat for something it can't do, two things
 * must hold. First, the model must be told the EXACT reason — a setting that's off
 * reads differently from a feature that was never built — because the reason decides
 * what it says next ("turn it on" vs "I've logged it"). Second, the ask must be
 * written down ONCE with a counter, not filed afresh every time, or the signal a
 * developer needs ("47 people wanted Pinterest publishing") drowns in duplicates.
 *
 * Both halves are pure logic on purpose, so they can be pinned here without a
 * database, a model, or a network: computeLimits derives the boundary from live
 * state (settings, connectors, plan), and the requestShape helpers own the "same
 * ask twice = one row" merge rule.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from "@/lib/agents/controller/settingsShape";
import {
  computeLimits,
  describeLimitsForPrompt,
  isLimitReason,
  limitFix,
  manualOnlyPlatforms,
  LIMITATION_RULE,
  REPORT_LIMITATION_TOOL,
  type LimitSnapshot,
} from "@/lib/agents/controller/limits";
import {
  isFeatureRequestStatus,
  mergeRequestPayload,
  newRequestPayload,
  parseRequestRow,
  slugifyRequest,
  sortRequests,
  MAX_REQUEST_EXAMPLES,
  type FeatureRequest,
} from "@/lib/agents/controller/requestShape";
import { PLAN_TIERS, planHasFeature } from "@/lib/billing/plans";

// A workspace with everything on and everything connected: the ONLY limits left
// are the ones the product genuinely hasn't built (Pinterest API, planned
// connectors). Anything else showing up here would be a false "you can't".
const EVERYTHING: { settings: ChatSettings; snapshot: LimitSnapshot } = {
  settings: { ...DEFAULT_CHAT_SETTINGS },
  snapshot: {
    connectedPlatforms: ["instagram", "linkedin"],
    connectedConnectors: ["github", "heygen"],
    hasWordPress: true,
  },
};

describe("manualOnlyPlatforms", () => {
  it("names exactly the platforms with no API publisher — Pinterest today", () => {
    // Derived from the capability table, so the day a Pinterest publisher ships
    // this expectation is what flips, and the prompt row disappears on its own.
    expect(manualOnlyPlatforms()).toEqual(["pinterest"]);
  });
});

describe("computeLimits — settings toggles", () => {
  it("says nothing about a capability that is switched ON", () => {
    const limits = computeLimits(EVERYTHING);
    expect(limits.some((l) => l.key === "setting:media")).toBe(false);
    expect(limits.some((l) => l.key === "setting:web")).toBe(false);
  });

  it("reports a switched-off capability with the exact toggle and a chat-settings fix", () => {
    const limits = computeLimits({
      ...EVERYTHING,
      settings: { ...DEFAULT_CHAT_SETTINGS, allowMediaGen: false },
    });
    const media = limits.find((l) => l.key === "setting:media");
    expect(media).toBeDefined();
    expect(media!.reason).toBe("setting_off");
    // The reason a user needs: the switch by name, in the panel they can reach.
    expect(media!.detail).toContain("Media generation");
    expect(media!.fix?.href).toContain("panel=settings");
    expect(media!.fix?.tab).toBe("chat");
  });

  it("covers every toggle: each one off produces its own row", () => {
    const off: ChatSettings = {
      ...DEFAULT_CHAT_SETTINGS,
      allowMediaGen: false,
      allowWebSearch: false,
      allowPublishing: false,
      allowPlugins: false,
      memoryEnabled: false,
    };
    const keys = computeLimits({ ...EVERYTHING, settings: off })
      .filter((l) => l.reason === "setting_off")
      .map((l) => l.key)
      .sort();
    expect(keys).toEqual(
      ["setting:media", "setting:memory", "setting:plugins", "setting:publishing", "setting:web"].sort()
    );
  });
});

describe("computeLimits — connections", () => {
  it("flags an unconnected connector with a plugins deep link, not a generic message", () => {
    const limits = computeLimits({
      ...EVERYTHING,
      snapshot: { ...EVERYTHING.snapshot, connectedConnectors: ["heygen"] },
    });
    const github = limits.find((l) => l.key === "connector:github");
    expect(github).toBeDefined();
    expect(github!.reason).toBe("not_connected");
    expect(github!.fix?.href).toContain("/dashboard/plugins");
    expect(github!.fix?.href).toContain("github");
  });

  it("treats a connected connector as available (no row)", () => {
    const limits = computeLimits(EVERYTHING);
    expect(limits.some((l) => l.key === "connector:github")).toBe(false);
    expect(limits.some((l) => l.key === "connector:heygen")).toBe(false);
  });

  it("flags no social accounts and missing WordPress separately", () => {
    const limits = computeLimits({
      ...EVERYTHING,
      snapshot: { connectedPlatforms: [], connectedConnectors: ["github", "heygen"], hasWordPress: false },
    });
    expect(limits.find((l) => l.key === "social:none")?.reason).toBe("not_connected");
    expect(limits.find((l) => l.key === "wordpress")?.fix?.href).toContain("/dashboard/plugins");
  });
});

describe("computeLimits — not built", () => {
  it("lists Pinterest as not-built with no fix link (nothing to click)", () => {
    const pin = computeLimits(EVERYTHING).find((l) => l.key === "platform:pinterest");
    expect(pin).toBeDefined();
    expect(pin!.reason).toBe("not_built");
    expect(pin!.fix).toBeNull();
  });

  it("does not report removed planned connectors", () => {
    const planned = computeLimits(EVERYTHING).filter((l) => l.key.startsWith("planned:"));
    expect(planned).toHaveLength(0);
  });
});

describe("computeLimits — plan gating", () => {
  it("says NOTHING about the plan when no tier is passed (billing disabled)", () => {
    // With the billing kill-switch off, claiming the plan blocks a feature that in
    // fact works would be a lie in the other direction. So: no plan rows at all.
    const limits = computeLimits(EVERYTHING);
    expect(limits.some((l) => l.reason === "plan_locked")).toBe(false);
  });

  it("locks all AI behind one umbrella row on the Free tier, with a billing fix", () => {
    const limits = computeLimits({ ...EVERYTHING, planTier: "FREE" });
    // FREE cannot access AI at all → the single umbrella row, not per-feature rows.
    expect(limits.find((l) => l.key === "plan:ai")?.reason).toBe("plan_locked");
    expect(limits.find((l) => l.key === "plan:ai")?.fix?.href).toContain("/dashboard/billing");
    // And no per-feature rows underneath it: "you cannot generate video" is noise
    // when the answer is that no generation of any kind is included.
    expect(limits.some((l) => l.key === "plan:video")).toBe(false);
    expect(limits.some((l) => l.key === "plan:zip")).toBe(false);
  });

  it("on a tier WITH AI, drops the umbrella and names only what is genuinely missing", () => {
    const limits = computeLimits({ ...EVERYTHING, planTier: "PRO" });
    expect(limits.some((l) => l.key === "plan:ai")).toBe(false);
    // Pro includes video, so claiming otherwise would send a paying user to the
    // billing page for something they already have.
    expect(limits.some((l) => l.key === "plan:video")).toBe(false);
    expect(limits.find((l) => l.key === "plan:zip")?.reason).toBe("plan_locked");
  });

  it("on the top tier, locks nothing by plan", () => {
    const limits = computeLimits({ ...EVERYTHING, planTier: "AGENCY" });
    expect(limits.some((l) => l.reason === "plan_locked")).toBe(false);
  });

  // The rows above are the ones a user reads today. This one is the rule behind
  // them, asserted against the entitlement table itself rather than against a
  // remembered plan matrix — so re-pricing a plan cannot make the chat tell
  // someone a feature is locked when the gate would let it through, and cannot
  // silently retire a row either.
  it("mirrors the entitlement table on every tier, so a re-priced plan cannot drift", () => {
    for (const tier of PLAN_TIERS) {
      const limits = computeLimits({ ...EVERYTHING, planTier: tier });
      const has = (key: string) => limits.some((l) => l.key === key);
      const hasAi = planHasFeature(tier, "aistudio.generate");

      expect(has("plan:ai")).toBe(!hasAi);
      // Per-feature rows exist only underneath a plan that has AI at all.
      expect(has("plan:video")).toBe(hasAi && !planHasFeature(tier, "media.video"));
      expect(has("plan:zip")).toBe(hasAi && !planHasFeature(tier, "export.zip"));
    }
  });
});

describe("describeLimitsForPrompt", () => {
  it("groups by reason and renders a clickable fix where one exists", () => {
    const text = describeLimitsForPrompt(
      computeLimits({ ...EVERYTHING, settings: { ...DEFAULT_CHAT_SETTINGS, allowMediaGen: false } })
    );
    expect(text).toContain("Switched off");
    expect(text).toContain("Not built yet");
    // A fix link is rendered inline so the model can hand it straight to the user.
    expect(text).toMatch(/panel=settings/);
  });

  it("falls back to the one-rule reminder when nothing is blocked", () => {
    // An impossible-in-practice fully-open workspace still has Pinterest + planned
    // connectors, so to hit the empty branch we call it with [] directly.
    const text = describeLimitsForPrompt([]);
    expect(text).toContain("out of scope");
  });
});

describe("limitFix", () => {
  it("prefers an explicit tab over the reason", () => {
    expect(limitFix({ reason: "not_connected", tab: "billing" })?.href).toContain("/dashboard/billing");
  });

  it("maps each reason to its natural destination", () => {
    expect(limitFix({ reason: "setting_off" })?.href).toContain("panel=settings");
    expect(limitFix({ reason: "plan_locked" })?.href).toContain("/dashboard/billing");
    expect(limitFix({ reason: "not_connected" })?.href).toContain("/dashboard/plugins");
  });

  it("returns null when there is genuinely nothing to click", () => {
    expect(limitFix({ reason: "not_built" })).toBeNull();
    expect(limitFix({ reason: "out_of_scope" })).toBeNull();
    expect(limitFix({ tab: "nonsense" })).toBeNull();
  });
});

describe("isLimitReason", () => {
  it("accepts the five real reasons and rejects everything else", () => {
    for (const r of ["setting_off", "not_connected", "plan_locked", "not_built", "out_of_scope"]) {
      expect(isLimitReason(r)).toBe(true);
    }
    expect(isLimitReason("banana")).toBe(false);
    expect(isLimitReason(null)).toBe(false);
    expect(isLimitReason(42)).toBe(false);
  });
});

describe("LIMITATION_RULE", () => {
  it("names the report tool so the prompt and the tool can never drift apart", () => {
    expect(LIMITATION_RULE).toContain(REPORT_LIMITATION_TOOL);
    // The contract in one place: apologise, be honest, record it.
    expect(LIMITATION_RULE.toLowerCase()).toContain("apologise");
  });
});

// ---------------------------------------------------------------------------
// The feedback loop: slug, create, merge, parse, sort
// ---------------------------------------------------------------------------

describe("slugifyRequest", () => {
  it("collapses different phrasings of one title onto one stable slug", () => {
    expect(slugifyRequest("Publish to Pinterest via API")).toBe("publish-to-pinterest-via-api");
    // Punctuation and case can't fork the counter.
    expect(slugifyRequest("Publish to Pinterest, via API!")).toBe("publish-to-pinterest-via-api");
  });

  it("never returns an empty slug", () => {
    expect(slugifyRequest("")).toBe("unnamed-request");
    expect(slugifyRequest("!!!")).toBe("unnamed-request");
  });
});

describe("newRequestPayload", () => {
  it("defaults a first sighting: open, asked once, the request as its own first example", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const p = newRequestPayload({ title: "Connect Mailchimp", request: "hook up mailchimp pls" }, now);
    expect(p.status).toBe("open");
    expect(p.timesAsked).toBe(1);
    expect(p.reason).toBe("out_of_scope");
    expect(p.examples).toEqual(["hook up mailchimp pls"]);
    expect(p.firstAskedAt).toBe(p.lastAskedAt);
  });

  it("falls back to the title when the request text is empty", () => {
    const p = newRequestPayload({ title: "Connect Mailchimp", request: "" });
    expect(p.request).toBe("Connect Mailchimp");
    expect(p.examples).toEqual(["Connect Mailchimp"]);
  });
});

describe("mergeRequestPayload", () => {
  const base = newRequestPayload(
    { title: "Publish to Pinterest", request: "post this to pinterest", reason: "not_built" },
    new Date("2026-01-01T00:00:00.000Z")
  );

  it("raises the counter and keeps a new, distinct phrasing", () => {
    const merged = mergeRequestPayload(
      base,
      { title: "Publish to Pinterest", request: "can you pin this for me" },
      new Date("2026-01-02T00:00:00.000Z")
    );
    expect(merged.timesAsked).toBe(2);
    expect(merged.examples[0]).toBe("can you pin this for me");
    expect(merged.examples).toContain("post this to pinterest");
    expect(merged.firstAskedAt).toBe(base.firstAskedAt); // history preserved
    expect(merged.lastAskedAt).not.toBe(base.lastAskedAt);
  });

  it("does not duplicate an example that only differs by case", () => {
    const merged = mergeRequestPayload(base, { title: "Publish to Pinterest", request: "POST THIS TO PINTEREST" });
    expect(merged.examples.filter((e) => e.toLowerCase() === "post this to pinterest")).toHaveLength(1);
  });

  it("caps the examples list", () => {
    let cur = base;
    for (let i = 0; i < 10; i++) {
      cur = mergeRequestPayload(cur, { title: "Publish to Pinterest", request: `phrasing number ${i}` });
    }
    expect(cur.examples.length).toBeLessThanOrEqual(MAX_REQUEST_EXAMPLES);
    expect(cur.timesAsked).toBe(11);
  });

  it("never resets a status a human already set", () => {
    const planned = { ...base, status: "planned" as const };
    const merged = mergeRequestPayload(planned, { title: "Publish to Pinterest", request: "still want this" });
    expect(merged.status).toBe("planned"); // asked again ≠ back to the top of the pile
  });
});

describe("parseRequestRow", () => {
  it("round-trips a well-formed row", () => {
    const payload = newRequestPayload({ title: "Connect Mailchimp", request: "hook it up" });
    const parsed = parseRequestRow({ id: "abc", content: JSON.stringify(payload) });
    expect(parsed?.id).toBe("abc");
    expect(parsed?.title).toBe("Connect Mailchimp");
  });

  it("rejects unparseable or empty rows instead of throwing", () => {
    expect(parseRequestRow({ id: "1", content: "not json" })).toBeNull();
    expect(parseRequestRow({ id: "2", content: JSON.stringify({}) })).toBeNull();
    expect(parseRequestRow({ id: "3", content: JSON.stringify([1, 2, 3]) })).toBeNull();
  });

  it("repairs a row written by an older version (missing fields fall back)", () => {
    const parsed = parseRequestRow({ id: "4", content: JSON.stringify({ title: "Old ask" }) });
    expect(parsed?.status).toBe("open");
    expect(parsed?.reason).toBe("out_of_scope");
    expect(parsed?.timesAsked).toBe(1);
    expect(parsed?.slug).toBe("old-ask");
  });
});

describe("sortRequests", () => {
  it("ranks open first, then by demand, then by recency — and returns a new array", () => {
    const mk = (over: Partial<FeatureRequest>): FeatureRequest => ({
      ...newRequestPayload({ title: over.title || "x", request: over.request || "x" }),
      id: over.id || "id",
      ...over,
    });
    const input = [
      mk({ id: "shipped", title: "done", status: "shipped", timesAsked: 99 }),
      mk({ id: "quiet-open", title: "a", status: "open", timesAsked: 1, lastAskedAt: "2026-01-01T00:00:00.000Z" }),
      mk({ id: "loud-open", title: "b", status: "open", timesAsked: 8 }),
      mk({ id: "declined", title: "no", status: "declined", timesAsked: 50 }),
    ];
    const order = sortRequests(input).map((r) => r.id);
    expect(order).toEqual(["loud-open", "quiet-open", "shipped", "declined"]);
    expect(sortRequests(input)).not.toBe(input); // pure
  });
});

describe("isFeatureRequestStatus", () => {
  it("accepts the four pipeline states and nothing else", () => {
    for (const s of ["open", "planned", "shipped", "declined"]) expect(isFeatureRequestStatus(s)).toBe(true);
    expect(isFeatureRequestStatus("in_progress")).toBe(false);
    expect(isFeatureRequestStatus(undefined)).toBe(false);
  });
});
