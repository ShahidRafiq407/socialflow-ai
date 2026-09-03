/**
 * ARTICLE GENERATOR SUITE — the promises the pipeline makes without the model
 *
 * WHY THIS EXISTS: three of the article writer's headline claims used to be
 * unenforced. "articleSize" mapped to a word *range* nobody checked, the outline
 * was free to invent internal and external URLs (a 404 in the body is a Trust
 * failure), and "all four E-E-A-T pillars" was a sentence in a prompt.
 *
 * Those three promises are kept by pure functions, so they are testable without
 * a single model call. Everything here runs offline:
 *   - the requested word count survives the plan arithmetically,
 *   - no URL outside the allow-list can reach the blueprint,
 *   - all four pillars are assigned even when the model returns one,
 *   - every anchor a link needs is handed to a section that must write it.
 */
import { describe, it, expect } from "vitest";
import type { SerpAnalysis } from "@/actions/serp";
import {
  ARTICLE_SIZE_WORDS,
  buildCitationAllowList,
  MAX_TARGET_WORDS,
  MIN_TARGET_WORDS,
  normalizeBlueprint,
  planSectionCount,
  planWordAdjustments,
  resolveTargetWordCount,
  type GenerateArticleParams,
} from "@/lib/agents/workers/article-generator";

const serp = (links: string[]): SerpAnalysis => ({
  keyword: "email marketing for dentists",
  topResults: links.map((link, i) => ({
    position: i + 1,
    title: `Result ${i + 1}`,
    link,
    snippet: "",
  })),
  peopleAlsoAsk: ["How often should a dentist email patients?", "Is email or SMS better?"],
  relatedSearches: [],
  estimatedAvgWordCount: 0,
  estimatedHeadingCount: 0,
  measuredPages: 0,
  gl: "us",
  hl: "en",
});

const params = (over: Partial<GenerateArticleParams> = {}): GenerateArticleParams => ({
  keyword: "email marketing for dentists",
  ...over,
});

describe("resolveTargetWordCount", () => {
  it("prefers the number the user typed over the size preset", () => {
    expect(resolveTargetWordCount({ targetWordCount: 1750, articleSize: "xl" })).toBe(1750);
  });

  it("falls back to the preset, and to medium for an unknown one", () => {
    expect(resolveTargetWordCount({ articleSize: "long" })).toBe(ARTICLE_SIZE_WORDS.long);
    expect(resolveTargetWordCount({ articleSize: "gigantic" })).toBe(ARTICLE_SIZE_WORDS.medium);
    expect(resolveTargetWordCount({})).toBe(ARTICLE_SIZE_WORDS.medium);
  });

  it("clamps absurd requests instead of accepting them", () => {
    expect(resolveTargetWordCount({ targetWordCount: 4 })).toBe(MIN_TARGET_WORDS);
    expect(resolveTargetWordCount({ targetWordCount: 999999 })).toBe(MAX_TARGET_WORDS);
    expect(resolveTargetWordCount({ targetWordCount: -20, articleSize: "short" })).toBe(
      ARTICLE_SIZE_WORDS.short
    );
  });
});

describe("planSectionCount", () => {
  it("scales with length but stays inside readable bounds", () => {
    expect(planSectionCount(300)).toBe(4);
    expect(planSectionCount(2500)).toBeGreaterThan(planSectionCount(1200));
    expect(planSectionCount(8000)).toBeLessThanOrEqual(14);
  });
});

describe("buildCitationAllowList", () => {
  it("returns nothing when there was no SERP to draw from", () => {
    expect(buildCitationAllowList(undefined, "mysite.com")).toEqual([]);
    expect(buildCitationAllowList(serp([]), "mysite.com")).toEqual([]);
  });

  it("excludes the publisher's own domain and keeps one URL per domain", () => {
    const list = buildCitationAllowList(
      serp([
        "https://mysite.com/blog/a",
        "https://ada.org/stats",
        "https://ada.org/other",
        "https://example.com/x",
      ]),
      "https://mysite.com"
    );
    expect(list.map((c) => c.url)).toEqual(["https://ada.org/stats", "https://example.com/x"]);
  });

  it("puts evidence domains ahead of commercial ones", () => {
    const list = buildCitationAllowList(
      serp(["https://someblog.com/post", "https://nih.gov/study"]),
      undefined
    );
    expect(list[0].url).toBe("https://nih.gov/study");
  });
});

describe("normalizeBlueprint", () => {
  const citations = [
    { url: "https://ada.org/stats", title: "ADA statistics" },
    { url: "https://cdc.gov/oral", title: "CDC oral health" },
  ];
  const internals = [{ url: "https://mysite.com/book", title: "Book an appointment" }];

  const modelOutline = {
    title: "Email Marketing for Dentists",
    metaTitle: "x".repeat(120),
    metaDescription: "y".repeat(400),
    slug: "Email Marketing For Dentists!!",
    searchIntent: "informational",
    keyTakeaways: ["Send fewer, better emails"],
    sections: [
      { heading: "Why recall email works", pillar: "Expertise", wordTarget: 100, linkPhrases: [] },
      { heading: "Build the list", pillar: "Expertise", wordTarget: 100, linkPhrases: [] },
      { heading: "What the data says", pillar: "Expertise", wordTarget: 100, linkPhrases: [] },
      { heading: "Where it goes wrong", pillar: "Expertise", wordTarget: 100, linkPhrases: [] },
    ],
    faqQuestions: ["How often should I send?"],
    suggestedTags: ["dental", "email"],
    imageBriefs: [{ afterSection: 99, searchQuery: "dentist reviewing x-ray", alt: "X-ray review" }],
    youtubeQuery: "dental email marketing",
    citations: [
      { url: "https://ada.org/stats", anchorText: "the ADA data", label: "ADA" },
      { url: "https://totally-made-up-source.example/report", anchorText: "one study", label: "Study" },
    ],
    internalLinks: [
      { url: "https://mysite.com/book", anchorText: "booking page", label: "Book" },
      { url: "https://mysite.com/invented-page", anchorText: "our guide", label: "Guide" },
    ],
  };

  it("drops every URL that was not in the allow-list", () => {
    const { blueprint } = normalizeBlueprint(modelOutline, params(), 2000, 6, citations, internals);
    expect(blueprint.citations.map((c) => c.url)).toEqual(["https://ada.org/stats"]);
    expect(blueprint.internalLinks.map((l) => l.url)).toEqual(["https://mysite.com/book"]);
  });

  it("rescales the model's word targets so they really add up to the body budget", () => {
    const target = 3000;
    const { blueprint } = normalizeBlueprint(modelOutline, params(), target, 8, citations, internals);
    const sum = blueprint.sections.reduce((total, s) => total + s.wordTarget, 0);
    // 82% of the request goes to the sections; the rest is intro, close, takeaways, FAQ.
    expect(sum).toBeGreaterThan(target * 0.78);
    expect(sum).toBeLessThan(target * 0.86);
  });

  it("assigns all four pillars even when the model used one", () => {
    const { blueprint } = normalizeBlueprint(modelOutline, params(), 2000, 6, citations, internals);
    expect(new Set(blueprint.sections.map((s) => s.pillar)).size).toBe(4);
  });

  it("gives every link anchor to a section that has to write it verbatim", () => {
    const { blueprint } = normalizeBlueprint(modelOutline, params(), 2000, 6, citations, internals);
    const phrases = blueprint.sections.flatMap((s) => s.linkPhrases.map((p) => p.toLowerCase()));
    for (const link of [...blueprint.citations, ...blueprint.internalLinks]) {
      expect(phrases).toContain(link.anchorText.toLowerCase());
    }
  });

  it("keeps meta fields inside the lengths the checklist grades", () => {
    const { blueprint } = normalizeBlueprint(modelOutline, params(), 2000, 6, citations, internals);
    expect(blueprint.metaTitle.length).toBeLessThanOrEqual(62);
    expect(blueprint.metaDescription.length).toBeLessThanOrEqual(160);
    expect(blueprint.slug).toBe("email-marketing-for-dentists");
  });

  it("tops the FAQ up from People Also Ask and clamps image briefs to the real sections", () => {
    const { blueprint } = normalizeBlueprint(
      modelOutline,
      params({ serpData: serp(["https://ada.org/stats"]), imageCount: 2 }),
      2000,
      6,
      citations,
      internals
    );
    expect(blueprint.faqQuestions.length).toBeGreaterThan(1);
    expect(blueprint.imageBriefs[0].afterSection).toBeLessThan(blueprint.sections.length);
  });

  it("honours the toggles instead of quietly adding the features anyway", () => {
    const { blueprint } = normalizeBlueprint(
      modelOutline,
      params({
        enableExternalLinks: false,
        enableInternalLinks: false,
        enableFaq: false,
        enableTakeaways: false,
        enableImages: false,
      }),
      2000,
      6,
      citations,
      internals
    );
    expect(blueprint.citations).toEqual([]);
    expect(blueprint.internalLinks).toEqual([]);
    expect(blueprint.faqQuestions).toEqual([]);
    expect(blueprint.keyTakeaways).toEqual([]);
    expect(blueprint.imageBriefs).toEqual([]);
  });

  it("still produces a usable outline when the model returns nothing, and says so", () => {
    const { blueprint, warnings } = normalizeBlueprint(null, params(), 1500, 5, [], []);
    expect(blueprint.sections.length).toBe(4);
    expect(blueprint.title.length).toBeGreaterThan(0);
    expect(blueprint.labels.toc).toBe("Table of contents");
    expect(warnings.join(" ")).toMatch(/default outline/i);
  });

  it("warns honestly when there is nothing real to link to", () => {
    const { warnings } = normalizeBlueprint(modelOutline, params(), 1500, 5, [], []);
    expect(warnings.join(" ")).toMatch(/without external citations/i);
    expect(warnings.join(" ")).toMatch(/no internal links/i);
  });

  it("takes the label wording from the model so a translated article is not headed in English", () => {
    const { blueprint } = normalizeBlueprint(
      { ...modelOutline, labels: { toc: "Índice", takeaways: "Puntos clave", faq: "Preguntas", sources: "Fuentes" } },
      params({ language: "Spanish" }),
      1500,
      5,
      citations,
      internals
    );
    expect(blueprint.labels.toc).toBe("Índice");
    expect(blueprint.labels.sources).toBe("Fuentes");
  });
});

describe("planWordAdjustments", () => {
  it("concentrates a shortfall in the heaviest sections rather than padding every one", () => {
    const plan = planWordAdjustments([500, 400, 120, 110, 100], 600);
    expect(plan.length).toBeLessThanOrEqual(3);
    expect(plan.map((p) => p.index)).toContain(0);
    expect(plan.reduce((sum, p) => sum + p.words, 0)).toBe(600);
  });

  it("cuts from the heaviest sections when the draft ran long", () => {
    const plan = planWordAdjustments([600, 300, 200], -300);
    expect(plan.every((p) => p.words < 0)).toBe(true);
    expect(plan.reduce((sum, p) => sum + p.words, 0)).toBe(-300);
  });

  it("does nothing when the article is already the right length", () => {
    expect(planWordAdjustments([400, 400], 0)).toEqual([]);
    expect(planWordAdjustments([], 500)).toEqual([]);
  });
});
