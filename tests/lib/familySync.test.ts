/**
 * TRACE SUITE — the family contract the user actually asked for
 *
 * WHY THIS EXISTS: the user selects connected platforms expecting ONE campaign,
 * not N remixes. Their words: "instagram feed, facebook feed, linkedin post [are]
 * one family — all of them get ONE image and ONE caption". Two things broke that
 * contract:
 *
 *   1. LinkedIn post/feed were mapped 1.91:1 (landscape), which split them out of
 *      the square image family — so the same campaign rendered a second, different
 *      image for LinkedIn.
 *   2. Deck formats grouped by orientation, splitting an Instagram carousel (1:1)
 *      from a Pinterest carousel (2:3) and an Idea Pin (9:16) — three decks, three
 *      storyboards, three renders for "the same multi-slide post".
 *
 * These tests pin the grouping AND the caption rule that keeps a family in sync:
 * one caption per family, fitted — never rewritten — per member limit.
 */
import { describe, it, expect } from "vitest";
import { computeFormatFamilies } from "@/lib/agents/formatFamilies";
import { fitCaptionToLimit } from "@/lib/agents/campaignGraph";

describe("family taxonomy — the groups the user asked for", () => {
  it("groups instagram feed + facebook feed + linkedin post into ONE square image family", () => {
    const families = computeFormatFamilies(
      ["instagram", "facebook", "linkedin"],
      { instagram: ["feed"], facebook: ["feed"], linkedin: ["post"] }
    );

    const imageFamilies = families.filter((f) => f.kind === "image");
    expect(imageFamilies).toHaveLength(1);

    const family = imageFamilies[0];
    // One render covers all three: same image, same caption, no duplicates.
    expect(family.members).toHaveLength(3);
    expect(family.renderAspectRatio).toBe("1:1");
    expect(family.orientation).toBe("square");
  });

  it("groups every deck format into ONE family regardless of orientation", () => {
    const families = computeFormatFamilies(
      ["instagram", "pinterest", "facebook", "linkedin"],
      {
        instagram: ["carousel"],
        pinterest: ["carousel", "idea pin"],
        facebook: ["multiple photos"],
        linkedin: ["multi-image"],
      }
    );

    const deckFamilies = families.filter((f) => f.kind === "multi_image");
    expect(deckFamilies).toHaveLength(1);

    const family = deckFamilies[0];
    expect(family.members).toHaveLength(5);
    // 3× square members outweigh 2:3 and 9:16, so the shared render is square.
    expect(family.renderAspectRatio).toBe("1:1");
  });

  it("groups every vertical video target in ONE family (reel / tiktok / short / video pin / stories)", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok", "youtube", "facebook", "pinterest"],
      {
        instagram: ["reel", "story"],
        tiktok: ["video"],
        youtube: ["short"],
        facebook: ["reel", "story"],
        pinterest: ["video pin"],
      }
    );

    const videoFamilies = families.filter((f) => f.kind === "video");
    expect(videoFamilies).toHaveLength(1);
    // One vertical render covers reels, shorts, stories AND the video pin —
    // stories publish natively as video (IG STORIES container, FB video_stories).
    expect(videoFamilies[0].members).toHaveLength(7);
    expect(videoFamilies[0].renderAspectRatio).toBe("9:16");
  });

  it("does not merge square stills with vertical stills — the ratio changes the artefact", () => {
    const families = computeFormatFamilies(
      ["instagram", "pinterest"],
      { instagram: ["feed"], pinterest: ["pin"] }
    );

    const imageFamilies = families.filter((f) => f.kind === "image");
    expect(imageFamilies).toHaveLength(2);
  });
});

describe("fitCaptionToLimit — one caption, fitted per member limit", () => {
  it("returns the caption verbatim when it fits", () => {
    expect(fitCaptionToLimit("Short and sweet.", 2200)).toBe("Short and sweet.");
    expect(fitCaptionToLimit("Exact fit.", "Exact fit.".length)).toBe("Exact fit.");
  });

  it("cuts at the last sentence boundary that fits", () => {
    const caption = "First sentence here. Second one follows. Third is lost.";
    // Limit 24 chars: "First sentence here." fits, the rest does not.
    expect(fitCaptionToLimit(caption, 24)).toBe("First sentence here.");
  });

  it("cuts at the last word boundary when there is no sentence end", () => {
    expect(fitCaptionToLimit("one two three four five", 13)).toBe("one two three");
  });

  it("hard-cuts text with no usable boundary", () => {
    expect(fitCaptionToLimit("supercalifragilisticexpialidocious", 10)).toBe("supercalif");
  });

  it("survives an empty caption instead of crashing the copy phase", () => {
    expect(fitCaptionToLimit("", 100)).toBe("");
  });
});
