/**
 * TRACE SUITE — one creative per format family, not one per format
 *
 * WHY THIS EXISTS: the campaign graph used to generate a separate post (separate
 * copy, separate paid render) for every requested platform/format pair. Asking for
 * an Instagram Reel + a TikTok video + a Facebook Reel produced three different
 * vertical videos for what the user described as one campaign — three times the
 * render cost, three times the wait, and visibly inconsistent creative.
 *
 * `computeFormatFamilies` is the fix: targets are grouped by what they actually
 * need to render (media kind + orientation), so one shared render serves every
 * member while each member keeps its own native caption.
 *
 * These tests lock the grouping rules so a change to the platform map can never
 * silently split a family back into per-format duplicates.
 */
import { describe, it, expect } from "vitest";
import {
  computeFormatFamilies,
  countVisualTargets,
  describeMembers,
  memberKey,
  orientationOf,
  aspectRatioValue,
} from "@/lib/agents/formatFamilies";

describe("aspectRatioValue", () => {
  it("parses w:h into a numeric ratio", () => {
    expect(aspectRatioValue("9:16")).toBeCloseTo(0.5625, 4);
    expect(aspectRatioValue("1:1")).toBe(1);
    expect(aspectRatioValue("16:9")).toBeCloseTo(1.7778, 4);
    expect(aspectRatioValue("1.91:1")).toBeCloseTo(1.91, 4);
  });

  it("falls back to square on unparseable input rather than NaN", () => {
    // A NaN ratio would poison orientationOf and silently mis-group a family.
    for (const bad of ["", "abc", "0:0", "16:0", "-9:16", "16"]) {
      expect(aspectRatioValue(bad)).toBe(1);
    }
  });
});

describe("orientationOf", () => {
  it("classifies from the ratio itself, so new platform ratios work on day one", () => {
    expect(orientationOf("9:16")).toBe("vertical");
    expect(orientationOf("4:5")).toBe("vertical");
    expect(orientationOf("2:3")).toBe("vertical");
    expect(orientationOf("1:1")).toBe("square");
    expect(orientationOf("16:9")).toBe("landscape");
    expect(orientationOf("1.91:1")).toBe("landscape");
  });
});

describe("memberKey", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(memberKey("Instagram", "Reel")).toBe("instagram|reel");
    expect(memberKey("  TIKTOK ", " Video ")).toBe("tiktok|video");
  });
});

describe("computeFormatFamilies — grouping", () => {
  it("collapses every vertical video target into ONE family with one shared render", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok", "facebook"],
      { instagram: ["reel"], tiktok: ["video"], facebook: ["reel"] }
    );

    const videoFamilies = families.filter((f) => f.kind === "video");
    expect(videoFamilies).toHaveLength(1);

    const family = videoFamilies[0];
    expect(family.orientation).toBe("vertical");
    expect(family.visualRequired).toBe(true);
    expect(family.members).toHaveLength(3);
    // Three posts, but only one render — that is the whole point.
    expect(countVisualTargets(families)).toBe(3);
    expect(videoFamilies.length).toBeLessThan(countVisualTargets(families));
  });

  it("keeps different orientations of the same kind in separate families", () => {
    // A 9:16 story and a 1:1 feed image cannot share pixels.
    const families = computeFormatFamilies(
      ["facebook"],
      { facebook: ["feed", "story"] }
    );

    const imageFamilies = families.filter((f) => f.kind === "image");
    expect(imageFamilies).toHaveLength(2);
    expect(new Set(imageFamilies.map((f) => f.orientation))).toEqual(
      new Set(["square", "vertical"])
    );
  });

  it("separates kinds even at the same orientation", () => {
    // Vertical video and vertical still image are both "vertical" but are not
    // interchangeable artefacts.
    const families = computeFormatFamilies(
      ["instagram", "facebook"],
      { instagram: ["reel"], facebook: ["story"] }
    );

    const keys = families.map((f) => f.key);
    expect(keys).toContain("video|vertical");
    expect(keys).toContain("image|vertical");
  });

  it("gives every family a stable key, label and member description", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok"],
      { instagram: ["reel"], tiktok: ["video"] }
    );
    const family = families.find((f) => f.kind === "video")!;

    expect(family.key).toBe("video|vertical");
    expect(family.label).toContain("vertical video");
    expect(family.label).toContain(family.renderAspectRatio);
    expect(describeMembers(family)).toBe("instagram/reel, tiktok/video");
  });
});

describe("computeFormatFamilies — de-duplication and normalization", () => {
  it("ignores a format the UI sent twice", () => {
    const families = computeFormatFamilies(
      ["instagram"],
      { instagram: ["reel", "reel", "Reel", " REEL "] }
    );
    const members = families.flatMap((f) => f.members);
    expect(members).toHaveLength(1);
  });

  it("normalizes member keys but preserves the raw request for prompts", () => {
    const families = computeFormatFamilies(
      ["Instagram"],
      { Instagram: ["Reel"] }
    );
    const member = families.flatMap((f) => f.members)[0];

    expect(member.platform).toBe("instagram");
    expect(member.contentType).toBe("reel");
    expect(member.rawPlatform).toBe("Instagram");
    expect(member.rawContentType).toBe("Reel");
  });

  it("resolves formats when contentTypes is keyed by the normalized platform", () => {
    // The UI is inconsistent about casing; neither spelling may drop a target.
    const families = computeFormatFamilies(["Instagram"], { instagram: ["reel"] });
    expect(families.flatMap((f) => f.members)).toHaveLength(1);
  });

  it("still produces a post for a platform selected with no explicit format", () => {
    const families = computeFormatFamilies(["facebook"], {});
    const members = families.flatMap((f) => f.members);
    expect(members).toHaveLength(1);
    expect(members[0].contentType).toBe("feed");
  });

  it("skips blank platforms and formats instead of creating empty members", () => {
    const families = computeFormatFamilies(
      ["", "  ", "instagram"],
      { instagram: ["", "  ", "reel"] }
    );
    expect(families.flatMap((f) => f.members)).toHaveLength(1);
  });

  it("returns no families for an empty request", () => {
    expect(computeFormatFamilies([], {})).toEqual([]);
    expect(computeFormatFamilies(undefined as any, undefined as any)).toEqual([]);
  });
});

describe("computeFormatFamilies — shared render ratio", () => {
  it("uses the members' own ratio when they all agree", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok"],
      { instagram: ["reel"], tiktok: ["video"] }
    );
    const family = families.find((f) => f.kind === "video")!;
    expect(family.renderAspectRatio).toBe("9:16");
  });

  it("picks a ratio one of the members actually asked for, never an invented one", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok", "facebook", "youtube"],
      {
        instagram: ["reel", "story"],
        tiktok: ["video"],
        facebook: ["reel", "feed", "story"],
        youtube: ["short"],
      }
    );

    for (const family of families.filter((f) => f.visualRequired)) {
      const memberRatios = family.members.map((m) => m.aspectRatio);
      expect(memberRatios).toContain(family.renderAspectRatio);
    }
  });

  it("is deterministic — the same request always yields the same plan", () => {
    const request = () =>
      computeFormatFamilies(
        ["instagram", "tiktok", "linkedin", "facebook", "pinterest"],
        {
          instagram: ["reel", "carousel", "story"],
          tiktok: ["video"],
          linkedin: ["feed", "carousel"],
          facebook: ["feed", "reel"],
          pinterest: ["pin"],
        }
      );

    expect(JSON.stringify(request())).toBe(JSON.stringify(request()));
  });
});

describe("computeFormatFamilies — text-only formats", () => {
  it("marks text-only targets as needing no render", () => {
    // x/thread and linkedin/article are text posts; paying for an image the
    // platform will not show is pure waste.
    const families = computeFormatFamilies(["x"], { x: ["thread"] });
    const textFamilies = families.filter((f) => !f.visualRequired);

    expect(textFamilies.length).toBeGreaterThan(0);
    for (const family of textFamilies) {
      expect(family.kind).toBe("text_only");
      expect(family.orientation).toBe("none");
      expect(family.plannedSlides).toBe(1);
      // A text-only family carries no render ratio in its label.
      expect(family.label).not.toContain(":");
    }
  });

  it("excludes text-only members from the visual target count", () => {
    const families = computeFormatFamilies(
      ["x", "instagram"],
      { x: ["thread"], instagram: ["reel"] }
    );
    // Only the reel needs pixels.
    expect(countVisualTargets(families)).toBe(1);
  });
});

describe("computeFormatFamilies — deck families", () => {
  it("carries the planned slide count on multi-image families only", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok"],
      { instagram: ["carousel"], tiktok: ["video"] },
      { deckSlides: 6 }
    );

    const deck = families.find((f) => f.kind === "multi_image");
    expect(deck).toBeDefined();
    expect(deck!.plannedSlides).toBe(6);

    const video = families.find((f) => f.kind === "video")!;
    expect(video.plannedSlides).toBe(1);
  });

  it("clamps an out-of-range deck request instead of trusting it", () => {
    for (const requested of [0, -3, 999]) {
      const families = computeFormatFamilies(
        ["instagram"],
        { instagram: ["carousel"] },
        { deckSlides: requested }
      );
      const deck = families.find((f) => f.kind === "multi_image")!;
      expect(deck.plannedSlides).toBeGreaterThan(1);
      expect(deck.plannedSlides).toBeLessThanOrEqual(20);
    }
  });

  it("groups a square deck across platforms so one deck serves both", () => {
    const families = computeFormatFamilies(
      ["instagram", "linkedin"],
      { instagram: ["carousel"], linkedin: ["carousel"] }
    );
    const decks = families.filter((f) => f.kind === "multi_image" && f.orientation === "square");
    expect(decks).toHaveLength(1);
    expect(decks[0].members.length).toBe(2);
  });
});

describe("countVisualTargets", () => {
  it("counts the renders the naive one-per-format approach would have needed", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok", "facebook", "youtube"],
      {
        instagram: ["reel"],
        tiktok: ["video"],
        facebook: ["reel"],
        youtube: ["short"],
      }
    );

    expect(countVisualTargets(families)).toBe(4);
    // …versus one actual render.
    expect(families.filter((f) => f.visualRequired)).toHaveLength(1);
  });

  it("is zero when nothing needs a visual", () => {
    const families = computeFormatFamilies(["x"], { x: ["thread"] });
    expect(countVisualTargets(families)).toBe(0);
  });
});
