import { describe, it, expect } from "vitest";
import {
  DECK_MEDIA_FIT,
  mediaPreviewFrame,
  parseAspectRatio,
  resolvePreviewRatio,
} from "@/components/editors/mediaPreviewFrame";

/**
 * The deck editors size their preview from a runtime ratio string, which Tailwind
 * cannot compile into a class. These helpers produce the inline style instead, so
 * the numbers they return ARE the preview the user sees.
 */
describe("parseAspectRatio", () => {
  it("splits a normal w:h ratio", () => {
    expect(parseAspectRatio("9:16")).toEqual({ w: 9, h: 16 });
    expect(parseAspectRatio("4:5")).toEqual({ w: 4, h: 5 });
    expect(parseAspectRatio("16:9")).toEqual({ w: 16, h: 9 });
  });

  it("falls back to square for anything unusable", () => {
    for (const bad of [undefined, null, "", "auto", "1:0", "0:1", "-4:5", "abc:def", "1"]) {
      expect(parseAspectRatio(bad as any)).toEqual({ w: 1, h: 1 });
    }
  });
});

describe("mediaPreviewFrame", () => {
  it("emits a CSS aspect-ratio the browser understands", () => {
    expect(mediaPreviewFrame("4:5").aspectRatio).toBe("4 / 5");
    expect(mediaPreviewFrame("9:16").aspectRatio).toBe("9 / 16");
  });

  it("keeps tall decks narrow so the full page stays on screen", () => {
    // 9:16 Idea Pin page, 4:5 Instagram carousel slide
    expect(mediaPreviewFrame("9:16").maxWidth).toBe(380);
    expect(mediaPreviewFrame("4:5").maxWidth).toBe(380);
  });

  it("gives square and near-square decks the middle width", () => {
    expect(mediaPreviewFrame("1:1").maxWidth).toBe(460);
    expect(mediaPreviewFrame("5:4").maxWidth).toBe(460);
  });

  it("lets wide decks use the full column", () => {
    expect(mediaPreviewFrame("16:9").maxWidth).toBe(620);
    expect(mediaPreviewFrame("8:5").maxWidth).toBe(620);
  });

  it("never returns a zero or negative frame", () => {
    for (const ratio of [undefined, "", "auto", "0:0", "junk"]) {
      const frame = mediaPreviewFrame(ratio as any);
      expect(frame.aspectRatio).toBe("1 / 1");
      expect(frame.maxWidth).toBeGreaterThan(0);
    }
  });
});

describe("resolvePreviewRatio", () => {
  it("uses the explicit Image Settings choice when the user made one", () => {
    expect(resolvePreviewRatio("9:16", "1:1")).toBe("9:16");
    expect(resolvePreviewRatio(" 4:5 ", "1:1")).toBe("4:5");
  });

  it("falls back to the platform default on 'auto'", () => {
    expect(resolvePreviewRatio("auto", "4:5")).toBe("4:5");
    expect(resolvePreviewRatio("", "9:16")).toBe("9:16");
    expect(resolvePreviewRatio(undefined, "2:3")).toBe("2:3");
  });

  it("falls back to square when the platform has no default either", () => {
    expect(resolvePreviewRatio("auto", undefined)).toBe("1:1");
    expect(resolvePreviewRatio(null, "")).toBe("1:1");
  });

  it("previews typeset graphics without cropping them", () => {
    // object-cover would slice the headline off an informational slide
    expect(DECK_MEDIA_FIT).toContain("object-contain");
    expect(DECK_MEDIA_FIT).not.toContain("object-cover");
  });
});
