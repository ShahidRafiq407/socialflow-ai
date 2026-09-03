/**
 * ARTICLE ASSEMBLY SUITE — the SEO scorecard must be able to FAIL
 *
 * WHY THIS EXISTS: the previous article writer asked the model to report its own
 * SEO score and link counts, then displayed them. `seoScore` was literally
 * `realWordCount >= minWords ? 94 : 85`, internal links were `count || 3`, and the
 * UI forced a 98–100. The scorecard was decoration.
 *
 * Everything under test here is a pure function over the HTML that actually
 * ships, so these tests lock the properties the user asked for:
 *   - the requested word count is graded against the real count,
 *   - links are counted from real anchors and split internal vs external,
 *   - link injection can never corrupt markup or double-link,
 *   - readability is real Flesch, not a label the model picked,
 *   - a bare article scores badly (the rubric is not a rubber stamp).
 */
import { describe, it, expect } from "vitest";
import {
  assembleArticle,
  buildFigure,
  buildSchemaMarkup,
  computeReadability,
  countKeywordOccurrences,
  countHtmlWords,
  fixEscapedNewlines,
  injectHeadingIds,
  injectLink,
  measureArticle,
  sanitizeModelHtml,
  slugify,
  type ArticleSectionPart,
} from "@/lib/agents/workers/articleAssembly";

const section = (heading: string, html: string): ArticleSectionPart => ({
  heading,
  level: 2,
  html,
  anchorId: slugify(heading),
});

describe("sanitizeModelHtml", () => {
  it("strips code fences, document shells and a model-written H1", () => {
    const out = sanitizeModelHtml(
      '```html\n<html><body><h1>Duplicate title</h1><p>Real prose.</p></body></html>\n```'
    );
    expect(out).toBe("<p>Real prose.</p>");
  });

  it("removes scripts, iframes and inline event handlers", () => {
    const out = sanitizeModelHtml(
      `<p onclick="steal()">Hi</p><script>alert(1)</script><iframe src="x"></iframe>`
    );
    expect(out).toBe("<p>Hi</p>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
  });
});

describe("injectLink", () => {
  it("links the first plain-text occurrence only", () => {
    const res = injectLink("<p>Use email marketing. Then email marketing again.</p>", "email marketing", "https://x.com/a");
    expect(res.applied).toBe(true);
    expect((res.html.match(/<a /g) || []).length).toBe(1);
  });

  it("never writes inside an attribute", () => {
    const res = injectLink('<p><img src="email-marketing.png" alt="chart" />text</p>', "email-marketing", "https://x.com/a");
    expect(res.applied).toBe(false);
    expect(res.html).toContain('src="email-marketing.png"');
  });

  it("skips text inside an existing anchor and inside headings", () => {
    const inAnchor = injectLink('<p><a href="https://y.com">email marketing</a></p>', "email marketing", "https://x.com/a");
    expect(inAnchor.applied).toBe(false);

    const inHeading = injectLink("<h2>Email marketing</h2>", "Email marketing", "https://x.com/a");
    expect(inHeading.applied).toBe(false);
  });

  it("refuses to add the same href twice", () => {
    const once = injectLink("<p>alpha and beta</p>", "alpha", "https://x.com/a");
    const twice = injectLink(once.html, "beta", "https://x.com/a");
    expect(twice.applied).toBe(false);
  });

  it("marks external links noopener but leaves internal links plain", () => {
    const ext = injectLink("<p>see the study here</p>", "the study", "https://nih.gov/x", { external: true });
    expect(ext.html).toContain('rel="noopener"');
    expect(ext.html).toContain('target="_blank"');

    const int = injectLink("<p>read our pricing page</p>", "pricing page", "https://mysite.com/pricing");
    expect(int.html).not.toContain("target=");
  });

  it("preserves the original casing of the matched text", () => {
    const res = injectLink("<p>Email Marketing works.</p>", "email marketing", "https://x.com/a");
    expect(res.html).toContain(">Email Marketing</a>");
  });
});

describe("readability and keyword counting", () => {
  it("scores plain prose higher than dense prose", () => {
    const easy = computeReadability("The cat sat on the mat. It was warm. The sun was out.");
    const hard = computeReadability(
      "Notwithstanding the aforementioned methodological considerations, the multidimensional operationalisation of institutional accountability necessitates substantive reconceptualisation."
    );
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(easy.avgSentenceWords).toBeLessThan(hard.avgSentenceWords);
  });

  it("counts whole phrases only, not substrings", () => {
    expect(countKeywordOccurrences("email marketing and emailmarketingtools", "email marketing")).toBe(1);
    expect(countKeywordOccurrences("Email  Marketing beats email marketing", "email marketing")).toBe(2);
  });
});

describe("buildFigure", () => {
  it("declares intrinsic size and never forces a 16:9 crop", () => {
    const html = buildFigure({ url: "https://cdn/x.jpg", alt: "A chart", width: 1080, height: 1920 });
    expect(html).toContain('width="1080" height="1920"');
    expect(html).not.toContain("aspect-");
    expect(html).toContain('alt="A chart"');
  });

  it("escapes alt text and returns nothing without a url", () => {
    expect(buildFigure({ url: "", alt: "x" })).toBe("");
    expect(buildFigure({ url: "https://cdn/x.jpg", alt: 'He said "hi"' })).toContain("&quot;hi&quot;");
  });
});

describe("injectHeadingIds", () => {
  it("gives duplicate headings unique ids", () => {
    const { html, toc } = injectHeadingIds("<h2>Setup</h2><h2>Setup</h2>");
    expect(toc.map((t) => t.id)).toEqual(["setup", "setup-2"]);
    expect(html).toContain('id="setup-2"');
  });
});

describe("assembleArticle", () => {
  const base = {
    title: "Email Marketing for Dentists",
    intro: "<p>Email marketing still pays for dental clinics, and the numbers back it.</p>",
    sections: [
      section("Why email marketing works", "<p>Patients open reminders. See the ADA data for proof.</p>"),
      section("Build the list", "<p>Start with your booking page and your intake form.</p>"),
    ],
    conclusion: "<p>Start with one campaign this week.</p>",
    keyTakeaways: ["Send fewer, better emails", "Segment by treatment"],
    faqItems: [{ question: "How often should I send?", answer: "Twice a month." }],
    images: [{ url: "https://cdn/hero.jpg", alt: "Dental clinic", afterSectionIndex: -1 }],
    youtube: null,
    internalLinks: [{ anchorText: "booking page", url: "https://mysite.com/book", label: "Book" }],
    externalLinks: [{ anchorText: "the ADA data", url: "https://ada.org/stats", label: "ADA" }],
    includeToc: true,
    includeTakeaways: true,
    includeFaq: true,
    includeSources: true,
    labels: { toc: "Table of contents", takeaways: "Key takeaways", faq: "FAQ", sources: "Sources" },
  };

  it("orders the document and replaces the TOC placeholder with real headings", () => {
    const out = assembleArticle(base);
    expect(out.html).not.toContain("POSTLOOM_TOC");
    expect(out.html).toContain('class="article-toc"');
    expect(out.html.indexOf("hero-cover-image")).toBeLessThan(out.html.indexOf("article-toc"));
    expect(out.toc.map((t) => t.text)).toContain("Why email marketing works");
    expect(out.toc.map((t) => t.text)).not.toContain("Table of contents");
  });

  it("reports only the links it could really place", () => {
    const out = assembleArticle({
      ...base,
      internalLinks: [
        { anchorText: "booking page", url: "https://mysite.com/book" },
        { anchorText: "phrase that is absent", url: "https://mysite.com/nope" },
      ],
    });
    expect(out.internalLinksApplied.map((l) => l.url)).toEqual(["https://mysite.com/book"]);
    expect(out.html).not.toContain("mysite.com/nope");
  });

  it("drops the TOC and takeaways when they are switched off", () => {
    const out = assembleArticle({ ...base, includeToc: false, includeTakeaways: false, includeFaq: false });
    expect(out.html).not.toContain("article-toc");
    expect(out.html).not.toContain("key-takeaways");
    expect(out.html).not.toContain("article-faq");
    expect(out.html).not.toContain("POSTLOOM_TOC");
  });
});

describe("measureArticle", () => {
  const richHtml = assembleArticle({
    title: "Email Marketing for Dentists",
    intro:
      "<p>Email marketing for dentists is the cheapest recall channel you own, and the booking page proves it.</p>",
    sections: [
      section(
        "Why email marketing for dentists works",
        "<p>" + "Patients open appointment reminders more than any other message. ".repeat(12) + "See the ADA data.</p><h3>The recall math</h3><p>" + "A single reminder recovers idle chair time. ".repeat(10) + "The CDC report agrees.</p>"
      ),
      section("Build the list", "<p>" + "Start at intake and keep consent explicit. ".repeat(14) + "</p>"),
      section("Write the emails", "<p>" + "Short subject lines win in dental inboxes. ".repeat(14) + "</p>"),
    ],
    conclusion: "<p>Send one recall campaign this week and measure the rebooking rate.</p>",
    keyTakeaways: ["Fewer, better emails", "Segment by treatment", "Measure rebooking"],
    faqItems: [
      { question: "How often should I send?", answer: "Twice a month." },
      { question: "Do reminders annoy patients?", answer: "Not when they are useful." },
      { question: "Which tool is best?", answer: "The one your front desk will actually use." },
    ],
    images: [
      { url: "https://cdn/hero.jpg", alt: "Dental clinic reception", afterSectionIndex: -1 },
      { url: "https://cdn/chart.jpg", alt: "Recall rate chart", afterSectionIndex: 1 },
    ],
    youtube: null,
    internalLinks: [{ anchorText: "booking page", url: "https://mysite.com/book" }],
    externalLinks: [
      { anchorText: "the ADA data", url: "https://ada.org/stats", label: "ADA" },
      { anchorText: "The CDC report", url: "https://cdc.gov/oral", label: "CDC" },
    ],
    includeToc: true,
    includeTakeaways: true,
    includeFaq: true,
    includeSources: true,
    labels: { toc: "Table of contents", takeaways: "Key takeaways", faq: "FAQ", sources: "Sources" },
  });

  const measureRich = () =>
    measureArticle({
      html: richHtml.html,
      title: "Email Marketing for Dentists: The 2026 Recall Playbook",
      metaTitle: "Email Marketing for Dentists: The Complete Recall Playbook",
      metaDescription:
        "Email marketing for dentists, done properly: the recall sequences, list-building steps and measurement that fill idle chair time without annoying patients.",
      keyword: "email marketing for dentists",
      schemaMarkup: buildSchemaMarkup({
        title: "Email Marketing for Dentists",
        metaDescription: "Recall playbook.",
        slug: "email-marketing-for-dentists",
        keyword: "email marketing for dentists",
        faqItems: [{ question: "How often?", answer: "Twice a month." }],
        wordCount: countHtmlWords(richHtml.html),
        siteUrl: "https://mysite.com",
      }),
      faqCount: 3,
      targetWordCount: countHtmlWords(richHtml.html),
      siteHost: "mysite.com",
    });

  it("splits internal and external links by the publishing host", () => {
    const { metrics } = measureRich();
    expect(metrics.internalLinksCount).toBe(1);
    expect(metrics.externalLinksCount).toBeGreaterThanOrEqual(2);
  });

  it("ignores in-page TOC anchors when counting links", () => {
    const { metrics } = measureRich();
    // The TOC alone contributes 4+ `#anchor` links; neither bucket may absorb them.
    expect(metrics.internalLinksCount).toBeLessThan(3);
  });

  it("counts images and alt coverage off the real markup", () => {
    const { metrics } = measureRich();
    expect(metrics.imageCount).toBe(2);
    expect(metrics.imagesWithAlt).toBe(2);
  });

  it("scores a complete article highly and a bare one badly", () => {
    const good = measureRich().metrics.seoScore;
    const bare = measureArticle({
      html: "<p>Three words only.</p>",
      title: "Untitled",
      metaTitle: "Untitled",
      metaDescription: "",
      keyword: "email marketing for dentists",
      schemaMarkup: "",
      faqCount: 0,
      targetWordCount: 2000,
    }).metrics.seoScore;

    expect(good).toBeGreaterThanOrEqual(80);
    expect(bare).toBeLessThan(25);
  });

  it("fails the word-count rule when the article misses the requested length", () => {
    const { checklist, metrics } = measureArticle({
      html: "<p>" + "word ".repeat(500) + "</p>",
      title: "x",
      metaTitle: "x",
      metaDescription: "x",
      keyword: "x",
      schemaMarkup: "",
      faqCount: 0,
      targetWordCount: 2000,
    });
    const row = checklist.find((c) => c.rule.startsWith("Word count"));
    expect(row?.passed).toBe(false);
    expect(row?.details).toContain("2000");
    expect(metrics.wordCount).toBe(500);
  });

  it("keeps the rubric weights at exactly 100", () => {
    const { checklist } = measureRich();
    expect(checklist.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
  });

  it("derives the score from the checklist, never from a claim", () => {
    const { checklist, metrics } = measureRich();
    const earned = checklist.reduce((sum, c) => (c.passed ? sum + c.weight : sum), 0);
    expect(metrics.seoScore).toBe(earned);
  });
});

describe("fixEscapedNewlines", () => {
  it("repairs the literal-backslash-n bug that used to reach the CMS", () => {
    expect(fixEscapedNewlines("<p>One</p>\\n\\n<p>Two</p>")).toBe("<p>One</p>\n\n<p>Two</p>");
  });

  it("runs inside sanitizeModelHtml so no caller can forget it", () => {
    expect(sanitizeModelHtml("<p>One</p>\\n<p>Two</p>")).toBe("<p>One</p>\n<p>Two</p>");
  });
});
