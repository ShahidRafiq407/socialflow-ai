import { afterEach, describe, expect, it } from "vitest";
import {
  PLAN_CATALOG,
  PLAN_ENTITLEMENTS,
  basePlanConfig,
  basePlanEntitlements,
  featureCap,
  getActivePlanOverrides,
  planHasFeature,
  setPlanOverrides,
} from "@/lib/billing/plans";
import { MODEL_RATES, allModelRates, isKnownModel, resolveRate, setModelRateOverrides } from "@/lib/billing/modelPricing";
import { commissionFor } from "@/lib/affiliate/config";
import { errorFingerprint, redactContext } from "@/lib/admin/errors";

// ============================================================================
// The back office changes numbers the rest of the product reads from plain
// tables. These lock the two promises that make that safe: an override is
// applied on top of the code default (never in place of it), and clearing the
// override restores the default exactly.
// ============================================================================

describe("plan overrides", () => {
  afterEach(() => setPlanOverrides({}));

  it("applies on top of the code defaults and restores them when cleared", () => {
    const base = basePlanEntitlements("GO");
    const baseConfig = basePlanConfig("GO");

    setPlanOverrides({ GO: { monthlyCredits: base.monthlyCredits + 500, priceMonthly: 99, workspaces: -1 } });
    expect(PLAN_ENTITLEMENTS.GO.monthlyCredits).toBe(base.monthlyCredits + 500);
    expect(PLAN_ENTITLEMENTS.GO.workspaces).toBe(-1);
    expect(PLAN_CATALOG.GO.priceMonthly).toBe(99);
    // Yearly follows monthly when only monthly was changed.
    expect(PLAN_CATALOG.GO.priceYearly).toBe(990);
    // Untouched fields keep their defaults.
    expect(PLAN_ENTITLEMENTS.GO.seats).toBe(base.seats);
    expect(getActivePlanOverrides().GO?.monthlyCredits).toBe(base.monthlyCredits + 500);

    setPlanOverrides({});
    expect(PLAN_ENTITLEMENTS.GO.monthlyCredits).toBe(base.monthlyCredits);
    expect(PLAN_ENTITLEMENTS.GO.workspaces).toBe(base.workspaces);
    expect(PLAN_CATALOG.GO.priceMonthly).toBe(baseConfig.priceMonthly);
    expect(PLAN_CATALOG.GO.priceYearly).toBe(baseConfig.priceYearly);
  });

  it("replaces the feature list and caps, dropping unknown keys", () => {
    setPlanOverrides({
      FREE: {
        features: ["post.manual", "chat.message", "not.a.feature" as never],
        caps: { "chat.message": 10, "bogus": 3 } as never,
      },
    });
    expect(planHasFeature("FREE", "chat.message")).toBe(true);
    expect(planHasFeature("FREE", "media.upload")).toBe(false);
    expect(featureCap("FREE", "chat.message")).toBe(10);
    expect(PLAN_ENTITLEMENTS.FREE.features).not.toContain("not.a.feature");
    expect(Object.keys(PLAN_ENTITLEMENTS.FREE.caps)).not.toContain("bogus");

    setPlanOverrides({});
    expect(planHasFeature("FREE", "chat.message")).toBe(false);
    expect(planHasFeature("FREE", "media.upload")).toBe(true);
  });

  it("ignores garbage values rather than breaking a plan", () => {
    setPlanOverrides({ PRO: { monthlyCredits: Number.NaN, workspaces: "many" as never, imageQuality: "ultra" as never } });
    const base = basePlanEntitlements("PRO");
    expect(PLAN_ENTITLEMENTS.PRO.monthlyCredits).toBe(base.monthlyCredits);
    expect(PLAN_ENTITLEMENTS.PRO.workspaces).toBe(base.workspaces);
    expect(PLAN_ENTITLEMENTS.PRO.imageQuality).toBe(base.imageQuality);
  });
});

describe("model rate overrides", () => {
  afterEach(() => setModelRateOverrides({}));

  it("prices a custom model exactly and leaves the built-in card alone", () => {
    setModelRateOverrides({ "acme-frontier-1": { inputPerMTok: 5, outputPerMTok: 20, role: "Custom" } });
    expect(isKnownModel("acme-frontier-1")).toBe(true);
    expect(resolveRate("acme-frontier-1").outputPerMTok).toBe(20);
    // Dated variants still prefix-match the custom row.
    expect(resolveRate("acme-frontier-1-2026").inputPerMTok).toBe(5);
    expect(allModelRates()["gemini-3.1-pro-preview"]).toEqual(MODEL_RATES["gemini-3.1-pro-preview"]);

    setModelRateOverrides({});
    expect(isKnownModel("acme-frontier-1")).toBe(false);
  });

  it("lets the admin re-price a built-in model", () => {
    const original = MODEL_RATES["gemini-3.6-flash"].inputPerMTok;
    setModelRateOverrides({ "gemini-3.6-flash": { inputPerMTok: original * 2, outputPerMTok: 1 } });
    expect(resolveRate("gemini-3.6-flash").inputPerMTok).toBe(original * 2);
    setModelRateOverrides({});
    expect(resolveRate("gemini-3.6-flash").inputPerMTok).toBe(original);
  });
});

describe("affiliate commission under live terms", () => {
  it("pays the larger of the flat floor and the percentage", () => {
    const terms = { commissionPercent: 20, flatCommissionCents: 1_000 };
    expect(commissionFor(1_200, terms)).toBe(1_000);
    expect(commissionFor(18_000, terms)).toBe(3_600);
    expect(commissionFor(0, terms)).toBe(1_000);
    expect(commissionFor(-5, terms)).toBe(1_000);
  });

  it("follows changed terms", () => {
    expect(commissionFor(10_000, { commissionPercent: 50, flatCommissionCents: 0 })).toBe(5_000);
    expect(commissionFor(10_000, { commissionPercent: 0, flatCommissionCents: 250 })).toBe(250);
  });
});

describe("error reports", () => {
  it("redacts credential-looking keys, recursively, and trims long strings", () => {
    const out = redactContext({
      path: "/api/x",
      apiKey: "sk-live-123",
      nested: { Authorization: "Bearer abc", ok: 1 },
      long: "x".repeat(3_000),
    });
    expect(out?.apiKey).toBe("[redacted]");
    expect((out?.nested as Record<string, unknown>).Authorization).toBe("[redacted]");
    expect((out?.nested as Record<string, unknown>).ok).toBe(1);
    expect((out?.long as string).length).toBeLessThan(2_100);
    expect(redactContext(null)).toBeNull();
  });

  it("groups the same failure across differing numbers and stack lines", () => {
    const a = errorFingerprint("api", "Timeout after 3000ms\n  at foo.ts:12", "/api/chat");
    const b = errorFingerprint("api", "Timeout after 4500ms\n  at bar.ts:99", "/api/chat");
    const c = errorFingerprint("api", "Timeout after 3000ms", "/api/other");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(32);
  });
});
