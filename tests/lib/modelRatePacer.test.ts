/**
 * TRACE SUITE — the image model's per-minute window is shared, not per-render
 *
 * WHY THIS EXISTS: the campaign renders several format families at once, and every
 * one of them draws on the SAME Vertex requests-per-minute allowance for the same
 * image model. Before this pacer, each render discovered a full window on its own,
 * spent its own retry budget re-proving it, and the campaign died with a quota error
 * on a project holding hundreds of dollars of unused credit — because credit buys
 * tokens and quota governs rate, and topping up does nothing for a 429.
 *
 * These tests lock the three properties the pipeline depends on: a burst is held to
 * the window, admission is serialised so two concurrent renders cannot both claim the
 * last slot, and a provider rejection lowers the ceiling for everyone at once.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRatePacer, getModelRatePacer } from "@/lib/agents/rateLimit";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRatePacer", () => {
  it("lets a burst through up to the allowance, then holds the rest for the window", async () => {
    const pacer = createRatePacer({ limit: 3, windowMs: 1000 });

    // The first three are the deployment's stated allowance: no waiting, because
    // pacing a request that is inside quota would only make renders slower.
    for (let i = 0; i < 3; i++) await pacer.acquire();

    const waits: number[] = [];
    let admitted = false;
    const fourth = pacer.acquire({ onWait: (ms) => waits.push(ms) }).then(() => {
      admitted = true;
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(admitted).toBe(false);
    // The caller is told how long, so a stalled-looking console says why it stalled.
    expect(waits[0]).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(1100);
    await fourth;
    expect(admitted).toBe(true);
  });

  it("serialises admission so two renders cannot claim the same free slot", async () => {
    // This is the case that made a bounded media concurrency necessary in the first
    // place: both callers check a window with one slot left and both send.
    const pacer = createRatePacer({ limit: 1, windowMs: 1000 });
    const admitted: string[] = [];

    const first = pacer.acquire().then(() => admitted.push("first"));
    const second = pacer.acquire().then(() => admitted.push("second"));

    await vi.advanceTimersByTimeAsync(50);
    expect(admitted).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(1100);
    await Promise.all([first, second]);
    expect(admitted).toEqual(["first", "second"]);
  });

  it("survives a caller that aborts, so the queue behind it still moves", async () => {
    const pacer = createRatePacer({ limit: 1, windowMs: 1000 });
    const controller = new AbortController();
    await pacer.acquire();

    const aborted = pacer.acquire({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    // Cancelling a campaign must not leave the run asleep for another minute.
    await expect(aborted).resolves.toBeUndefined();

    const next = pacer.acquire();
    await vi.advanceTimersByTimeAsync(1100);
    await expect(next).resolves.toBeUndefined();
  });

  it("halves the allowance when the provider says 429 anyway", () => {
    // The configured RPM is an estimate; the rejection is a fact, and the fact wins.
    const pacer = createRatePacer({ limit: 4, windowMs: 1000 });
    expect(pacer.limit()).toBe(4);
    expect(pacer.describe()).toBe("4/min");

    pacer.penalize();
    expect(pacer.limit()).toBe(2);
    expect(pacer.describe()).toContain("throttled to 2/min");
  });

  it("honours the provider's own retryDelay before sending again", async () => {
    const pacer = createRatePacer({ limit: 4, windowMs: 1000 });
    pacer.penalize(5000);

    let admitted = false;
    const held = pacer.acquire().then(() => {
      admitted = true;
    });

    // Vertex said five seconds. Sending at four would spend an attempt to be told so.
    await vi.advanceTimersByTimeAsync(4000);
    expect(admitted).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);
    await held;
    expect(admitted).toBe(true);
  });

  it("restores the full allowance once the penalty lapses", async () => {
    const pacer = createRatePacer({ limit: 4, windowMs: 1000, penaltyMs: 2000 });
    pacer.penalize();
    expect(pacer.limit()).toBe(2);

    await vi.advanceTimersByTimeAsync(2100);
    expect(pacer.limit()).toBe(4);
    expect(pacer.describe()).toBe("4/min");
  });
});

describe("getModelRatePacer", () => {
  it("gives one window per model id, shared by every render in the process", () => {
    // Module state is the point: the slides of one deck and the families rendering
    // beside it are spending the same quota, so they have to queue on one pacer.
    const first = getModelRatePacer("test-image-model-a", { limit: 6, windowMs: 1000 });
    const again = getModelRatePacer("test-image-model-a", { limit: 999, windowMs: 1000 });
    expect(again).toBe(first);
    expect(again.limit()).toBe(6);

    // A step-down model has its own quota, so it must not inherit the wall.
    const other = getModelRatePacer("test-image-model-b", { limit: 2, windowMs: 1000 });
    expect(other).not.toBe(first);
    first.penalize();
    expect(other.limit()).toBe(2);
  });
});
