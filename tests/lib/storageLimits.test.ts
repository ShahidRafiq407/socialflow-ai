/**
 * STORAGE CEILINGS — the limit that was sold but never enforced.
 *
 * Every plan publishes a media-storage figure on its card ("500 MB media storage"
 * on Free, up to 100 GB on Agency) and `/api/billing/status` reports usage against
 * it. `checkStorage` was written to hold that line and had no callers at all: the
 * number was displayed, charged for, and unenforceable. An account could fill the
 * bucket every other account renders into.
 *
 * These tests pin the two places that now enforce it — the render choke point in
 * `lib/billing/media.ts` and the upload route — and the two properties that make
 * the check worth having:
 *
 *   The bytes being added count, not just the bytes already there. A check that
 *   only asks "is the account over?" lets one 900 MB upload through a 500 MB plan.
 *   A refusal happens BEFORE credits are reserved, so a full account is told it is
 *   full rather than billed for pixels that cannot be kept.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MB = 1024 * 1024;

/** A subscription row, or null for the no-subscription (Free) case. */
const mockPlan = (plan: string | null) => {
  const now = new Date();
  vi.doMock("@/lib/db", () => ({
    default: {
      subscription: {
        findUnique: vi.fn().mockResolvedValue(
          plan
            ? {
                plan,
                status: "ACTIVE",
                periodStart: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                periodEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000),
                trialEndsAt: null,
                endsAt: null,
                cancelAtPeriodEnd: false,
                testMode: false,
              }
            : null
        ),
      },
      mediaAsset: { aggregate: aggregateMock },
    },
  }));
};

let aggregateMock: ReturnType<typeof vi.fn>;

/** Megabytes this account is already holding. */
const holding = (mb: number) => {
  aggregateMock = vi.fn().mockResolvedValue({ _sum: { size: mb * MB } });
};

beforeEach(() => {
  vi.resetModules();
  holding(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/billing/entitlements");
});

describe("checkStorage", () => {
  it("allows an upload that fits inside the plan's ceiling", async () => {
    holding(120);
    mockPlan(null); // no subscription row → Free, 500 MB

    const { checkStorage } = await import("@/lib/billing/entitlements");
    const gate = await checkStorage("user_1", 10 * MB);

    expect(gate.allowed).toBe(true);
    expect(gate.plan).toBe("FREE");
  });

  it("counts the bytes being added, not only the bytes already stored", async () => {
    // 499 MB held is comfortably inside Free's 500 MB. The 5 MB file being offered
    // is what takes it over, and a check that ignored `addBytes` would wave it in.
    holding(499);
    mockPlan(null);

    const { checkStorage } = await import("@/lib/billing/entitlements");
    const gate = await checkStorage("user_1", 5 * MB);

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("STORAGE_FULL");
  });

  it("names both numbers and the cheapest plan that lifts the ceiling", async () => {
    holding(500);
    mockPlan(null);

    const { checkStorage } = await import("@/lib/billing/entitlements");
    const gate = await checkStorage("user_1", 1 * MB);

    expect(gate.limitMb).toBe(500);
    expect(gate.usedMb).toBe(500);
    // Go is the first paid tier with more room, and TRIAL is never offered as the
    // way out of a limit.
    expect(gate.requiredPlan).toBe("GO");
    expect(gate.message).toMatch(/500 MB of 500 MB/);
  });

  it("bounds the top plan too, and offers no upgrade that does not exist", async () => {
    holding(100 * 1024);
    mockPlan("AGENCY");

    const { checkStorage } = await import("@/lib/billing/entitlements");
    const gate = await checkStorage("user_1", 1 * MB);

    expect(gate.allowed).toBe(false);
    expect(gate.limitMb).toBe(100 * 1024);
    expect(gate.requiredPlan).toBeUndefined();
  });

  it("reads as zero used when the usage query fails, rather than refusing everyone", async () => {
    // Storage is the one gate that fails OPEN: the sum is an aggregate over a table
    // that can time out, and a transient database blip must not stop paying
    // customers from uploading. The credit balance still bounds what they can make.
    aggregateMock = vi.fn().mockRejectedValue(new Error("statement timeout"));
    mockPlan(null);

    const { checkStorage } = await import("@/lib/billing/entitlements");
    const gate = await checkStorage("user_1", 1 * MB);

    expect(gate.allowed).toBe(true);
  });
});

describe("beginMediaCharge — a render with nowhere to go", () => {
  /**
   * Mocks the entitlement layer around media.ts, keeping the real
   * `EntitlementError` so the refusal that travels out is the one routes catch.
   */
  const mockEntitlements = async (opts: {
    storageAllowed: boolean;
    beginAction: ReturnType<typeof vi.fn>;
  }) => {
    const actual = await import("@/lib/billing/entitlements");
    vi.doMock("@/lib/billing/entitlements", () => ({
      ...actual,
      beginAction: opts.beginAction,
      checkStorage: vi.fn().mockResolvedValue(
        opts.storageAllowed
          ? { allowed: true, plan: "FREE" }
          : {
              allowed: false,
              plan: "FREE",
              reason: "STORAGE_FULL",
              limitMb: 500,
              usedMb: 500,
              requiredPlan: "GO",
              message: "Media storage is full: 500 MB of 500 MB used.",
            }
      ),
    }));
  };

  it("refuses before reserving credits when the account is full", async () => {
    const beginAction = vi.fn();
    await mockEntitlements({ storageAllowed: false, beginAction });

    const { beginMediaCharge } = await import("@/lib/billing/media");
    const { isEntitlementError } = await import("@/lib/billing/entitlements");

    const attempt = beginMediaCharge({
      mediaType: "image",
      count: 1,
      owner: { userId: "user_full" },
    });

    await expect(attempt).rejects.toThrow(/storage is full/i);
    await attempt.catch((err) => {
      expect(isEntitlementError(err)).toBe(true);
      expect(err.gate.reason).toBe("STORAGE_FULL");
      expect(err.status).toBe(403);
    });
    // The whole point of checking here rather than at the upload: no reservation was
    // taken, so a full account is not charged for a render it cannot keep.
    expect(beginAction).not.toHaveBeenCalled();
  });

  it("asks for room for the whole deck, not one slide of it", async () => {
    const beginAction = vi
      .fn()
      .mockResolvedValue({ ok: true, credits: 70, gate: { allowed: true, plan: "FREE" } });
    await mockEntitlements({ storageAllowed: true, beginAction });

    const { beginMediaCharge } = await import("@/lib/billing/media");
    const entitlements = await import("@/lib/billing/entitlements");

    await beginMediaCharge({
      mediaType: "multi_image",
      count: 7,
      owner: { userId: "user_deck" },
    });

    const [, addBytes] = vi.mocked(entitlements.checkStorage).mock.calls[0];
    // Seven slides, each estimated at 2 MB. Asking for one slide's worth would let a
    // 7-slide carousel land on an account with room for one image.
    expect(addBytes).toBe(7 * 2 * MB);
  });

  it("sizes a video render far above an image render", async () => {
    const beginAction = vi
      .fn()
      .mockResolvedValue({ ok: true, credits: 400, gate: { allowed: true, plan: "FREE" } });
    await mockEntitlements({ storageAllowed: true, beginAction });

    const { beginMediaCharge } = await import("@/lib/billing/media");
    const entitlements = await import("@/lib/billing/entitlements");

    await beginMediaCharge({ mediaType: "video", count: 1, owner: { userId: "user_vid" } });

    const [, addBytes] = vi.mocked(entitlements.checkStorage).mock.calls[0];
    expect(addBytes).toBe(12 * MB);
  });
});

describe("gateToResponseBody", () => {
  it("carries the megabytes so a refusal can be drawn as a usage bar", async () => {
    const { gateToResponseBody } = await import("@/lib/billing/entitlements");
    const body = gateToResponseBody({
      allowed: false,
      plan: "FREE",
      reason: "STORAGE_FULL",
      limitMb: 500,
      usedMb: 500,
      message: "Media storage is full: 500 MB of 500 MB used.",
    });

    expect(body.limitMb).toBe(500);
    expect(body.usedMb).toBe(500);
    expect(body.reason).toBe("STORAGE_FULL");
    expect(body.upgrade).toBe(true);
  });
});
