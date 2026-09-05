// ============================================================================
// THE TRIAL GUARD — "ALREADY USED" HAS TO MEAN "ALREADY PAID FOR"
//
// WHY THIS EXISTS: a `TrialClaim` row is written when the checkout is CREATED,
// which is before the buyer has typed a card number. Most people who open a
// checkout close it again — so while the "already used a trial" lookups matched on
// the claim row alone, one abandoned checkout burned the offer permanently, for the
// person and for their whole household or office. The only cure was a support
// ticket and a hand-deleted row.
//
// The webhook writes the Lemon Squeezy ids, and the webhook only runs when money
// moved. So their presence is what separates "took the trial" from "looked at it".
//
// The two halves of that fix pull in opposite directions and both are checked here:
//
//   The consumed-trial lookups must require an LS id, or an abandoned checkout
//   blocks the buyer.
//
//   The velocity counters must NOT require one, because twenty abandoned checkouts
//   from one address in an hour is precisely the abuse they exist to catch. A fix
//   applied to the whole file at once would have opened that door.
//
// The prisma double below answers from a list of rows rather than returning fixed
// values, so the assertions are about what the query means, not about how it is
// spelled.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ClaimRow {
  id: string;
  emailHash?: string;
  ipHash?: string;
  fingerprintHash?: string | null;
  userId?: string | null;
  asn?: string | null;
  decision: "ALLOWED" | "FLAGGED" | "BLOCKED";
  lsCustomerId?: string | null;
  lsSubscriptionId?: string | null;
  createdAt?: Date;
}

interface SubRow {
  id: string;
  userId: string;
  plan: string;
  trialEndsAt: Date | null;
}

/**
 * Enough of Prisma's `where` to answer the queries this file makes: equality,
 * `{ in: [...] }`, `{ not: null }`, `{ gte: date }`, and a top-level `OR`.
 *
 * Written out rather than stubbed with fixed return values because the thing under
 * test IS the where clause. A spy that counts calls would pass just as happily with
 * the guard deleted.
 *
 * Lives inside `vi.hoisted` because `vi.mock`'s factory is lifted above the imports
 * and cannot reach an ordinary top-level binding.
 */
const db = vi.hoisted(() => {
  const claimRows: Record<string, unknown>[] = [];
  const subRows: Record<string, unknown>[] = [];

  function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    for (const [key, cond] of Object.entries(where)) {
      if (key === "OR") {
        const any = (cond as Record<string, unknown>[]).some((clause) => matches(row, clause));
        if (!any) return false;
        continue;
      }
      const value = row[key] ?? null;
      if (cond !== null && typeof cond === "object") {
        const op = cond as Record<string, unknown>;
        if ("in" in op && !(op.in as unknown[]).includes(value)) return false;
        if ("not" in op) {
          if (op.not === null && value === null) return false;
          if (op.not !== null && value === op.not) return false;
        }
        if ("gte" in op && !(value instanceof Date && value >= (op.gte as Date))) return false;
        continue;
      }
      if (value !== cond) return false;
    }
    return true;
  }

  return { claimRows, subRows, matches };
});

vi.mock("@/lib/db", () => {
  const table = (rows: Record<string, unknown>[]) => ({
    findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
      const hit = rows.find((row) => db.matches(row, where ?? {}));
      return hit ? { id: hit.id } : null;
    },
    count: async ({ where }: { where?: Record<string, unknown> }) =>
      rows.filter((row) => db.matches(row, where ?? {})).length,
    create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }),
    updateMany: async () => ({ count: 0 }),
  });
  return {
    default: { trialClaim: table(db.claimRows), subscription: table(db.subRows) },
  };
});

import { assessTrialAttempt, hasUsedTrial, signalHash } from "@/lib/billing/trial-guard";

/** The same arrays the double reads, typed for the fixtures below. */
const claims = db.claimRows as unknown as ClaimRow[];
const subs = db.subRows as unknown as SubRow[];

const EMAIL = "buyer@example.com";
const IP = "203.0.113.7";
const FINGERPRINT = "fp-abc-123";

const emailHash = signalHash("email", EMAIL);
const ipHash = signalHash("ip", IP);
const fpHash = signalHash("fp", FINGERPRINT);

/** A row the webhook has been through: real money, so the trial is spent. */
function paidClaim(patch: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: "claim_paid",
    emailHash,
    ipHash,
    fingerprintHash: fpHash,
    userId: "user_earlier",
    asn: "AS64500",
    decision: "ALLOWED",
    lsCustomerId: "cus_1",
    lsSubscriptionId: null,
    createdAt: new Date(),
    ...patch,
  };
}

/** A checkout that was opened and closed again. No money, so nothing is spent. */
function abandonedClaim(patch: Partial<ClaimRow> = {}): ClaimRow {
  return { ...paidClaim(), id: "claim_abandoned", lsCustomerId: null, lsSubscriptionId: null, ...patch };
}

beforeEach(() => {
  claims.length = 0;
  subs.length = 0;
  // No IP intelligence provider answers, so the network contributes only the small
  // "we could not tell" weight and the decisions below turn on history alone.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const attempt = { email: EMAIL, ip: IP, fingerprint: FINGERPRINT, userId: "user_new" };

describe("an abandoned checkout", () => {
  it("does not count as a trial already used", async () => {
    claims.push(abandonedClaim());
    const assessment = await assessTrialAttempt(attempt);
    expect(assessment.decision).toBe("ALLOWED");
    expect(assessment.flags).not.toContain("email_repeat");
    expect(assessment.flags).not.toContain("ip_repeat");
    expect(assessment.flags).not.toContain("fingerprint_repeat");
    expect(assessment.collidedWithId).toBeNull();
  });

  it("does not lock the same person's own account out", async () => {
    claims.push(abandonedClaim({ userId: attempt.userId }));
    const assessment = await assessTrialAttempt(attempt);
    expect(assessment.flags).not.toContain("account_repeat");
    expect(assessment.decision).toBe("ALLOWED");
  });

  it("still counts towards velocity", async () => {
    // The other half of the fix: three abandoned checkouts from one address inside
    // the window is someone iterating, and must still be noticed.
    for (let i = 0; i < 3; i += 1) claims.push(abandonedClaim({ id: `claim_${i}` }));
    const assessment = await assessTrialAttempt(attempt);
    expect(assessment.flags).toContain("ip_velocity");
  });

  it("is invisible to the cheap check the button uses", async () => {
    claims.push(abandonedClaim({ userId: "user_new" }));
    expect(await hasUsedTrial("user_new")).toBe(false);
  });
});

describe("a trial that was paid for", () => {
  it("blocks the same mailbox", async () => {
    claims.push(paidClaim());
    const assessment = await assessTrialAttempt({ ...attempt, ip: null, fingerprint: null });
    expect(assessment.flags).toContain("email_repeat");
    expect(assessment.decision).toBe("BLOCKED");
    expect(assessment.collidedWithId).toBe("claim_paid");
    expect(assessment.reason).toContain("already used a free trial");
  });

  it("blocks the same account", async () => {
    claims.push(paidClaim({ emailHash: signalHash("email", "other@example.com"), userId: "user_new" }));
    const assessment = await assessTrialAttempt({ ...attempt, ip: null, fingerprint: null });
    expect(assessment.flags).toContain("account_repeat");
    expect(assessment.decision).toBe("BLOCKED");
  });

  it("blocks the same browser under a new email", async () => {
    claims.push(
      paidClaim({ emailHash: signalHash("email", "other@example.com"), userId: "user_earlier" })
    );
    const assessment = await assessTrialAttempt({ ...attempt, ip: null });
    expect(assessment.flags).toContain("fingerprint_repeat");
    expect(assessment.decision).toBe("BLOCKED");
  });

  it("counts a subscription-only row as paid, since that is the other id the webhook writes", async () => {
    claims.push(paidClaim({ lsCustomerId: null, lsSubscriptionId: "sub_1" }));
    const assessment = await assessTrialAttempt({ ...attempt, ip: null, fingerprint: null });
    expect(assessment.flags).toContain("email_repeat");
  });

  it("shows in the cheap check", async () => {
    claims.push(paidClaim({ userId: "user_new" }));
    expect(await hasUsedTrial("user_new")).toBe(true);
  });

  it("is remembered by the subscription row even after the claim is cleared by hand", async () => {
    subs.push({ id: "sub_row", userId: "user_new", plan: "TRIAL", trialEndsAt: new Date() });
    expect(await hasUsedTrial("user_new")).toBe(true);
  });

  it("is not claimed by a Free account that never trialled", async () => {
    subs.push({ id: "sub_row", userId: "user_new", plan: "FREE", trialEndsAt: null });
    expect(await hasUsedTrial("user_new")).toBe(false);
  });
});

describe("a blocked earlier attempt", () => {
  it("never counts as consumed, however it was recorded", async () => {
    // BLOCKED means the trial was refused, so it was not had. Counting it would
    // mean a wrongly refused person could never come back.
    claims.push(paidClaim({ decision: "BLOCKED" }));
    const assessment = await assessTrialAttempt({ ...attempt, ip: null, fingerprint: null });
    expect(assessment.flags).not.toContain("email_repeat");
  });
});

describe("a flagged trial", () => {
  it("counts as consumed, because it was still granted", async () => {
    claims.push(paidClaim({ decision: "FLAGGED" }));
    const assessment = await assessTrialAttempt({ ...attempt, ip: null, fingerprint: null });
    expect(assessment.flags).toContain("email_repeat");
  });
});

describe("a missing IP", () => {
  it("is not a shared bucket the first attempt consumes", async () => {
    // Everyone with no forwarded address hashes to the same value, so the address
    // checks have to be skipped rather than collide with each other.
    claims.push(paidClaim({ emailHash: signalHash("email", "other@example.com"), ipHash: signalHash("ip", "unknown"), userId: "user_earlier", fingerprintHash: null }));
    const assessment = await assessTrialAttempt({ email: EMAIL, ip: null, fingerprint: null, userId: "user_new" });
    expect(assessment.flags).not.toContain("ip_repeat");
    expect(assessment.decision).not.toBe("BLOCKED");
  });
});

describe("hashing", () => {
  it("never stores the raw value", async () => {
    const assessment = await assessTrialAttempt(attempt);
    for (const value of [assessment.emailHash, assessment.ipHash, assessment.fingerprintHash ?? ""]) {
      expect(value).not.toContain(EMAIL);
      expect(value).not.toContain(IP);
      expect(value).not.toContain(FINGERPRINT);
      expect(value).toHaveLength(64);
    }
  });
});
