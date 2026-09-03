/**
 * THE ARTIFACT → EDITOR JOIN — a field is filled from the stage that proved it
 *
 * WHY THIS EXISTS: the editor reads one shape, `GeneratedArticle`, and a staged run
 * produces twelve separate artifacts. `articleFromRun` is the only place those two
 * vocabularies meet, which makes it the one place a plausible-looking fabrication
 * could get in — an image list assembled from a brief that only *asked* for images,
 * a word count reported by a model instead of counted, an FAQ in the structured
 * data that the page never answers.
 *
 * So these tests lock the properties the plan requires:
 *   - no HTML from any stage means no article at all, not a blank draft,
 *   - the numbers are measured off the HTML that shipped,
 *   - a stage that did not run leaves its field empty rather than inventing one,
 *   - every warning names a specific thing a person can go and fix,
 *   - the links stage's HTML wins over the writer's, because it is later.
 */
import { describe, it, expect } from "vitest";
import { articleFromRun } from "@/components/dashboard/article-writer/runArticle";
import { buildFaqSection, parseFaqSection } from "@/lib/agents/workers/articleAssembly";
import type { ArticleBrief } from "@/lib/article/brief";

const brief = (over: Partial<ArticleBrief> = {}): ArticleBrief => ({
  keyword: "commercial epoxy flooring",
  targetWordCount: 100,
  enableInternalLinks: true,
  enableExternalLinks: true,
  enableImages: true,
  enableYoutube: false,
  enableFaq: true,
  enableToc: true,
  enableTakeaways: true,
  enableSources: true,
  humanize: false,
  ...over,
});

const BODY = [
  "<p>Commercial epoxy flooring is a resin system poured over concrete.</p>",
  "<h2>What it costs</h2>",
  "<p>Expect a real quote after a site visit, not a price from a table.</p>",
  "<h2>How long it lasts</h2>",
  "<p>Ten to twenty years in a warehouse that is swept.</p>",
].join("");

const draft = (html = BODY) => ({
  title: "Commercial epoxy flooring, priced honestly",
  html,
  excerpt: "What the resin costs and how long it lasts.",
  wordCount: 44,
  sectionCount: 2,
  unfinished: [] as string[],
});

/** A real outline: `readArticleOutline` refuses one with no sections. */
const outline = (over: Record<string, unknown> = {}) => ({
  title: "Outline title",
  slug: "outline-slug",
  directAnswer: "Between $4 and $9 a square foot, installed.",
  sections: [
    { heading: "What it costs", readerQuestion: "How much?", points: ["Per square foot"], wordTarget: 200 },
  ],
  faq: [] as string[],
  ...over,
});

describe("articleFromRun — nothing from nothing", () => {
  it("returns null when no stage has produced a page", () => {
    expect(articleFromRun({}, brief())).toBeNull();
    // A planned article is not a written one: the outline stage alone opens nothing.
    expect(articleFromRun({ outline: outline() }, brief())).toBeNull();
  });

  it("returns null when the writer's artifact is present but empty", () => {
    expect(articleFromRun({ write: { ...draft(), html: "   " } }, brief())).toBeNull();
  });
});

describe("articleFromRun — the numbers are counted, not reported", () => {
  it("measures the word count off the HTML rather than trusting the draft", () => {
    // The draft claims 44 words. The real body has a different count, and the
    // measured one is what the sidebar shows.
    const built = articleFromRun({ write: { ...draft(), wordCount: 5000 } }, brief());
    expect(built).not.toBeNull();
    expect(built!.article.seoMetrics.wordCount).toBeGreaterThan(20);
    expect(built!.article.seoMetrics.wordCount).toBeLessThan(80);
  });

  it("grades the real count against the requested target", () => {
    const built = articleFromRun({ write: draft() }, brief({ targetWordCount: 2000 }));
    expect(built!.article.seoMetrics.targetWordCount).toBe(2000);
    // ~45 words against a 2000-word target is a bad accuracy, and it says so.
    expect(built!.article.seoMetrics.wordCountAccuracy).toBeLessThan(10);
    expect(built!.article.seoMetrics.wordCountAccuracy).toBeGreaterThanOrEqual(0);
  });

  it("builds the contents list from the headings really in the document", () => {
    const built = articleFromRun({ write: draft() }, brief());
    expect(built!.article.tableOfContents.map((entry) => entry.text)).toEqual([
      "What it costs",
      "How long it lasts",
    ]);
    expect(built!.article.content).toContain('id="what-it-costs"');
  });
});

describe("articleFromRun — a stage that did not run fills nothing", () => {
  it("leaves images, tags, takeaways and pillars empty on a quick run", () => {
    const built = articleFromRun({ write: draft() }, brief({ enableImages: true, imageCount: 4 }));
    // The brief asked for four images. Quick mode has no media stage, so no stage
    // chose one — and a picture nothing chose does not go in the editor.
    expect(built!.article.images).toEqual([]);
    expect(built!.article.youtube).toBeNull();
    expect(built!.article.suggestedTags).toEqual([]);
    expect(built!.article.keyTakeaways).toEqual([]);
    expect(built!.article.pillarCoverage).toEqual([]);
  });

  it("omits the score, gate, fact check and SERP panels until their stages run", () => {
    const built = articleFromRun({ write: draft() }, brief());
    expect(built!.score).toBeUndefined();
    expect(built!.gate).toBeUndefined();
    expect(built!.factcheck).toBeUndefined();
    expect(built!.seo).toBeUndefined();
    expect(built!.serp).toBeUndefined();
    expect(built!.article.searchIntent).toBe("");
    expect(built!.article.schemaMarkup).toBe("");
  });

  it("falls back to the outline title, then the brief, when the writer has none", () => {
    // A write artifact with no title is not a draft — `readArticleDraft` refuses it
    // whole, so its HTML is not the page either and there is nothing to open.
    expect(articleFromRun({ write: { ...draft(), title: "" } }, brief())).toBeNull();

    // With the body coming from the links stage instead, the outline is the source
    // of the title and the slug.
    const fromOutline = articleFromRun({ links: { html: BODY }, outline: outline() }, brief());
    expect(fromOutline!.article.title).toBe("Outline title");
    expect(fromOutline!.article.slug).toBe("outline-slug");

    const fromBrief = articleFromRun({ links: { html: BODY } }, brief({ title: "Brief title" }));
    expect(fromBrief!.article.title).toBe("Brief title");
    expect(fromBrief!.article.slug).toBe("");

    // And with neither, the keyword — the one field a run cannot start without.
    const fromKeyword = articleFromRun({ links: { html: BODY } }, brief());
    expect(fromKeyword!.article.title).toBe("commercial epoxy flooring");
  });
});

describe("articleFromRun — which HTML is the page", () => {
  it("prefers the links stage's HTML over the writer's, because it is later", () => {
    const linked = BODY.replace(
      "resin system",
      '<a href="https://example.com/resin">resin system</a>'
    );
    const built = articleFromRun(
      { write: draft(), links: { html: linked, internal: [], external: [] } },
      brief()
    );
    expect(built!.article.content).toContain('href="https://example.com/resin"');
  });

  it("carries the links each stage recorded, with the reason it gave", () => {
    const built = articleFromRun(
      {
        write: draft(),
        links: {
          internal: [{ url: "/services/epoxy", anchor: "epoxy install", reason: "The service page" }],
          external: [
            {
              url: "https://www.astm.org/f1869",
              anchor: "ASTM F1869",
              publisher: "ASTM",
              reachable: true,
              status: 200,
            },
          ],
        },
      },
      brief()
    );
    expect(built!.article.internalLinks).toEqual([
      { anchorText: "epoxy install", url: "/services/epoxy", label: "The service page" },
    ]);
    expect(built!.article.externalLinks).toEqual([
      { anchorText: "ASTM F1869", url: "https://www.astm.org/f1869", label: "ASTM" },
    ]);
  });
});

describe("articleFromRun — every warning names something specific", () => {
  it("reports unfinished sections, unsupported claims, dead links and gate blockers", () => {
    const built = articleFromRun(
      {
        write: { ...draft(), unfinished: ["Maintenance schedule", "Warranty"] },
        links: { internal: [], external: [], removed: ["https://dead.example/x"] },
        factcheck: {
          entries: [
            { claim: "Epoxy lasts 40 years", verdict: "unsupported", note: "The cited page says 20." },
            { claim: "It is the strongest floor made", verdict: "unsupported", note: "Nothing supports it." },
            { claim: "Cures in an hour", verdict: "uncertain", note: "No source either way." },
          ],
          unprovenBusinessFacts: ["We have installed 4,000 floors"],
        },
        seo: { title: { value: "x", ok: false }, issues: ["The meta description is empty."] },
        schema: { jsonLd: '{"@type":"Article"}', notes: ["FAQPage no longer produces a rich result."] },
        gate: {
          checks: [
            { key: "meta", label: "Meta description", passed: false, blocker: "No meta description was written." },
            { key: "title", label: "Title", passed: true },
          ],
        },
      },
      brief()
    );

    const warnings = built!.article.warnings;
    expect(warnings.some((w) => w.includes("Maintenance schedule") && w.includes("Warranty"))).toBe(true);
    expect(warnings.some((w) => w.includes("2 claims") && w.includes("not supported"))).toBe(true);
    expect(warnings.some((w) => w.includes("1 claim") && w.includes("could not be verified"))).toBe(true);
    expect(warnings.some((w) => w.includes("4,000 floors"))).toBe(true);
    expect(warnings.some((w) => w.includes("1 link") && w.includes("did not resolve"))).toBe(true);
    expect(warnings).toContain("The meta description is empty.");
    expect(warnings).toContain("FAQPage no longer produces a rich result.");
    expect(warnings).toContain("No meta description was written.");
    // Nothing generic, and nothing empty.
    expect(warnings.every((w) => w.trim().length > 0)).toBe(true);
    expect(warnings).not.toContain("SEO failed");
  });

  it("says nothing when there is nothing to say", () => {
    const built = articleFromRun(
      { write: draft(), seo: { title: { value: "t", ok: true }, issues: [] } },
      brief()
    );
    expect(built!.article.warnings).toEqual([]);
  });
});

describe("articleFromRun — the panels each stage does fill", () => {
  it("computes the quality total from the weights, not from a model's number", () => {
    const built = articleFromRun(
      {
        write: draft(),
        score: {
          total: 99,
          dimensions: [
            { key: "differentiation", score: 40, note: "Repeats the ranking pages on price." },
            { key: "trust", score: 80, note: "Sources named." },
            { key: "relevance", score: 60, note: "Two specifics about this business." },
          ],
          biggestGap: "Say what the site visit finds that a price table cannot.",
        },
      },
      brief()
    );
    // Seven of the ten dimensions were not scored, so they contribute zero: the
    // total is well under the 99 the artifact claimed.
    expect(built!.score!.total).toBeLessThan(30);
    expect(built!.score!.differentiation).toBe(40);
    expect(built!.score!.trust).toBe(80);
    expect(built!.score!.relevance).toBe(60);
  });

  it("reads the SERP artifact in the research panel's vocabulary", () => {
    const built = articleFromRun(
      {
        write: draft(),
        serp: {
          keyword: "commercial epoxy flooring",
          country: "US",
          competitors: [
            { url: "https://a.example/guide", title: "A guide", headings: ["Costs", "Lifespan"], wordCount: 1200 },
            { url: "https://b.example/costs", title: "Costs", headings: ["Pricing"] },
          ],
          peopleAlsoAsk: ["How much does epoxy flooring cost?"],
          relatedSearches: ["epoxy flooring cost per square foot"],
        },
      },
      brief()
    );
    const serp = built!.serp!;
    expect(serp.topResults.map((r) => r.position)).toEqual([1, 2]);
    // The snippet is the page's first heading — a real quote, not a summary.
    expect(serp.topResults[0].snippet).toBe("Costs");
    // Only the competitor that reported a length is in the mean; the other is not
    // counted as zero.
    expect(serp.estimatedAvgWordCount).toBe(1200);
    expect(serp.peopleAlsoAsk).toEqual(["How much does epoxy flooring cost?"]);
  });

  it("takes the FAQ from the page, so the schema describes what a reader sees", () => {
    const faqHtml = buildFaqSection(
      [{ question: "Is epoxy slippery when wet?", answer: "Not with an aggregate broadcast." }],
      "Questions we get asked"
    );
    const built = articleFromRun({ write: { ...draft(), html: BODY + faqHtml } }, brief());
    expect(built!.article.faqItems).toEqual([
      { question: "Is epoxy slippery when wet?", answer: "Not with an aggregate broadcast." },
    ]);
  });
});

describe("parseFaqSection", () => {
  it("round-trips exactly what buildFaqSection emits", () => {
    const items = [
      { question: "What does it cost?", answer: "A quote after a site visit." },
      { question: "How long does it cure?", answer: "Light traffic in 24 hours." },
    ];
    expect(parseFaqSection(buildFaqSection(items, "Common questions"))).toEqual(items);
  });

  it("finds nothing in a page with no FAQ, and skips a question with no answer", () => {
    expect(parseFaqSection(BODY)).toEqual([]);
    expect(
      parseFaqSection('<div class="faq-item"><h3>Orphan?</h3></div>')
    ).toEqual([]);
  });
});
