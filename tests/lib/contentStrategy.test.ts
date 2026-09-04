/**
 * TRACE SUITE — the generators must stop writing adverts
 *
 * WHY THIS EXISTS: Brand DNA was being read as a creative brief. The company name,
 * the service list and the value proposition went into every copy prompt, and every
 * prompt mandated a CTA, so the AI Studio reliably produced a sales pitch for work
 * the business may never have done ("Partner with us to build specialised robotics").
 *
 * `contentStrategy.ts` is the fix: Brand DNA is demoted to voice and audience, the
 * subject becomes something live in the reader's field, and the close asks for a
 * comment instead of a click. `SELF_PROMOTIONAL_PHRASES` + `findSelfPromotion` are
 * the deterministic half — the same list feeds the writer's ban text, the audit and
 * the pre-render repair, so the brief and the auditor cannot drift apart.
 *
 * These tests lock:
 *   - the doctrine never leaks an offer, a CTA or a credential claim into a prompt,
 *   - Brand DNA's sellable fields cannot reach the brief even when they are present,
 *   - the angle rotation is deterministic (a retry is not a lottery) and spreads,
 *   - `findSelfPromotion` catches real pitches and does NOT fire on ordinary
 *     tutorial phrasing ("get started" is teaching, "get started today" is selling),
 *   - `PROMOTIONAL_COPY` reaches the revision agent as a fixable issue, from the
 *     caption, the description and the deck's slide text alike.
 */
import { describe, it, expect } from "vitest";
import {
  AUDIENCE_FIRST_RULES,
  AUDIENCE_FIRST_AUDIT_CRITERIA,
  CONTENT_ANGLES,
  ENGAGEMENT_CLOSE_RULE,
  PROMOTION_BAN_RULE,
  PROMO_FIX_HINT,
  VISUAL_PROMPT_RULE,
  audienceContext,
  contentAngleFor,
  contentDoctrine,
  defaultTopicHint,
  trendSearchQuery,
} from "@/lib/agents/contentStrategy";
import {
  runDeterministicChecks,
  findSelfPromotion,
  SELF_PROMOTIONAL_PHRASES,
} from "@/lib/agents/qualityChecks";
import { computeFormatFamilies } from "@/lib/agents/formatFamilies";

/** A realistic Brand DNA record, including the fields that used to become the pitch. */
const brand = {
  name: "SMB Robotics",
  industry: "industrial robotics",
  tone: "direct, technical",
  writingStyle: "short paragraphs, no hype",
  targetAudience: "plant managers and automation engineers",
  keywords: ["cobots", "cycle time", "payload", "PLC"],
};

function goodPost(overrides: Record<string, any> = {}) {
  return {
    caption:
      "We rebuilt onboarding around the three questions new users actually asked in support tickets last quarter.",
    hook: "Your onboarding is not too long. It is answering the wrong questions.",
    title: "Onboarding, rewritten from support tickets",
    hashtags: ["#onboarding", "#saas", "#productdesign"],
    imageUrl: "https://cdn.example.com/a.png",
    videoUrl: "https://cdn.example.com/a.mp4",
    ...overrides,
  };
}

function content(platforms: Record<string, Record<string, any>>) {
  return { platforms };
}

describe("audienceContext — Brand DNA as voice, not as a brief", () => {
  it("passes through the field, the audience, the voice and the vocabulary", () => {
    const ctx = audienceContext(brand);

    expect(ctx).toContain("industrial robotics");
    expect(ctx).toContain("plant managers and automation engineers");
    expect(ctx).toContain("direct, technical");
    expect(ctx).toContain("cobots");
  });

  it("never carries a sellable field into the prompt, even when one is present", () => {
    // These are the exact keys that used to turn every post into an advert. They are
    // not on StrategyBrand, so an over-eager caller spreading a whole Brand DNA record
    // must still not be able to smuggle them through.
    const ctx = audienceContext({
      ...brand,
      // @ts-expect-error — deliberately passing the fields the doctrine excludes.
      valueProposition: "We build specialised robotics for SMBs",
      services: "Cobot integration, PLC retrofits",
      ctaOffer: "Book a free automation audit",
      missionVision: "To be the leading provider of factory automation",
    });

    expect(ctx).not.toContain("We build specialised robotics");
    expect(ctx).not.toContain("Cobot integration");
    expect(ctx).not.toContain("Book a free automation audit");
    expect(ctx).not.toContain("leading provider");
  });

  it("names the publisher as the narrator, with a condition attached", () => {
    const ctx = audienceContext(brand);
    expect(ctx).toContain("SMB Robotics");
    // The name is allowed only as attribution — the line that permits it must also
    // be the line that restricts it.
    expect(ctx.toLowerCase()).toContain("only name it");
  });

  it("degrades gracefully to a usable brief when Brand DNA is empty", () => {
    const ctx = audienceContext({});
    expect(ctx).toContain("this industry");
    expect(ctx).not.toContain("undefined");
    expect(ctx).not.toContain("null");
  });

  it("omits the optional lines instead of emitting empty labels", () => {
    const ctx = audienceContext({ industry: "logistics" });
    expect(ctx).not.toMatch(/- Voice:\s*$/m);
    expect(ctx).not.toMatch(/- Language the audience already uses:\s*$/m);
  });
});

describe("contentDoctrine — the brief every copy step opens with", () => {
  it("bans selling, invented track records and credential claims in one breath", () => {
    const brief = contentDoctrine({ brand, topic: "cycle time", seed: "linkedin:post:cycle time" });

    expect(brief).toContain(AUDIENCE_FIRST_RULES);
    expect(brief.toLowerCase()).toContain("no selling");
    expect(brief.toLowerCase()).toContain("no invented track record");
    expect(brief.toLowerCase()).toContain("no credential claims");
  });

  it("treats the user's topic as a boundary to explain, not a thing to sell", () => {
    const brief = contentDoctrine({ brand, topic: "cobot payload limits" });

    expect(brief).toContain("cobot payload limits");
    expect(brief.toLowerCase()).toContain("not as something being sold");
  });

  it("asks for the audience's open question when no topic was given", () => {
    const brief = contentDoctrine({ brand });

    expect(brief.toLowerCase()).toContain("most needs answered");
    expect(brief).not.toContain("SUBJECT BOUNDARY: stay on");
  });

  it("includes an angle by default and drops it on request", () => {
    const withAngle = contentDoctrine({ brand, seed: "x:post:a" });
    const withoutAngle = contentDoctrine({ brand, seed: "x:post:a", includeAngle: false });

    expect(withAngle).toContain("ANGLE FOR THIS POST");
    expect(withoutAngle).not.toContain("ANGLE FOR THIS POST");
  });

  it("keeps the blank separators that make the brief readable", () => {
    // The composer filters `null`, not `""` — the empty strings are load-bearing
    // spacing. Filtering falsy values would collapse the whole brief into a wall.
    const brief = contentDoctrine({ brand, seed: "s" });
    expect(brief).toContain("\n\n");
  });

  it("is stable for the same seed, so a retry is not a lottery", () => {
    const seed = "instagram:carousel:cycle time";
    expect(contentDoctrine({ brand, seed })).toBe(contentDoctrine({ brand, seed }));
  });
});

describe("contentAngleFor — deterministic rotation", () => {
  it("returns the same angle for the same seed", () => {
    expect(contentAngleFor("linkedin:post:payload").id).toBe(
      contentAngleFor("linkedin:post:payload").id
    );
  });

  it("spreads across more than one angle as the seed changes", () => {
    const ids = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map((s) => contentAngleFor(s).id)
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("always returns a real angle, including for an empty seed", () => {
    const angle = contentAngleFor("");
    expect(CONTENT_ANGLES.map((a) => a.id)).toContain(angle.id);
    expect(angle.brief.length).toBeGreaterThan(20);
  });

  it("offers no angle that requires claiming the business did the work", () => {
    // "Show how the work is really done" is the one angle that could slide into a
    // case study, so its brief has to forbid that explicitly.
    const process = CONTENT_ANGLES.find((a) => a.id === "process");
    expect(process).toBeDefined();
    expect(process!.brief.toLowerCase()).toContain("never a claim about a specific client");
  });
});

describe("trendSearchQuery — research the audience, not the marketing", () => {
  it("asks what the audience is discussing, not for viral hooks", () => {
    const q = trendSearchQuery(brand, "cycle time", "linkedin");

    expect(q).toContain("plant managers and automation engineers");
    expect(q).toContain("industrial robotics");
    expect(q).toContain("cycle time");
    expect(q).toContain("linkedin");
    expect(q.toLowerCase()).not.toContain("viral");
  });

  it("still produces a usable query with no topic, platform or Brand DNA", () => {
    const q = trendSearchQuery({});
    expect(q).toContain("this industry");
    expect(q).not.toContain("undefined");
  });

  it("anchors the search to the current year", () => {
    expect(trendSearchQuery(brand)).toContain(String(new Date().getFullYear()));
  });
});

describe("defaultTopicHint — the fallback topic is no longer an offer", () => {
  it("points at a misconception in the field rather than at the product", () => {
    const hint = defaultTopicHint(brand);
    expect(hint).toContain("industrial robotics");
    expect(hint.toLowerCase()).not.toContain("offering");
    expect(hint.toLowerCase()).not.toContain("our ");
  });

  it("works with no industry set", () => {
    expect(defaultTopicHint({})).toContain("this field");
  });
});

describe("the shared rule strings", () => {
  it("ask for words rather than clicks", () => {
    expect(ENGAGEMENT_CLOSE_RULE.toLowerCase()).toContain("question");
    expect(ENGAGEMENT_CLOSE_RULE.toLowerCase()).toContain("never a sales cta");
    expect(PROMOTION_BAN_RULE.toLowerCase()).toContain("never sell");
  });

  it("keep the visual off the company too", () => {
    // A slide reading "Partner with us" is the same failure, rendered at cost.
    expect(VISUAL_PROMPT_RULE.toLowerCase()).toContain("no logos");
    expect(VISUAL_PROMPT_RULE.toLowerCase()).toContain("no slogans");
  });

  it("give the repair pass something concrete to do", () => {
    expect(PROMO_FIX_HINT.toLowerCase()).toContain("strip every sales line");
    expect(PROMO_FIX_HINT.toLowerCase()).toContain("close with a question");
  });

  it("score the auditor against the same doctrine the writer was handed", () => {
    expect(AUDIENCE_FIRST_AUDIT_CRITERIA.toLowerCase()).toContain("automatic fail");
    expect(AUDIENCE_FIRST_AUDIT_CRITERIA.toLowerCase()).toContain("rather than a click");
  });
});

describe("findSelfPromotion — the deterministic half", () => {
  it("catches the sales close", () => {
    expect(findSelfPromotion("Great insight. Book a call to see how we do it.")).toContain(
      "book a call"
    );
    expect(findSelfPromotion("Full breakdown — link in bio.")).toContain("link in bio");
    expect(findSelfPromotion("DM us for the template.")).toContain("dm us");
  });

  it("catches the invented track record, which is the worse failure", () => {
    // The model has no idea what this business has delivered, so a capability claim
    // is a lie the reader can catch out.
    expect(findSelfPromotion("We specialize in cobot retrofits for SMB plants.")).toContain(
      "we specialize"
    );
    expect(findSelfPromotion("Trusted by 200 factories across the region.")).toContain("trusted by");
    expect(findSelfPromotion("Our clients cut cycle time by 30%.")).toContain("our clients");
  });

  it("catches offers and manufactured urgency", () => {
    expect(findSelfPromotion("Limited time — special offer this week only.")).toEqual(
      expect.arrayContaining(["limited time", "special offer"])
    );
  });

  it("reports every phrase it matched, so the fix hint can name them", () => {
    const hits = findSelfPromotion("We offer audits. Contact us today. Link in bio.");
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits).toEqual(expect.arrayContaining(["we offer", "contact us", "link in bio"]));
  });

  it("stays silent on a post that teaches instead of selling", () => {
    const clean =
      "Payload ratings are measured at the wrist, not at the tool. Add a 3kg gripper to a 10kg cobot and you are working with 7kg. Most cycle-time overruns I see start there. Where has a spec sheet caught you out?";
    expect(findSelfPromotion(clean)).toEqual([]);
  });

  it("does NOT fire on ordinary tutorial phrasing", () => {
    // The phrase list was chosen to avoid exactly these false positives: the selling
    // version carries the urgency word, the teaching version does not.
    expect(findSelfPromotion("To get started, open the controller config.")).toEqual([]);
    expect(findSelfPromotion("Sign up flows fail for one boring reason.")).toEqual([]);
    expect(findSelfPromotion("Call the function once per cycle, not per axis.")).toEqual([]);
    expect(findSelfPromotion("Our solution space is wider than two vendors.")).toEqual([]);

    // ...while the promotional twin of each is still caught.
    expect(findSelfPromotion("Get started today.")).toContain("get started today");
    expect(findSelfPromotion("Sign up today.")).toContain("sign up today");
    expect(findSelfPromotion("Call us today.")).toContain("call us today");
  });

  it("matches on word boundaries, never inside a longer word", () => {
    expect(findSelfPromotion("The undmusable payload chart is the problem.")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(findSelfPromotion("PARTNER WITH US")).toContain("partner with us");
  });

  it("handles empty and missing text without throwing", () => {
    expect(findSelfPromotion("")).toEqual([]);
    expect(findSelfPromotion(undefined as any)).toEqual([]);
  });

  it("keeps the phrase list lowercase, so the prompt ban text reads cleanly", () => {
    for (const phrase of SELF_PROMOTIONAL_PHRASES) {
      expect(phrase).toBe(phrase.toLowerCase());
      expect(phrase.trim()).toBe(phrase);
    }
  });
});

describe("runDeterministicChecks — PROMOTIONAL_COPY", () => {
  it("flags a caption that pitches the business", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: {
          story: goodPost({
            caption:
              "Onboarding is answering the wrong questions. Partner with us to fix yours — book a call this week.",
          }),
        },
      }),
      families,
    });

    const issue = report.issues.find((i) => i.code === "PROMOTIONAL_COPY");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("major");
    expect(issue!.field).toBe("caption");
    expect(issue!.message.toLowerCase()).toContain("partner with us");
    // The revision agent needs to be told which phrases to delete.
    expect(issue!.fixHint).toContain("book a call");
  });

  it("hands the issue to the revision agent instead of failing the run outright", () => {
    // A pitch is repairable by a rewrite, unlike a missing render — so it must be
    // fixable, never a blocker.
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: { story: goodPost({ caption: "Real insight here. Contact us for the full audit." }) },
      }),
      families,
    });

    expect(report.blockers.map((i) => i.code)).not.toContain("PROMOTIONAL_COPY");
    expect(report.fixable.map((i) => i.code)).toContain("PROMOTIONAL_COPY");
    expect(report.score).toBeLessThan(100);
  });

  it("scans the description, not just the caption", () => {
    // Pinterest pins carry the pitch in `description`, which the blob used to omit.
    const families = computeFormatFamilies(["pinterest"], { pinterest: ["pin"] });
    const report = runDeterministicChecks({
      content: content({
        pinterest: {
          pin: goodPost({
            videoUrl: undefined,
            description: "Save this chart. Visit our website for the full guide.",
          }),
        },
      }),
      families,
    });

    expect(report.issues.map((i) => i.code)).toContain("PROMOTIONAL_COPY");
  });

  it("scans the deck's slide text, because that pitch gets typeset at full render cost", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["carousel"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: {
          carousel: goodPost({
            slideUrls: ["s1.png", "s2.png", "s3.png"],
            overlayText: [
              { title: "Payload lies", body: "Ratings are measured at the wrist, not the tool." },
              { title: "The maths", body: "A 3kg gripper on a 10kg arm leaves you 7kg." },
              { title: "Next step", body: "Book a demo and we will size it for you." },
            ],
          }),
        },
      }),
      families,
    });

    const issue = report.issues.find((i) => i.code === "PROMOTIONAL_COPY");
    expect(issue).toBeDefined();
    expect(issue!.message.toLowerCase()).toContain("book a demo");
  });

  it("stays silent on informational copy that closes with a question", () => {
    const families = computeFormatFamilies(["instagram"], { instagram: ["story"] });
    const report = runDeterministicChecks({
      content: content({
        instagram: {
          story: goodPost({
            caption:
              "Payload is rated at the wrist, not at the tool. Add a 3kg gripper to a 10kg cobot and you are planning for 7kg. Which spec has burned your cycle time?",
          }),
        },
      }),
      families,
    });

    expect(report.issues.map((i) => i.code)).not.toContain("PROMOTIONAL_COPY");
    expect(report.passed).toBe(true);
  });
});
