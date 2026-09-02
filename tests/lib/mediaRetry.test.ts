/**
 * TRACE SUITE — the image render must survive a rate-limited minute
 *
 * WHY THIS EXISTS: every campaign that asked for a visual died with
 * "Image generation model failed to produce image bytes". The render loop iterated a
 * two-element array of request shapes and treated each iteration as its whole retry
 * budget, so a single 429 from the image model consumed a shape rather than being
 * retried, and the campaign gave up after roughly six seconds — well inside the
 * quota window it was waiting on.
 *
 * The fix is an attempt-bounded loop that honours the provider's own `retryDelay`
 * hint and reports what actually went wrong. These tests lock the two pure pieces of
 * that fix (the hint parser and the diagnosis) plus `envInt`, which is what moves the
 * retry budget out of the code and into the deployment's quota.
 */
import { describe, it, expect, afterEach } from "vitest";
import { parseRetryDelayMs, describeFailure, isQuotaFailure } from "@/lib/agents/mediaGenerator";
import { envInt } from "@/lib/agents/concurrency";

describe("parseRetryDelayMs", () => {
  it("reads the retryDelay Vertex sends back with a quota rejection", () => {
    // This is the shape that actually arrives, quotes and all.
    expect(parseRetryDelayMs('{"@type":"google.rpc.RetryInfo","retryDelay":"27s"}')).toBe(27000);
    expect(parseRetryDelayMs("retry_delay: 5")).toBe(5000);
    expect(parseRetryDelayMs("RETRYDELAY = '1.5s'")).toBe(1500);
  });

  it("also accepts the HTTP Retry-After spelling", () => {
    expect(parseRetryDelayMs("Retry-After: 12")).toBe(12000);
    expect(parseRetryDelayMs("retry after: 3")).toBe(3000);
  });

  it("returns 0 when the provider gave no hint, so the caller falls back to backoff", () => {
    for (const msg of ["", "429 Too Many Requests", "RESOURCE_EXHAUSTED", "timeout after 40s"]) {
      expect(parseRetryDelayMs(msg)).toBe(0);
    }
  });
});

describe("describeFailure", () => {
  it("names a quota wall as a quota wall, and says it is not a billing wall", () => {
    // The whole point: a marketer reading the console can tell "wait a minute" from
    // "your credentials are wrong" without opening a log. The parenthetical is load
    // bearing — the first instinct on seeing "quota" is to go and top up the credit
    // card, and that buys tokens, not requests per minute.
    expect(describeFailure("429 RESOURCE_EXHAUSTED: Quota exceeded")).toBe(
      "the image model's per-minute request quota is full (a rate limit, not a billing limit)"
    );
    expect(describeFailure("Rate limit reached for this model")).toBe(
      "the image model's per-minute request quota is full (a rate limit, not a billing limit)"
    );
  });

  it("separates the other real causes", () => {
    expect(describeFailure("Image generation timeout after 40s")).toBe(
      "the render exceeded its time budget"
    );
    expect(describeFailure("503 Service Unavailable")).toBe(
      "the image model is temporarily overloaded"
    );
    expect(describeFailure("403 PERMISSION_DENIED on project")).toBe(
      "the image model rejected the project credentials"
    );
    expect(describeFailure("404 model not found")).toBe(
      "the configured image model is not available to this project"
    );
    expect(describeFailure("Response blocked: SAFETY")).toBe(
      "the prompt was blocked by safety filters"
    );
  });

  it("says something honest when there is no message at all", () => {
    expect(describeFailure("")).toBe("no image data returned");
  });

  it("passes an unrecognised message through, truncating only if it is enormous", () => {
    expect(describeFailure("provider returned an empty candidate list")).toBe(
      "provider returned an empty candidate list"
    );
    const long = "x".repeat(400);
    const described = describeFailure(long);
    expect(described).toHaveLength(181);
    expect(described.endsWith("…")).toBe(true);
  });
});

describe("isQuotaFailure", () => {
  // This predicate decides whether a failure gets the pacer's clock or the retry
  // loop's exponential backoff. Getting it wrong in either direction is expensive:
  // a missed 429 means retrying instantly into a shut window, and a false positive
  // means waiting a whole minute for a prompt that was simply blocked.
  it("recognises every spelling Vertex uses for a rate rejection", () => {
    for (const msg of [
      "429 Too Many Requests",
      "RESOURCE_EXHAUSTED",
      "resource exhausted",
      "Quota exceeded for aiplatform.googleapis.com",
      "rate_limit_exceeded",
      "Rate limit reached",
      "too many requests",
    ]) {
      expect(isQuotaFailure(msg)).toBe(true);
    }
  });

  it("leaves the failures that are faults rather than clocks alone", () => {
    for (const msg of [
      "",
      "Image generation timeout after 120s",
      "503 Service Unavailable",
      "403 PERMISSION_DENIED",
      "Response blocked: SAFETY",
      "404 model not found",
    ]) {
      expect(isQuotaFailure(msg)).toBe(false);
    }
  });
});

describe("envInt", () => {
  const KEY = "TEST_ENV_INT_KEY";
  afterEach(() => {
    delete process.env[KEY];
  });

  it("falls back when the variable is unset or unparseable", () => {
    expect(envInt(KEY, 5000)).toBe(5000);
    process.env[KEY] = "";
    expect(envInt(KEY, 5000)).toBe(5000);
    process.env[KEY] = "not-a-number";
    expect(envInt(KEY, 5000)).toBe(5000);
  });

  it("reads and floors a real value", () => {
    process.env[KEY] = "7";
    expect(envInt(KEY, 5)).toBe(7);
    process.env[KEY] = "7.9";
    expect(envInt(KEY, 5)).toBe(7);
  });

  it("clamps to the bounds, so a typo cannot set a 10-hour timeout", () => {
    process.env[KEY] = "999999";
    expect(envInt(KEY, 40000, { min: 10000, max: 300000 })).toBe(300000);
    process.env[KEY] = "1";
    expect(envInt(KEY, 40000, { min: 10000, max: 300000 })).toBe(10000);
  });

  it("allows zero when the caller says zero is meaningful", () => {
    // Slide spacing of 0 is a legitimate choice; the default min of 1 would eat it.
    process.env[KEY] = "0";
    expect(envInt(KEY, 1000, { min: 0 })).toBe(0);
    expect(envInt(KEY, 1000)).toBe(1);
  });
});
