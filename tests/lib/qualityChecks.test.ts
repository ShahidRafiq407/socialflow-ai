/**
 * TRACE SUITE — the CEO audit must be able to FAIL
 *
 * WHY THIS EXISTS: the CEO auditor used to fall back to a fabricated
 * `{ passed: true, score: 95 }` whenever the judgement call errored or timed out.
 * A campaign with a missing video, a 4000-character X caption, or brand-forbidden
 * wording sailed through with a green verdict, so the audit stage was theatre.
 *
 * `runDeterministicChecks` is the half of the verdict that cannot lie — it decides
 * from the data alone. These tests lock:
 *   - blockers (missing / wrong-kind media) fail the run and are NOT rewritable,
 *   - platform text limits come from the spec, not a guess,
 *   - BrandDNA.forbiddenWords is actually consulted,
 *   - family members that drift apart are reported (the family-sync guarantee),
 *   - the issues handed to the revision agent are grouped per post and per field.
 */
import { describe, it, expect } from "vitest";
import {
  runDeterministicChecks,
  groupIssuesByPost,
  summarizeReport,
  limitsFor,
  PLATFORM_TEXT_LIMITS,
  AI_CLICHE_PHRASES,
} from "@/lib/agents/qualityChecks";
import { computeFormatFamilies } from "@/lib/agents/formatFamilies";

/** A post that passes every check, so each test can break exactly one thing. */
function goodPost(overrides: Record<string, any> = {}) {
  return {
    caption:
      "We rebuilt onboarding around the three questions new users actually asked in support tickets last quarter.",
    hook: "Your onboarding is not too long. It is answering the wrong questions.",
    title: "Onboarding, rewritten from support tickets",
    hashtags: ["#onboarding", "#saas", "#productdesign"],
    imageUrl: "https://cdn.example.com/a.png",
    ...overrides,
  };
}

function content(platforms: Record<string, Record<string, any>>) {
  return { platforms };
}

describe("limitsFor", () => {
  it("returns the real published limit per platform", () => {
    expect(limitsFor("x").captionMax).toBe(280);
    expect(limitsFor("instagram").captionMax).toBe(2200);
    expect(limitsFor("pinterest").captionMax).toBe(500);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(limitsFor("  Instagram ")).toEqual(PLATFORM_TEXT_LIMITS.instagram);
  });

  it("falls back to a conservative default for an unknown platform", () => {
    const limits = limitsFor("bluesky");
    expect(limits.captionMax).toBeGreaterThan(0);
    expect(limits.hashtagMax).toBeGreaterThan(0);
  });
});

describe("runDeterministicChecks — a clean campaign", () => {
  it("passes with no issues and a full score", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({ instagram: { story: goodPost() } }),
      families,
    });

    expect(report.issues).toEqual([]);
    expect(report.blockers).toEqual([]);
    expect(report.score).toBe(100);
    expect(report.passed).toBe(true);
    expect(report.checkedPosts).toBe(1);
  });
});

describe("runDeterministicChecks — blockers cannot be waved through", () => {
  it("blocks when a post was never produced at all", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({ content: content({}), families });

    expect(report.passed).toBe(false);
    expect(report.blockers.map((i) => i.code)).toContain("POST_MISSING");
    // Nothing was inspected, so nothing may be claimed as checked.
    expect(report.checkedPosts).toBe(0);
  });

  it("blocks a video format with no video", () => {
    const families = computeFormatFamilies(["tiktok"], { tiktok: ["video"] });
    const report = runDeterministicChecks({
      content: content({ tiktok: { video: goodPost({ imageUrl: undefined }) } }),
      families,
    });

    expect(report.passed).toBe(false);
    expect(report.blockers.map((i) => i.code)).toContain("VIDEO_ASSET_MISSING");
  });

  it("blocks an image format with no image", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({ instagram: { story: goodPost({ imageUrl: "" }) } }),
      families,
    });

    expect(report.blockers.map((i) => i.code)).toContain("IMAGE_ASSET_MISSING");
  });

  it("blocks a deck that rendered nothing, and one that rendered too few slides", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["carousel"] });

    const empty = runDeterministicChecks({
      content: content({ instagram: { carousel: goodPost({ slideUrls: [] }) } }),
      families,
    });
    expect(empty.blockers.map((i) => i.code)).toContain("DECK_ASSET_MISSING");

    const tooShort = runDeterministicChecks({
      content: content({
        instagram: { carousel: goodPost({ slideUrls: ["s1.png"], overlayText: [{ title: "a", body: "b" }] }) },
      }),
      families,
    });
    expect(tooShort.blockers.map((i) => i.code)).toContain("DECK_TOO_SHORT");
  });

  it("never lists a blocker as fixable — no rewrite can conjure a missing render", () => {
    const families = computeFormatFamilies(["tiktok"], { tiktok: ["video"] });
    const report = runDeterministicChecks({
      content: content({ tiktok: { video: goodPost({ imageUrl: undefined }) } }),
      families,
    });

    for (const blocker of report.blockers) {
      expect(report.fixable).not.toContain(blocker);
    }
    expect(report.fixable.every((i) => i.severity !== "blocker")).toBe(true);
  });

  it("keeps passed=false even when the score would otherwise clear the bar", () => {
    // One blocker on an otherwise flawless campaign: score stays high-ish but the
    // run must still fail, because the post is literally unpublishable.
    const families = computeFormatFamilies(["tiktok"], { tiktok: ["video"] });
    const report = runDeterministicChecks({
      content: content({ tiktok: { video: goodPost({ imageUrl: undefined }) } }),
      families,
    });

    expect(report.blockers.length).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
  });
});

describe("runDeterministicChecks — platform text limits", () => {
  it("flags a caption that exceeds the platform's published limit", () => {
    const families = computeFormatFamilies(["x"], { x: ["post"] });
    const report = runDeterministicChecks({
      content: content({ x: { post: goodPost({ caption: "a".repeat(400) }) } }),
      families,
    });

    const issue = report.issues.find((i) => i.code === "CAPTION_TOO_LONG");
    expect(issue).toBeDefined();
    expect(issue!.field).toBe("caption");
    // The fix hint has to name the real number or the rewrite is a guess.
    expect(issue!.fixHint).toContain("280");
  });

  it("does not flag the same length on a platform that allows it", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({ instagram: { story: goodPost({ caption: "a".repeat(400) }) } }),
      families,
    });

    expect(report.issues.find((i) => i.code === "CAPTION_TOO_LONG")).toBeUndefined();
  });

  it("flags an empty or stub caption", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    for (const caption of ["", "   ", "Nice."]) {
      const report = runDeterministicChecks({
        content: content({ instagram: { story: goodPost({ caption }) } }),
        families,
      });
      expect(report.issues.map((i) => i.code)).toContain("CAPTION_TOO_SHORT");
    }
  });

  it("flags a missing hook and too many hashtags", () => {
    const families = computeFormatFamilies(["x"], { x: ["post"] });
    const report = runDeterministicChecks({
      content: content({
        x: { post: goodPost({ hook: "", hashtags: ["#a", "#b", "#c", "#d", "#e"] }) },
      }),
      families,
    });

    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain("HOOK_MISSING");
    expect(codes).toContain("HASHTAGS_TOO_MANY");
  });
});

describe("runDeterministicChecks — brand safety", () => {
  it("consults BrandDNA.forbiddenWords", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: { story: goodPost({ caption: "Our synergy rewrote how the team ships every single week now." }) },
      }),
      families,
      forbiddenWords: ["synergy"],
    });

    const issue = report.issues.find((i) => i.code === "FORBIDDEN_WORD");
    expect(issue).toBeDefined();
    expect(issue!.message.toLowerCase()).toContain("synergy");
    expect(issue!.fixHint).toBeTruthy();
  });

  it("matches on word boundaries, so a banned word never fires inside another word", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: { story: goodPost({ caption: "We shipped a scalable pipeline after three weeks of rework." }) },
      }),
      families,
      // "scale" must not match inside "scalable".
      forbiddenWords: ["scale"],
    });

    expect(report.issues.find((i) => i.code === "FORBIDDEN_WORD")).toBeUndefined();
  });

  it("catches AI cliché phrasing in the copy", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const cliche = AI_CLICHE_PHRASES[0];
    const report = runDeterministicChecks({
      content: content({
        instagram: { story: goodPost({ caption: `${cliche} — and here is the number that proves it worked out.` }) },
      }),
      families,
    });

    expect(report.issues.map((i) => i.code)).toContain("AI_CLICHE");
  });

  it("scans deck overlay text too, not just the caption", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["carousel"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: {
          carousel: goodPost({
            slideUrls: ["s1.png", "s2.png", "s3.png"],
            overlayText: [
              { title: "Real headline", body: "Real insight about the support tickets." },
              { title: "Synergy", body: "Second insight with enough words to read naturally." },
              { title: "Third", body: "Third insight with enough words to read naturally." },
            ],
          }),
        },
      }),
      families,
      forbiddenWords: ["synergy"],
    });

    expect(report.issues.map((i) => i.code)).toContain("FORBIDDEN_WORD");
  });
});

describe("runDeterministicChecks — deck storyboard integrity", () => {
  it("flags a storyboard that does not line up with the rendered slides", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["carousel"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: {
          carousel: goodPost({
            slideUrls: ["s1.png", "s2.png", "s3.png"],
            overlayText: [{ title: "Only one", body: "entry for three slides." }],
          }),
        },
      }),
      families,
    });

    const issue = report.issues.find((i) => i.code === "DECK_TEXT_SLIDE_MISMATCH");
    expect(issue).toBeDefined();
    expect(issue!.fixHint).toContain("3");
  });

  it("flags a slide whose text is blank, naming the slide number", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["carousel"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: {
          carousel: goodPost({
            slideUrls: ["s1.png", "s2.png", "s3.png"],
            overlayText: [
              { title: "One", body: "First insight with enough words to read naturally." },
              { title: "  ", body: "" },
              { title: "Three", body: "Third insight with enough words to read naturally." },
            ],
          }),
        },
      }),
      families,
    });

    const issue = report.issues.find((i) => i.code === "DECK_TEXT_EMPTY");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("Slide 2");
  });
});

describe("runDeterministicChecks — text-only formats", () => {
  it("does not demand media for a text-only post", () => {
    const families = computeFormatFamilies(["x"], { x: ["thread"] });
    const report = runDeterministicChecks({
      content: content({ x: { thread: goodPost({ imageUrl: undefined, hashtags: ["#a"] }) } }),
      families,
    });

    expect(report.blockers).toEqual([]);
  });

  it("reports media generated for a text-only post as a wasted render", () => {
    const families = computeFormatFamilies(["x"], { x: ["thread"] });
    const report = runDeterministicChecks({
      content: content({ x: { thread: goodPost({ hashtags: ["#a"] }) } }),
      families,
    });

    expect(report.issues.map((i) => i.code)).toContain("UNEXPECTED_MEDIA");
  });
});

describe("runDeterministicChecks — family sync guarantee", () => {
  it("reports members of one family that rendered different assets", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok"],
      { instagram: ["reel"], tiktok: ["video"] }
    );
    const report = runDeterministicChecks({
      content: content({
        instagram: { reel: goodPost({ imageUrl: undefined, videoUrl: "https://cdn/one.mp4" }) },
        tiktok: { video: goodPost({ imageUrl: undefined, videoUrl: "https://cdn/DIFFERENT.mp4" }) },
      }),
      families,
    });

    expect(report.issues.map((i) => i.code)).toContain("FAMILY_MEDIA_DESYNC");
  });

  it("stays silent when the family correctly shares one render", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok"],
      { instagram: ["reel"], tiktok: ["video"] }
    );
    const shared = "https://cdn/shared.mp4";
    const report = runDeterministicChecks({
      content: content({
        instagram: { reel: goodPost({ imageUrl: undefined, videoUrl: shared }) },
        tiktok: { video: goodPost({ imageUrl: undefined, videoUrl: shared }) },
      }),
      families,
    });

    expect(report.issues.map((i) => i.code)).not.toContain("FAMILY_MEDIA_DESYNC");
    expect(report.issues.map((i) => i.code)).not.toContain("FAMILY_HOOK_DESYNC");
  });

  it("reports a family whose hook drifted between members", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok"],
      { instagram: ["reel"], tiktok: ["video"] }
    );
    const shared = "https://cdn/shared.mp4";
    const report = runDeterministicChecks({
      content: content({
        instagram: { reel: goodPost({ imageUrl: undefined, videoUrl: shared, hook: "Hook number one here." }) },
        tiktok: { video: goodPost({ imageUrl: undefined, videoUrl: shared, hook: "A completely different hook." }) },
      }),
      families,
    });

    expect(report.issues.map((i) => i.code)).toContain("FAMILY_HOOK_DESYNC");
  });

  it("treats hooks differing only by case or padding as in sync", () => {
    const families = computeFormatFamilies(
      ["instagram", "tiktok"],
      { instagram: ["reel"], tiktok: ["video"] }
    );
    const shared = "https://cdn/shared.mp4";
    const report = runDeterministicChecks({
      content: content({
        instagram: { reel: goodPost({ imageUrl: undefined, videoUrl: shared, hook: "Same hook here." }) },
        tiktok: { video: goodPost({ imageUrl: undefined, videoUrl: shared, hook: "  SAME HOOK HERE.  " }) },
      }),
      families,
    });

    expect(report.issues.map((i) => i.code)).not.toContain("FAMILY_HOOK_DESYNC");
  });
});

describe("runDeterministicChecks — post lookup is forgiving about casing", () => {
  it("finds a post stored under a differently-cased platform or format key", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({ Instagram: { Story: goodPost() } }),
      families,
    });

    // If lookup were case-sensitive this would have reported POST_MISSING and the
    // audit would fail a campaign that is actually fine.
    expect(report.checkedPosts).toBe(1);
    expect(report.blockers).toEqual([]);
  });
});

describe("runDeterministicChecks — scoring", () => {
  it("deducts more for a blocker than for a minor issue", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });

    const minor = runDeterministicChecks({
      content: content({ instagram: { story: goodPost({ title: "" }) } }),
      families,
    });
    const blocked = runDeterministicChecks({
      content: content({ instagram: { story: goodPost({ imageUrl: undefined }) } }),
      families,
    });

    expect(minor.score).toBeGreaterThan(blocked.score);
    expect(minor.score).toBeLessThan(100);
  });

  it("never returns a negative score", () => {
    const families = computeFormatFamilies(["x"], { x: ["post"] });
    const report = runDeterministicChecks({
      content: content({ x: { post: { caption: "", hook: "", title: "", hashtags: [] } } }),
      families,
    });

    expect(report.score).toBeGreaterThanOrEqual(0);
  });

  it("handles undefined content without throwing", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({ content: undefined, families });

    expect(report.passed).toBe(false);
    expect(report.blockers.length).toBeGreaterThan(0);
  });
});

describe("groupIssuesByPost", () => {
  it("groups issues per post and collapses the fields to rewrite", () => {
    const families = computeFormatFamilies(["x"], { x: ["post"] });
    const report = runDeterministicChecks({
      content: content({
        x: { post: goodPost({ caption: "a".repeat(400), hook: "", title: "" }) },
      }),
      families,
    });

    const groups = groupIssuesByPost(report.fixable);
    expect(groups).toHaveLength(1);
    expect(groups[0].platform).toBe("x");
    expect(groups[0].contentType).toBe("post");
    expect(groups[0].fields).toContain("caption");
    expect(groups[0].fields).toContain("hook");
    // Fields are de-duplicated so the revision prompt asks once per field.
    expect(new Set(groups[0].fields).size).toBe(groups[0].fields.length);
  });

  it("drops family-level issues that belong to no single post", () => {
    // FAMILY_* issues carry no platform/contentType — they cannot be routed to
    // one post's rewrite, so they must not create a phantom group.
    const groups = groupIssuesByPost([
      { code: "FAMILY_HOOK_DESYNC", severity: "minor", field: "hook", message: "x" },
    ]);
    expect(groups).toEqual([]);
  });

  it("keeps posts separate", () => {
    const families = computeFormatFamilies(
      ["instagram", "facebook"],
      { instagram: ["story"], facebook: ["story"] }
    );
    const report = runDeterministicChecks({
      content: content({
        instagram: { story: goodPost({ title: "" }) },
        facebook: { story: goodPost({ hashtags: [] }) },
      }),
      families,
    });

    const groups = groupIssuesByPost(report.fixable);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.platform).sort()).toEqual(["facebook", "instagram"]);
  });
});

describe("summarizeReport", () => {
  it("states the clean result without inventing problems", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({ instagram: { story: goodPost() } }),
      families,
    });

    expect(summarizeReport(report)).toContain("passed");
  });

  it("reports real counts when there are issues", () => {
    const families = computeFormatFamilies(["x"], { x: ["post"] });
    const report = runDeterministicChecks({
      content: content({ x: { post: goodPost({ caption: "a".repeat(400), title: "" }) } }),
      families,
    });

    const summary = summarizeReport(report);
    expect(summary).toBeTruthy();
    expect(summary).not.toContain("passed every");
  });
});
