/**
 * THE DEEP PIPELINE'S GUARDS — every number on the screen is one we computed
 *
 * WHY THIS EXISTS: eleven of the twenty-three stages hand back JSON from a model,
 * and each of those payloads is an opportunity for the screen to state something
 * nobody established — a claim marked `allowed` on checks it failed, a trust score
 * the model liked the sound of, an opportunity total that folded in a search volume
 * this build has no source for, a "plagiarism" figure measured against three pages.
 *
 * The guards in `artifacts.ts` are where that is stopped, so this file tests the
 * properties rather than the plumbing:
 *
 *   - a status is recomputed from its evidence, never read from the payload,
 *   - a weighted total is computed here, and a factor nobody scored counts zero,
 *   - a count is derived from the list under it, so a header cannot lie,
 *   - a row that cannot be acted on is dropped rather than shown half-filled,
 *   - the originality caveat travels with the number, always.
 */
import { describe, it, expect } from "vitest";
import {
  computeOpportunityTotal,
  computeTrustScore,
  evidenceStatusFrom,
  finalHtml,
  readCannibalizationReport,
  readContentGapReport,
  readContentInventory,
  readEditPassReport,
  readEvidenceLedger,
  readEvidenceReport,
  readMediaPlan,
  readOriginalityReport,
  readPageTypeDecision,
  readResearchDossier,
  readTopicOpportunity,
  readTrustReport,
  ORIGINALITY_CAVEAT,
  OPPORTUNITY_FACTORS,
  TRUST_SIGNALS,
  type EvidenceChecks,
} from "@/lib/article/artifacts";

/** All five checks, then whichever ones a test wants to fail. */
const checks = (over: Partial<EvidenceChecks> = {}): EvidenceChecks => ({
  sourceExists: true,
  sourceReachable: true,
  sourceSupports: true,
  current: true,
  trustworthy: true,
  ...over,
});

describe("readContentInventory — a crawl reports what it read", () => {
  it("cannot have discovered fewer pages than it read", () => {
    const inventory = readContentInventory({
      site: "https://acme.example",
      discovered: 1,
      pages: [
        { url: "https://acme.example/a", title: "A", wordCount: 400, topic: "epoxy" },
        { url: "https://acme.example/b", title: "B", wordCount: 300, topic: "polish" },
        { url: "https://acme.example/c", title: "C", wordCount: 200, topic: "sealing" },
      ],
    });
    expect(inventory!.pages).toHaveLength(3);
    expect(inventory!.discovered).toBe(3);
  });

  it("drops a page that is not a real URL, and an unreadable entry with no reason", () => {
    const inventory = readContentInventory({
      site: "https://acme.example",
      pages: [
        { url: "https://acme.example/real", title: "Real", wordCount: 10, topic: "t" },
        { url: "/services", title: "Relative", wordCount: 10, topic: "t" },
        { url: "javascript:alert(1)", title: "Nope", wordCount: 10, topic: "t" },
      ],
      unreadable: [
        { url: "https://acme.example/403", reason: "403 Forbidden" },
        { url: "https://acme.example/timeout" },
      ],
    });
    expect(inventory!.pages.map((page) => page.url)).toEqual(["https://acme.example/real"]);
    expect(inventory!.unreadable).toEqual([
      { url: "https://acme.example/403", reason: "403 Forbidden" },
    ]);
  });

  it("still returns an inventory when nothing could be read, so the note can explain", () => {
    const inventory = readContentInventory({
      site: "",
      pages: [],
      note: "No website is connected, so nothing was crawled.",
    });
    expect(inventory).not.toBeNull();
    expect(inventory!.pages).toEqual([]);
    expect(inventory!.discovered).toBe(0);
    expect(inventory!.note).toContain("No website is connected");
  });
});

describe("readPageTypeDecision — advice nobody can act on is not advice", () => {
  it("refuses 'update the existing page' when no page is named", () => {
    expect(
      readPageTypeDecision({ choice: "update_existing", reason: "The service page already ranks." })
    ).toBeNull();
    // A relative path is not a page either: the panel has to be able to link it.
    expect(
      readPageTypeDecision({
        choice: "update_existing",
        reason: "The service page already ranks.",
        existingUrl: "/services/epoxy",
      })
    ).toBeNull();
  });

  it("keeps it when the page is named", () => {
    const decision = readPageTypeDecision({
      choice: "update_existing",
      reason: "The service page already ranks for this and answers it badly.",
      existingUrl: "https://acme.example/services/epoxy",
      requiredElements: ["A real price range", "The site-visit step"],
    });
    expect(decision!.choice).toBe("update_existing");
    expect(decision!.existingUrl).toBe("https://acme.example/services/epoxy");
    expect(decision!.requiredElements).toHaveLength(2);
  });

  it("refuses a format it does not know, and one with no reason", () => {
    expect(readPageTypeDecision({ choice: "listicle", reason: "It is a listicle." })).toBeNull();
    expect(readPageTypeDecision({ choice: "article", reason: "  " })).toBeNull();
  });
});

describe("readContentGapReport — the summary is counted from the table", () => {
  it("derives the band counts and files an unknown band under 'common'", () => {
    const report = readContentGapReport({
      pagesCompared: 8,
      // The payload states no counts at all; they are not the model's to state.
      counts: { common: 99, weak: 99, missing: 99, opportunity: 99 },
      topics: [
        { topic: "Cost per square foot", band: "common", note: "All eight give a range." },
        { topic: "Cure times", band: "weak", note: "Two mention it in passing." },
        { topic: "Substrate moisture testing", band: "missing", note: "Nobody covers it." },
        { topic: "What our own failures taught us", band: "opportunity", note: "First-hand." },
        { topic: "Something else", band: "trending", note: "An invented band." },
      ],
    });
    expect(report!.counts).toEqual({ common: 2, weak: 1, missing: 1, opportunity: 1 });
    expect(report!.pagesCompared).toBe(8);
  });

  it("drops a topic with no note, and returns null when none survive", () => {
    expect(
      readContentGapReport({ topics: [{ topic: "Cost", band: "common" }], pagesCompared: 5 })
    ).toBeNull();
    expect(readContentGapReport({ topics: [], pagesCompared: 5 })).toBeNull();
  });

  it("keeps only the ranking pages a band was really observed on", () => {
    const report = readContentGapReport({
      pagesCompared: 3,
      topics: [
        {
          topic: "Cure times",
          band: "weak",
          note: "Mentioned without numbers.",
          seenOn: ["https://a.example/x", "not-a-url", "https://b.example/y"],
        },
      ],
    });
    expect(report!.topics[0].seenOn).toEqual(["https://a.example/x", "https://b.example/y"]);
  });
});

describe("topic opportunity — scored on what this build can observe", () => {
  it("has no search-volume and no keyword-difficulty factor", () => {
    // This is the point of the shape, not a detail of it: there is no volume
    // source in this build, so a factor named for one could only be invented.
    expect(OPPORTUNITY_FACTORS.map((factor) => factor.key)).toEqual([
      "business_fit",
      "buyer_proximity",
      "first_hand",
      "room",
      "durability",
    ]);
    expect(OPPORTUNITY_FACTORS.reduce((sum, factor) => sum + factor.weight, 0)).toBe(100);
  });

  it("counts a factor nobody scored as zero rather than dropping it", () => {
    expect(
      computeOpportunityTotal([{ key: "business_fit", score: 100, note: "Core service." }])
    ).toBe(30);
    expect(
      computeOpportunityTotal(
        OPPORTUNITY_FACTORS.map((factor) => ({ key: factor.key, score: 100, note: "y" }))
      )
    ).toBe(100);
  });

  it("discards the model's own total and defaults an unstated verdict to 'later'", () => {
    const opportunity = readTopicOpportunity({
      total: 96,
      reason: "It is the service the business is paid for, but the page is thin.",
      factors: [
        { key: "business_fit", score: 100, note: "Core service." },
        { key: "buyer_proximity", score: 60, note: "Research stage, not quote stage." },
        { key: "search_volume", score: 100, note: "Invented factor." },
      ],
    });
    // 30 + 15 = 45; the two unscored factors and the invented one contribute nothing.
    expect(opportunity!.total).toBe(45);
    expect(opportunity!.factors.map((factor) => factor.key)).toEqual([
      "business_fit",
      "buyer_proximity",
    ]);
    expect(opportunity!.verdict).toBe("later");
  });

  it("refuses a score with no factors and one with no reason", () => {
    expect(readTopicOpportunity({ reason: "Worth writing.", factors: [] })).toBeNull();
    expect(
      readTopicOpportunity({ factors: [{ key: "room", score: 50, note: "Some room." }] })
    ).toBeNull();
  });
});

describe("readResearchDossier — a statement with no source is an assertion", () => {
  it("drops a finding with no source URL and one with no statement", () => {
    const dossier = readResearchDossier({
      queries: ["epoxy floor cure time astm"],
      findings: [
        {
          statement: "ASTM F1869 measures moisture vapour emission before coating.",
          sourceUrl: "https://www.astm.org/f1869",
          title: "ASTM F1869 standard",
          publisher: "ASTM",
          excerpt: "This test method covers the quantitative determination...",
          sourceType: "official",
          reachable: true,
        },
        { statement: "Epoxy lasts forever.", sourceUrl: "", publisher: "" },
        { statement: "", sourceUrl: "https://example.com/x", publisher: "Example" },
      ],
    });
    expect(dossier!.findings).toHaveLength(1);
    // The page's own title, taken from `title` when the model used that key.
    expect(dossier!.findings[0].sourceTitle).toBe("ASTM F1869 standard");
    expect(dossier!.findings[0].sourceType).toBe("official");
    expect(dossier!.queries).toEqual(["epoxy floor cure time astm"]);
  });

  it("derives the source list from the findings, de-duplicated", () => {
    const dossier = readResearchDossier({
      // Restated by the payload as something else entirely; ignored.
      sourceUrls: ["https://invented.example/never-fetched"],
      findings: [
        { statement: "A", sourceUrl: "https://one.example/p", excerpt: "a" },
        { statement: "B", sourceUrl: "https://one.example/p", excerpt: "bb" },
        { statement: "C", sourceUrl: "https://two.example/q", excerpt: "c" },
      ],
    });
    expect(dossier!.sourceUrls).toEqual(["https://one.example/p", "https://two.example/q"]);
  });

  it("files an unrecognised source type as unknown, and never assumes reachable", () => {
    const dossier = readResearchDossier({
      findings: [{ statement: "A", sourceUrl: "https://one.example/p", sourceType: "blogpost" }],
    });
    expect(dossier!.findings[0].sourceType).toBe("unknown");
    expect(dossier!.findings[0].reachable).toBe(false);
  });
});

describe("the evidence gate — all five checks, or blocked", () => {
  it("blocks on any single failure", () => {
    expect(evidenceStatusFrom(checks())).toBe("allowed");
    for (const key of [
      "sourceExists",
      "sourceReachable",
      "sourceSupports",
      "current",
      "trustworthy",
    ] as const) {
      expect(evidenceStatusFrom(checks({ [key]: false }))).toBe("blocked");
    }
  });

  it("ignores a status the payload states and recomputes it from the checks", () => {
    const report = readEvidenceReport({
      decisions: [
        {
          claim: "Epoxy floors last 40 years.",
          kind: "statistic",
          status: "allowed",
          reason: "The cited page says twenty.",
          sourceUrl: "https://vendor.example/epoxy",
          checks: { ...checks(), sourceSupports: false },
        },
        {
          claim: "ASTM F1869 measures moisture vapour emission.",
          kind: "fact",
          status: "blocked",
          reason: "The standard states it.",
          sourceUrl: "https://www.astm.org/f1869",
          checks: checks(),
        },
      ],
    });
    expect(report!.decisions[0].status).toBe("blocked");
    expect(report!.decisions[1].status).toBe("allowed");
    expect(report!.allowed).toBe(1);
    expect(report!.blocked).toBe(1);
    // The writer receives this list and nothing else.
    expect(report!.allowedClaims).toEqual(["ASTM F1869 measures moisture vapour emission."]);
  });

  it("reads the checks off a flat payload, but still needs every one to be true", () => {
    const flat = readEvidenceReport({
      decisions: [
        {
          claim: "Cures to light traffic in 24 hours.",
          reason: "The data sheet says so.",
          ...checks(),
        },
        { claim: "It is the strongest floor made.", reason: "Nothing supports it." },
      ],
    });
    expect(flat!.decisions[0].status).toBe("allowed");
    expect(flat!.decisions[0].kind).toBe("fact");
    expect(flat!.decisions[1].status).toBe("blocked");
    expect(flat!.allowedClaims).toEqual(["Cures to light traffic in 24 hours."]);
  });

  it("carries what the strategy promised to prove and nothing could", () => {
    const report = readEvidenceReport({
      decisions: [{ claim: "A", reason: "r", ...checks() }],
      unproven: ["The 4,000-floor figure has no source in the business profile."],
    });
    expect(report!.unproven).toEqual([
      "The 4,000-floor figure has no source in the business profile.",
    ]);
  });
});

describe("readOriginalityReport — a distinctiveness number, not a plagiarism claim", () => {
  it("always carries the caveat, and says what the number is not", () => {
    const report = readOriginalityReport({
      distinctiveness: 72,
      comparedAgainst: 6,
      biggestOverlap: "The cost section repeats the same three price bands.",
    });
    expect(report!.caveat).toBe(ORIGINALITY_CAVEAT);
    expect(report!.caveat).toContain("not a plagiarism check");
    expect(report!.caveat).toContain("not a detector score");
  });

  it("clamps the figure and keeps the pages it was measured against", () => {
    expect(readOriginalityReport({ distinctiveness: 140, comparedAgainst: 6 })!.distinctiveness).toBe(100);
    expect(readOriginalityReport({ distinctiveness: -20, comparedAgainst: 6 })!.distinctiveness).toBe(0);
    // Zero pages compared is not a score, and the field says so on its own.
    expect(readOriginalityReport({ distinctiveness: 90 })!.comparedAgainst).toBe(0);
  });

  it("keeps only overlaps that name the page already saying it", () => {
    const report = readOriginalityReport({
      distinctiveness: 60,
      comparedAgainst: 4,
      overlaps: [
        {
          passage: "Expect $4 to $9 a square foot.",
          url: "https://rival.example/costs",
          theirs: "Expect $4-$9 per square foot installed.",
          kind: "wording",
        },
        { passage: "Something unattributed.", url: "", theirs: "x", kind: "wording" },
        { passage: "Unknown kind falls back.", url: "https://rival.example/x", theirs: "y", kind: "vibes" },
      ],
    });
    expect(report!.overlaps).toHaveLength(2);
    expect(report!.overlaps[0].kind).toBe("wording");
    expect(report!.overlaps[1].kind).toBe("point");
  });
});

describe("trust signals — the weighted sum of what is present", () => {
  it("weights sum to 100, so a full page scores 100 and an empty one 0", () => {
    expect(TRUST_SIGNALS.reduce((sum, signal) => sum + signal.weight, 0)).toBe(100);
    const all = TRUST_SIGNALS.map((signal) => ({ key: signal.key, present: true, note: "found" }));
    expect(computeTrustScore(all)).toBe(100);
    expect(computeTrustScore(all.map((signal) => ({ ...signal, present: false })))).toBe(0);
  });

  it("discards the model's score and computes it from the signals present", () => {
    const report = readTrustReport({
      score: 95,
      signals: [
        { key: "experience", present: true, note: "Describes a failed pour and the fix.", location: "How long it lasts" },
        { key: "sourcing", present: true, note: "The ASTM number is cited." },
        { key: "expertise", present: false, note: "No named author and no qualification." },
        { key: "vibes", present: true, note: "Not a signal this build has." },
      ],
      unsupportedExperience: ["We have installed 4,000 floors"],
      missing: ["Name the author and their trade qualification."],
    });
    // experience 25 + sourcing 20 = 45. Absent and invented signals add nothing.
    expect(report!.score).toBe(45);
    expect(report!.signals.map((signal) => signal.key)).toEqual([
      "experience",
      "sourcing",
      "expertise",
    ]);
    expect(report!.signals[0].location).toBe("How long it lasts");
    // The list the publish gate blocks on.
    expect(report!.unsupportedExperience).toEqual(["We have installed 4,000 floors"]);
  });

  it("refuses a report with no signal it recognises, and drops one with no note", () => {
    expect(readTrustReport({ score: 80, signals: [{ key: "vibes", present: true, note: "x" }] })).toBeNull();
    expect(readTrustReport({ signals: [{ key: "recency", present: true }] })).toBeNull();
  });
});

describe("readCannibalizationReport — the worst overlap is read off the list", () => {
  it("sorts the pages and takes the highest figure from the first one", () => {
    const report = readCannibalizationReport({
      reason: "One existing page answers most of this query already.",
      highestOverlap: 5,
      compared: 2,
      pages: [
        { url: "https://acme.example/blog/epoxy-basics", title: "Basics", overlap: 30, advice: "internal_link", reason: "Adjacent." },
        { url: "https://acme.example/services/epoxy", title: "Service", overlap: 80, advice: "update_instead", reason: "Same query." },
        { url: "https://acme.example/blog/costs", title: "Costs", overlap: 55, advice: "differentiate", reason: "Cost overlap." },
      ],
    });
    expect(report!.pages.map((page) => page.overlap)).toEqual([80, 55, 30]);
    expect(report!.highestOverlap).toBe(80);
    // Three pages were compared, whatever the payload said.
    expect(report!.compared).toBe(3);
  });

  it("defaults an unstated verdict to publish and refuses one with no reason", () => {
    const report = readCannibalizationReport({ reason: "Nothing on the site covers it." });
    expect(report!.verdict).toBe("publish");
    expect(report!.pages).toEqual([]);
    expect(report!.highestOverlap).toBe(0);
    expect(readCannibalizationReport({ pages: [], compared: 4 })).toBeNull();
  });

  it("drops an overlapping page that names no reason", () => {
    const report = readCannibalizationReport({
      reason: "One page overlaps.",
      pages: [
        { url: "https://acme.example/a", title: "A", overlap: 70, advice: "update_instead", reason: "Same intent." },
        { url: "https://acme.example/b", title: "B", overlap: 90 },
      ],
    });
    expect(report!.pages).toHaveLength(1);
    expect(report!.highestOverlap).toBe(70);
  });
});

describe("readMediaPlan — an image with no alt text is not planned, only wanted", () => {
  it("drops an image with no alt text and one with no stated purpose", () => {
    const plan = readMediaPlan({
      images: [
        { role: "hero", heading: "", purpose: "Show a finished warehouse floor.", prompt: "p", alt: "A poured epoxy floor in a lit warehouse." },
        { role: "section", heading: "What it costs", purpose: "Show the price bands.", prompt: "p", alt: "" },
        { role: "section", heading: "How long it lasts", purpose: "", prompt: "p", alt: "A worn floor edge." },
        { role: "banner", heading: "Anything", purpose: "Fill space.", prompt: "p", alt: "A handshake." },
      ],
      noImage: ["The FAQ needs no picture."],
    });
    expect(plan!.images).toHaveLength(2);
    expect(plan!.images[0].role).toBe("hero");
    // An unrecognised role is a section, not a new kind of slot.
    expect(plan!.images[1].role).toBe("section");
    expect(plan!.noImage).toEqual(["The FAQ needs no picture."]);
  });

  it("carries a video only when a purpose was stated for it", () => {
    expect(readMediaPlan({ images: [], video: { searchTerms: ["epoxy pour"] } })!.video).toBeUndefined();
    const withVideo = readMediaPlan({
      images: [],
      video: { purpose: "Show the pour, which text cannot.", searchTerms: ["epoxy pour"] },
    });
    expect(withVideo!.video).toEqual({
      purpose: "Show the pour, which text cannot.",
      searchTerms: ["epoxy pour"],
    });
  });
});

describe("the edit pass is the last word on the body", () => {
  it("prefers the editor's HTML, then the links stage's, then the writer's", () => {
    const write = { title: "T", html: "<p>writer</p>", excerpt: "e", wordCount: 1, sectionCount: 0 };
    expect(finalHtml({ write })).toBe("<p>writer</p>");
    expect(finalHtml({ write, links: { html: "<p>linked</p>" } })).toBe("<p>linked</p>");
    expect(
      finalHtml({ write, links: { html: "<p>linked</p>" }, editor: { html: "<p>edited</p>" } })
    ).toBe("<p>edited</p>");
    // An edit pass that changed nothing does not blank the page.
    expect(
      finalHtml({ write, links: { html: "<p>linked</p>" }, editor: { changes: [], html: "  " } })
    ).toBe("<p>linked</p>");
  });

  it("keeps the changes it made and the problems it deliberately left", () => {
    const report = readEditPassReport({
      html: "<p>tighter</p>",
      wordCountBefore: 1420,
      wordCountAfter: 1180,
      changes: [
        { kind: "cut", location: "What it costs", note: "Removed the second price table." },
        { kind: "waffle", location: "Intro", note: "Unknown kind falls back to clarify." },
        { kind: "cut", location: "Intro" },
      ],
      leftAlone: ["The warranty point repeats, but cutting it loses the caveat."],
    });
    expect(report!.changes).toHaveLength(2);
    expect(report!.changes[1].kind).toBe("clarify");
    expect(report!.wordCountBefore).toBe(1420);
    expect(report!.wordCountAfter).toBe(1180);
    expect(report!.leftAlone).toHaveLength(1);
  });
});

describe("readEvidenceLedger — the panel recomputes what a row claims", () => {
  it("re-derives each claim's status, so an older row cannot show as allowed", () => {
    const ledger = readEvidenceLedger({
      sources: [
        {
          id: "src-1",
          url: "https://www.astm.org/f1869",
          title: "ASTM F1869",
          publisher: "ASTM",
          publishedAt: "2023-04-01T00:00:00.000Z",
          fetchedAt: "2026-09-01T10:00:00.000Z",
          excerpt: "This test method covers...",
          sourceType: "official",
          reachable: true,
        },
        { id: "src-2", url: "not-a-url", title: "Dropped", sourceType: "official", reachable: true },
      ],
      claims: [
        {
          id: "c-1",
          claim: "ASTM F1869 measures moisture vapour emission.",
          kind: "fact",
          status: "allowed",
          sourceExists: true,
          sourceReachable: true,
          sourceSupports: true,
          current: true,
          trustworthy: true,
          usedIn: "How long it lasts",
          sourceId: "src-1",
        },
        {
          // Written "allowed" by an older build on four checks out of five.
          id: "c-2",
          claim: "Epoxy floors last 40 years.",
          kind: "statistic",
          status: "allowed",
          sourceExists: true,
          sourceReachable: true,
          sourceSupports: false,
          current: true,
          trustworthy: true,
          reason: "The cited page says twenty.",
        },
      ],
    });
    expect(ledger!.sources.map((source) => source.id)).toEqual(["src-1"]);
    expect(ledger!.sources[0].publishedAt).toBe("2023-04-01T00:00:00.000Z");
    expect(ledger!.claims[0].status).toBe("allowed");
    expect(ledger!.claims[0].usedIn).toBe("How long it lasts");
    expect(ledger!.claims[1].status).toBe("blocked");
    // Counted from the claims, so the header cannot disagree with the table.
    expect(ledger!.allowed).toBe(1);
    expect(ledger!.blocked).toBe(1);
  });

  it("reads an empty ledger as empty rather than as nothing", () => {
    const ledger = readEvidenceLedger({ sources: [], claims: [] });
    expect(ledger).toEqual({ sources: [], claims: [], allowed: 0, blocked: 0 });
    expect(readEvidenceLedger(null)).toBeNull();
  });

  it("drops a dateline that is not a date, keeping the rest of the row", () => {
    const ledger = readEvidenceLedger({
      sources: [
        {
          id: "src-1",
          url: "https://vendor.example/sheet",
          title: "Data sheet",
          publishedAt: "sometime last spring",
          sourceType: "vendor",
          reachable: false,
          fetchError: "404 Not Found",
        },
      ],
      claims: [],
    });
    expect(ledger!.sources[0].publishedAt).toBeUndefined();
    expect(ledger!.sources[0].reachable).toBe(false);
    expect(ledger!.sources[0].fetchError).toBe("404 Not Found");
  });
});
