/**
 * STAGE 22 — CONTENT QUALITY SCORE
 *
 * Ours, and labelled as ours. Google publishes no such number, so nothing here is
 * a "Google score" and nothing here predicts a ranking.
 *
 * Five of the ten dimensions are measured and five are judged, and the split is
 * not arbitrary: a function can establish whether the headings descend cleanly and
 * how long the sentences run, and no function can establish whether the page
 * actually helps anybody. What a function can settle is never put to a model.
 *
 * The judged five are then capped by facts. A page whose claims were never checked
 * cannot score full marks for trust however well it reads, and a page whose
 * competitors could not be read cannot score highly for saying what they do not —
 * that would be an opinion about pages nobody looked at. Where the differentiation
 * stage did read them, its arithmetic is the ceiling: a number computed from those
 * pages section by section outranks an impression formed from their headings, and
 * the grader is never shown it, so the two signals stay independent.
 *
 * Word count is absent, deliberately and permanently. Length is a planning input,
 * not evidence of quality, and adding it here would be a bug rather than a tweak.
 */

import {
  SCORE_DIMENSIONS,
  computeQualityTotal,
  finalHtml,
  readArticleDraft,
  readArticleOutline,
  readArticleStrategy,
  readBusinessProfile,
  readFactCheckReport,
  readInternalLinkReport,
  readOriginalityReport,
  readQualityScore,
  readSearchIntent,
  readSeoReport,
  readSerpResearch,
  readTrustReport,
  type InternalLinkReport,
  type QualityScoreArtifact,
  type ScoredDimension,
} from "@/lib/article/artifacts";
import { computeReadability, stripHtml } from "@/lib/agents/workers/articleAssembly";
import {
  blocked,
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askJson } from "./router";

/**
 * One dimension, scored, with the one change that would raise it.
 *
 * `fix` is required on every dimension because `biggestGap` is chosen by
 * arithmetic — whichever dimension is losing the most weighted points — and then
 * has to be able to say what to do about it.
 */
interface Graded {
  key: string;
  score: number;
  note: string;
  fix: string;
}

/** A ceiling a fact imposes on a judgement, with the fact stated in the note. */
function capped(graded: Graded, ceiling: number, because: string): Graded {
  if (graded.score <= ceiling) return graded;
  return { ...graded, score: ceiling, note: `${graded.note} Capped at ${ceiling}: ${because}` };
}

// ---------------------------------------------------------------------------
// THE MEASURED FIVE
// ---------------------------------------------------------------------------

/**
 * SEO fundamentals — the seven structural checks, counted.
 *
 * Alt text is not among them: it is graded once, under media, because that is
 * where a missing alt attribute is actually a defect a reader feels. Counting it
 * twice would make a single missing attribute cost two dimensions.
 */
function gradeSeo(ctx: StageContext): Graded {
  const report = readArtifact(ctx, "seo", readSeoReport);
  if (!report) {
    return {
      key: "seo",
      score: 0,
      note: "The SEO fundamentals stage produced no report, so not one of the seven structural checks was run against this page.",
      fix: "Run this article again from the SEO fundamentals step so the title, meta description and heading structure are measured.",
    };
  }
  const checks: [string, boolean][] = [
    ["the title is a usable length", report.title.ok],
    ["the meta description is a usable length", report.metaDescription.ok],
    ["the body adds no second H1", report.h1Count === 0],
    ["the headings descend without skipping a level", report.headingOrderOk],
    ["the title contains the query", report.keywordInTitle],
    ["the opening paragraph contains the query", report.keywordInFirstParagraph],
    ["at least one heading contains the query", report.keywordInHeadings > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
  return {
    key: "seo",
    score: Math.round(((checks.length - failed.length) / checks.length) * 100),
    note:
      failed.length === 0
        ? `All seven structural checks pass: ${report.title.length}-character title, ${report.metaDescription.length}-character description, headings in order.`
        : `${checks.length - failed.length} of ${checks.length} structural checks pass. These do not: ${failed.join("; ")}.`,
    fix:
      failed.length === 0
        ? "Nothing structural is outstanding on this page."
        : `Fix the first of these in the editor: ${failed[0]}.`,
  };
}

/**
 * Readability — Flesch reading ease and average sentence length, both measured.
 *
 * The band that scores full marks is 55 and up, which is plain business English.
 * Above 85 is not rewarded: prose that simple usually got there by leaving out the
 * conditions, and this pipeline exists to put them in.
 */
function gradeReadability(text: string): Graded {
  const measured = computeReadability(text);
  if (measured.avgSentenceWords === 0) {
    return {
      key: "readability",
      score: 0,
      note: "There was not enough text on the page to measure.",
      fix: "The page needs prose before it can be read.",
    };
  }
  let score: number;
  if (measured.score > 85) score = 85;
  else if (measured.score >= 55) score = 100;
  else if (measured.score >= 45) score = 80;
  else if (measured.score >= 30) score = 55;
  else score = 30;

  let sentences = "";
  if (measured.avgSentenceWords > 32) {
    score -= 25;
    sentences = ` Sentences average ${measured.avgSentenceWords} words, which is long enough that a reader loses the thread inside one.`;
  } else if (measured.avgSentenceWords > 25) {
    score -= 15;
    sentences = ` Sentences average ${measured.avgSentenceWords} words, at the point where they start to need re-reading.`;
  }
  return {
    key: "readability",
    score: Math.max(0, Math.min(100, score)),
    note: `Reading ease ${measured.score} (${measured.label}), sentences averaging ${measured.avgSentenceWords} words.${sentences}`,
    fix:
      measured.avgSentenceWords > 25
        ? "Split the longest sentences in the densest section — one idea each."
        : measured.score < 55
          ? "Replace the longest words with the ones a customer would use out loud."
          : "Nothing about how this page reads is holding the score down.",
  };
}

/**
 * Internal linking — how many links to real pages ended up in the page.
 *
 * Worth 1.5 points, so a page with none loses noise rather than a grade. That is
 * on purpose: linking is real and small. The note carries the reason, which is
 * usually a fact about the setup rather than the writing — no site connected, or
 * no page on it that belonged here.
 */
function gradeLinking(ctx: StageContext, report: InternalLinkReport | null): Graded {
  const count = report?.internal.length ?? 0;
  const score = count >= 3 ? 100 : count === 2 ? 75 : count === 1 ? 50 : 0;
  const why = report?.note ? ` ${report.note}` : "";

  if (count === 0 && !ctx.brief.enableInternalLinks) {
    return {
      key: "linking",
      score: 0,
      note: "Internal linking was turned off for this article, so the page links to nothing on the site. The 1.5 points this costs are the honest size of that choice.",
      fix: "Turn internal links on for the next article, or add one by hand in the editor to a page this reader would need next.",
    };
  }
  return {
    key: "linking",
    score,
    note:
      count === 0
        ? `The page contains no internal links.${why}`
        : `${count} internal link${count === 1 ? "" : "s"} to pages read from the site, plus ${report?.external.length ?? 0} outbound source${(report?.external.length ?? 0) === 1 ? "" : "s"}.${why}`,
    fix:
      count === 0
        ? "Connect the site in the Plugins tab so the next run can read its real pages, or add a link by hand to the page this reader needs next."
        : count < 3
          ? "Add one more link to a page a reader of this section would want next."
          : "The linking on this page is doing its job.",
  };
}

/**
 * Media and UX — images that are actually in the page, and whether they say what
 * they show.
 *
 * Read from the HTML rather than from the media stage's report, for the same
 * reason the schema stage reads the FAQ back out of the page: what a stage
 * intended and what is in the document are different facts, and this one grades
 * the document.
 */
function gradeMedia(ctx: StageContext, html: string): Graded {
  const images = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((match) => match[0]);
  const withoutAlt = images.filter((tag) => !/\salt\s*=\s*["'][^"']+["']/i.test(tag)).length;
  const hasToc = /class="article-toc"/i.test(html);

  const base = images.length === 0 ? 0 : withoutAlt === 0 ? 80 : 45;
  const score = Math.min(100, base + (hasToc ? 20 : 0));

  const parts: string[] = [];
  parts.push(
    images.length === 0
      ? ctx.mode === "quick"
        ? "The page has no images. A quick run does not include the media stage, so nothing planned any — this is what the 1.5 points cost, and a deep run is what earns them."
        : ctx.brief.enableImages
          ? "The page has no images, though this article was set to include them."
          : "Images were turned off for this article, so the page has none."
      : `${images.length} image${images.length === 1 ? "" : "s"} in the page${
          withoutAlt > 0
            ? `, ${withoutAlt} without alt text — unreadable to a screen reader and unindexed`
            : ", all with alt text"
        }.`
  );
  parts.push(hasToc ? "A contents list is present." : "There is no contents list.");

  return {
    key: "media",
    score,
    note: parts.join(" "),
    fix:
      withoutAlt > 0
        ? "Write alt text for the images that have none — what the image shows, not the keyword."
        : images.length === 0
          ? ctx.mode === "quick"
            ? "Run this article in deep mode, or add one image in the editor with alt text that says what it shows."
            : "Add one image that shows something the prose describes, with alt text that says what it shows."
          : hasToc
            ? "Nothing about the page's media is holding the score down."
            : "Turn the contents list on so a reader can jump to the section they came for.",
  };
}

/**
 * Completeness — whether what the intent stage said the reader must know is on the
 * page, and whether every planned section was actually written.
 *
 * The coverage list came from checking the outline, not the finished page, and the
 * note says so. It is still the honest number available: a section that is in the
 * outline and in the document has been written to those points.
 *
 * `mustKnowChecked === false` means the check could not run. That is recorded as
 * unmeasured rather than scored as covered, which is the whole reason the outline
 * stage returns null instead of an empty array.
 */
function gradeCompleteness(ctx: StageContext): Graded {
  const outline = readArtifact(ctx, "outline", readArticleOutline);
  const draft = readArtifact(ctx, "write", readArticleDraft);
  const intent = readArtifact(ctx, "intent", readSearchIntent);
  const planned = outline?.sections.length ?? 0;
  const written = draft?.sectionCount ?? 0;
  const unfinished = draft?.unfinished.length ?? 0;
  const checked = ctx.state.mustKnowChecked === true;
  const uncovered = Array.isArray(ctx.state.mustKnowUncovered)
    ? (ctx.state.mustKnowUncovered as unknown[]).map((row) => String(row ?? "").trim()).filter(Boolean)
    : [];
  const mustKnow = intent?.mustKnow.length ?? 0;

  let score: number;
  let note: string;
  if (unfinished > 0) {
    score = planned > 0 ? Math.round((written / planned) * 60) : 0;
    note = `${written} of ${planned} planned sections are written and ${unfinished} ${unfinished === 1 ? "is" : "are"} missing, so the page is not finished.`;
  } else if (!checked || mustKnow === 0) {
    score = 70;
    note = `All ${planned} planned sections are written. What the reader must know was never checked against the outline${
      mustKnow === 0 ? " because the intent stage listed nothing" : " because that check could not run"
    }, so this is scored as unverified rather than complete.`;
  } else if (uncovered.length === 0) {
    score = 100;
    note = `All ${planned} sections are written and all ${mustKnow} things the reader must know were matched to a heading.`;
  } else {
    score = Math.max(0, Math.round(((mustKnow - uncovered.length) / mustKnow) * 100));
    note = `${mustKnow - uncovered.length} of ${mustKnow} things the reader must know were matched to a heading. Not covered: ${uncovered.join("; ")}.`;
  }
  return {
    key: "completeness",
    score,
    note,
    fix:
      unfinished > 0
        ? "Continue this run so the remaining sections are written."
        : uncovered.length > 0
          ? `Add a section, or a passage in an existing one, covering: ${uncovered[0]}.`
          : "The page covers what this reader came for.",
  };
}

// ---------------------------------------------------------------------------
// THE JUDGED FIVE
// ---------------------------------------------------------------------------

const JUDGED_KEYS = ["intent", "helpfulness", "differentiation", "trust", "relevance"];

const JUDGED_SYSTEM = `You grade a finished page on five things no measurement can settle. You are strict: 100 means you would show this page to another writer as the example to follow.

intent — does it answer the question the query asks, in the form the reader expects, without scrolling?
helpfulness — could a reader act on this without opening another tab? Specifics, steps, numbers, conditions, what to do when it goes wrong. Generic advice, correctly stated, is not helpful.
differentiation — does it say something the pages that already rank do not? You are given their headings. A page that covers the same ground in the same order scores low no matter how well it is written.
trust — is what it claims actually established? Named experience, sourced numbers, no invented proof. An unsupported statistic costs more than a missing one.
relevance — is it specific to this business, or would it read the same on any competitor's site?

For each one: a score out of 100, a note saying what you saw, and a fix — the single change that would raise that score most, in one sentence, naming what to change and where.

Rules:
- The note must cite the page. "The pricing section lists figures with no source" is a note. "Could be stronger" is not.
- Never reward length. A shorter page that answers the question scores higher than a longer one that circles it.
- Never mark a page down for something it was not asked to do.
- Do not soften. A 60 that says why is more use than an 85 that does not.

Return JSON only:
{"dimensions":[{"key":"intent","score":0,"note":"...","fix":"..."}]}`;

/** Guard for the judged call. Every dimension needs a note and a fix or it is not a finding. */
function readJudged(value: unknown): Graded[] | null {
  const raw = (value as Record<string, unknown> | null) || null;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.dimensions)) return null;
  const seen = new Set<string>();
  const out: Graded[] = [];
  for (const row of raw.dimensions) {
    const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const key = String(entry.key ?? "").trim();
    if (!JUDGED_KEYS.includes(key) || seen.has(key)) continue;
    const note = String(entry.note ?? "").trim();
    if (!note) continue;
    seen.add(key);
    out.push({
      key,
      score: Math.max(0, Math.min(100, Math.round(Number(entry.score) || 0))),
      note,
      fix: String(entry.fix ?? "").trim() || "No specific change was named for this dimension.",
    });
  }
  return out.length === JUDGED_KEYS.length ? out : null;
}

/**
 * Everything the grader is allowed to grade against.
 *
 * The competitor headings are here because differentiation is meaningless without
 * them, and the fact check is here because trust is meaningless without it. A
 * grader shown neither would be inventing both numbers.
 */
function judgedPrompt(ctx: StageContext, text: string): string {
  const intent = readArtifact(ctx, "intent", readSearchIntent);
  const strategy = readArtifact(ctx, "strategy", readArticleStrategy);
  const serp = readArtifact(ctx, "serp", readSerpResearch);
  const business = readArtifact(ctx, "business", readBusinessProfile);
  const facts = readArtifact(ctx, "factcheck", readFactCheckReport);
  const parts: string[] = [`THE QUERY: ${ctx.brief.keyword}`];

  if (intent) {
    parts.push(
      `WHO ARRIVES: ${intent.readerProblem}\nIntent: ${intent.kind}. Format expected: ${
        intent.expectedFormat || "not stated"
      }\nThey must leave knowing:\n- ${intent.mustKnow.join("\n- ")}`
    );
  }
  if (strategy) {
    parts.push(
      `WHAT THIS PAGE SET OUT TO DO:\nAngle: ${strategy.angle}\nPromise: ${strategy.promise}\nWhat it claimed to add:\n- ${strategy.adds.join("\n- ")}`
    );
  }
  parts.push(
    serp && serp.competitors.length > 0
      ? `THE PAGES THAT ALREADY RANK — judge differentiation against these headings:\n${serp.competitors
          .slice(0, 6)
          .map((row) => `${row.title}\n  ${row.headings.slice(0, 10).join(" | ") || "(no headings could be read)"}`)
          .join("\n")}`
      : `THE PAGES THAT ALREADY RANK: none could be read.${
          serp?.note ? ` ${serp.note}` : ""
        } Judge differentiation against the angle alone and say in your note that you could not compare it to what ranks.`
  );
  parts.push(
    business
      ? `THE BUSINESS: ${business.summary}${
          business.proofPoints.length ? `\nWhat it can demonstrate: ${business.proofPoints.join("; ")}` : ""
        }${business.unverified.length ? `\nUnproven, and not usable as proof: ${business.unverified.join("; ")}` : ""}`
      : "THE BUSINESS: no profile was built for this run, so judge relevance on whether the page could only have been written by this business."
  );
  if (facts) {
    const unsupported = facts.entries.filter((row) => row.verdict === "unsupported");
    parts.push(
      `THE FACT CHECK: ${facts.unsupported} unsupported, ${facts.uncertain} uncertain.${
        unsupported.length ? `\nUnsupported claims:\n- ${unsupported.map((row) => row.claim).join("\n- ")}` : ""
      }${
        facts.unprovenBusinessFacts.length
          ? `\nBusiness facts the page asserts that nothing proves:\n- ${facts.unprovenBusinessFacts.join("\n- ")}`
          : ""
      }`
    );
  } else {
    parts.push("THE FACT CHECK: none ran on this page. Nothing in it has been verified either way.");
  }
  parts.push(`THE PAGE:\n${text.slice(0, 18_000)}`);
  return parts.join("\n\n");
}

/**
 * How far above the measured distinctiveness the graded number may sit.
 *
 * Ours, and stated as ours. The differentiation stage read the ranking pages in
 * full and judged this draft section by section; the grader below sees their
 * headings. When both have an opinion the measurement wins, but not absolutely:
 * its arithmetic is section-level and coarse — a section that adds something real
 * still counts as half — so a page can be more distinctive than its sections make
 * it look. It cannot be twenty points more.
 */
const MEASURED_ALLOWANCE = 20;

/** Business claims nothing on file proves, from both stages that look for them. */
function borrowedClaims(
  facts: { unprovenBusinessFacts: string[] } | null,
  trust: { unsupportedExperience: string[] } | null
): string[] {
  const seen = new Set<string>();
  return [...(facts?.unprovenBusinessFacts ?? []), ...(trust?.unsupportedExperience ?? [])].filter(
    (row) => {
      const key = row.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }
  );
}

/**
 * The ceilings facts put on judgements.
 *
 * A grader reading well-written prose will call it trustworthy, because that is
 * what well-written prose looks like. Whether the claims in it were ever checked
 * is a separate fact, and it belongs to this function rather than to the grader's
 * impression of the writing.
 */
function applyCaps(ctx: StageContext, judged: Graded[]): Graded[] {
  const serp = readArtifact(ctx, "serp", readSerpResearch);
  const facts = readArtifact(ctx, "factcheck", readFactCheckReport);
  const business = readArtifact(ctx, "business", readBusinessProfile);
  const trust = readArtifact(ctx, "eeat", readTrustReport);
  const overlap = readArtifact(ctx, "originality", readOriginalityReport);
  const sawCompetitors = Boolean(serp && serp.competitors.length > 0);
  // Only a comparison that really read pages is a measurement. `comparedAgainst`
  // is on that artifact precisely so this line can tell the difference.
  const measured = overlap && overlap.comparedAgainst > 0 ? overlap : null;

  return judged.map((row) => {
    if (row.key === "trust") {
      if (!facts) {
        return capped(
          row,
          65,
          "no fact check ran on this page, so nothing it claims has been verified either way."
        );
      }
      if (facts.unsupported > 0) {
        return capped(
          row,
          Math.max(0, 100 - facts.unsupported * 20),
          `${facts.unsupported} claim${facts.unsupported === 1 ? "" : "s"} on the page ${
            facts.unsupported === 1 ? "is" : "are"
          } unsupported by the material it was written from.`
        );
      }
      const borrowed = borrowedClaims(facts, trust);
      if (borrowed.length > 0) {
        return capped(
          row,
          80,
          `the page asserts ${borrowed.length} business fact${
            borrowed.length === 1 ? "" : "s"
          } nothing on file proves.`
        );
      }
      return row;
    }
    if (row.key === "differentiation") {
      if (!sawCompetitors) {
        return capped(
          row,
          50,
          "the ranking pages could not be read, so there is nothing to say this page differs from."
        );
      }
      if (measured) {
        // The one place in this file where a measurement overrules the grader on
        // the grader's own dimension. It has to: the differentiation stage read
        // those pages and this one only saw their headings.
        const covered = measured.overlaps.length;
        return capped(
          row,
          measured.distinctiveness + MEASURED_ALLOWANCE,
          `the differentiation pass read ${measured.comparedAgainst} of the ranking pages in full and found ${
            measured.distinctiveness
          }% of this page's sections say something they do not${
            covered ? `, with ${covered} passage${covered === 1 ? "" : "s"} they already cover` : ""
          }. ${measured.caveat}`
        );
      }
      return row;
    }
    if (row.key === "relevance" && !business) {
      return capped(
        row,
        60,
        "no business profile was built for this run, so how specific the page is to this business could not be checked against anything."
      );
    }
    return row;
  });
}

/**
 * The one change worth making, chosen by arithmetic.
 *
 * Weighted loss, not lowest score: a 40 in internal linking is 0.9 points and a 70
 * in helpfulness is 6. Asking a model which gap is biggest would produce an
 * opinion where there is a subtraction.
 */
function biggestGapOf(graded: Graded[]): string {
  const weights = new Map(SCORE_DIMENSIONS.map((row) => [row.key, row.weight]));
  const labels = new Map(SCORE_DIMENSIONS.map((row) => [row.key, row.label]));
  let worst: { loss: number; row: Graded } | null = null;

  for (const row of graded) {
    const loss = ((100 - row.score) * (weights.get(row.key) ?? 0)) / 100;
    if (!worst || loss > worst.loss) worst = { loss, row };
  }
  if (!worst || worst.loss < 0.5) {
    return "Nothing on this page is costing more than half a point. What is left is noise, not work.";
  }
  return `${labels.get(worst.row.key) || worst.row.key} is costing ${worst.loss.toFixed(1)} of the 100 points, more than anything else. ${worst.row.fix}`;
}

export const runScoreStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const html = finalHtml(ctx.artifacts as Record<string, unknown>);
  if (!html.trim()) {
    return blocked(
      "There is no page to score — no stage has produced a draft yet. Run this article again from the writing step."
    );
  }
  const text = stripHtml(html).replace(/\s+/g, " ").trim();
  const linkReport = readArtifact(ctx, "links", readInternalLinkReport);

  const measured: Graded[] = [
    gradeCompleteness(ctx),
    gradeSeo(ctx),
    gradeReadability(text),
    gradeLinking(ctx, linkReport),
    gradeMedia(ctx, html),
  ];
  // A score built from half the dimensions would still render as a number in the
  // editor, and the missing five are the ones that matter most. Blocked instead.
  let judged: Graded[];
  try {
    judged = await askJson(
      "reasoning",
      "Quality score",
      { system: JUDGED_SYSTEM, prompt: judgedPrompt(ctx, text), meter: ctx.meter, signal: ctx.signal },
      readJudged
    );
  } catch (error) {
    if (ctx.signal?.aborted) throw Object.assign(new Error("The run was stopped."), { isCancelled: true });
    return blocked(
      `The five judged dimensions could not be graded, so there is no score rather than a partial one: ${
        (error as Error)?.message || "the grading call failed"
      }. The page itself is unaffected — run this step again.`
    );
  }

  const graded = [...measured, ...applyCaps(ctx, judged)];
  const dimensions: ScoredDimension[] = graded.map((row) => ({
    key: row.key,
    score: row.score,
    note: row.note,
  }));
  const pick = (key: string) => dimensions.find((row) => row.key === key)?.score ?? 0;

  const artifact: QualityScoreArtifact = {
    // Computed here from the weights, never taken from a model. A total the model
    // supplies is a number nobody can reproduce from the dimensions beside it.
    total: computeQualityTotal(dimensions),
    differentiation: pick("differentiation"),
    trust: pick("trust"),
    relevance: pick("relevance"),
    dimensions,
    biggestGap: biggestGapOf(graded),
  };
  const checked = readQualityScore(artifact) || artifact;

  return done(checked, {
    qualityTotal: checked.total,
    // Carried separately as well as inside the total, because averaging it away is
    // exactly how a page that repeats what already ranks scores well.
    differentiationScore: checked.differentiation,
    trustScore: checked.trust,
    relevanceScore: checked.relevance,
    biggestGap: checked.biggestGap,
    // The gate reads these three by name and refuses on any of them.
    qualityDimensions: checked.dimensions.map((row) => `${row.key}: ${row.score}`),
  });
};










