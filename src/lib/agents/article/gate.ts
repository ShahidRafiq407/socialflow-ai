/**
 * STAGE 23 — PUBLISH CHECKS
 *
 * Twenty checks, and every failure says which check, on what, and what would clear
 * it. This stage exists because the previous build had one message for everything
 * that went wrong with a page — "SEO failed" — which told the user nothing they
 * could act on and hid the difference between a title two characters too long and
 * an invented statistic.
 *
 * No model call. A gate that asks a model whether a page is publishable is not a
 * gate; every check here reads the page, the artifacts, or the run's own state.
 *
 * Three outcomes per check, not two. `skipped` is for a check that could not be
 * performed — a fact check that never ran cannot pass and has not failed — and a
 * skipped check is never counted as a pass. That distinction is the reason the
 * report is trustworthy: a quick run says plainly which of the twenty it could not
 * carry out rather than reporting nineteen greens and a silence.
 */

import {
  finalHtml,
  readArticleDraft,
  readArticleOutline,
  readFactCheckReport,
  readInternalLinkReport,
  readPublishGateReport,
  readQualityScore,
  readSchemaArtifact,
  readSearchIntent,
  readSeoReport,
  readTrustReport,
  type GateCheck,
  type PublishGateReport,
} from "@/lib/article/artifacts";
import { countKeywordOccurrences, stripHtml } from "@/lib/agents/workers/articleAssembly";
import {
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";

/**
 * The three score floors, ours and stated as ours.
 *
 * They are not thresholds Google publishes, because there are none. They are the
 * line below which we will not put a page on a customer's domain under their name:
 * a total in the fifties is a draft, a differentiation score below 45 means the
 * page mostly repeats what already ranks, and trust below 60 means the page asserts
 * things nothing behind it establishes.
 *
 * Each one blocks with its own sentence, so a user who disagrees can see exactly
 * which number stopped them and fix that rather than guess at the total.
 */
const QUALITY_FLOOR = 60;
const DIFFERENTIATION_FLOOR = 45;
const TRUST_FLOOR = 60;

const TITLE_MAX = 65;
const DESC_MAX = 165;

/** Text a reader must never see, and the plain-English name for each. */
const PLACEHOLDERS: [RegExp, string][] = [
  [/lorem ipsum/i, "the words “lorem ipsum”"],
  [/\bTODO\b/, "a TODO note"],
  [/\bTBD\b/, "“TBD”"],
  [/\[insert[^\]]*\]/i, "an [insert …] placeholder"],
  [/\bXX+\b/, "“XX” standing in for a number"],
  [/\bplaceholder\b/i, "the word “placeholder”"],
  [/your (?:company|business|brand) name/i, "“your company name” left unfilled"],
];

/** Raw model output that should have been converted before it reached the page. */
const RAW_OUTPUT: [RegExp, string][] = [
  [/```/, "a markdown code fence"],
  [/^#{1,6}\s/m, "a markdown heading that was never converted to HTML"],
  [/\*\*[^*\n]{2,}\*\*/, "markdown bold that was never converted"],
  [/\bas an AI (?:language )?model\b/i, "the phrase “as an AI language model”"],
  [/\bI (?:cannot|can't|am unable to) (?:provide|generate|create)\b/i, "a model refusal left in the prose"],
  [/\bHere (?:is|are) (?:the|your) (?:article|section|rewritten)\b/i, "a model preamble left in the prose"],
];

function pass(key: string, label: string): GateCheck {
  return { key, label, passed: true };
}

function fail(key: string, label: string, blocker: string): GateCheck {
  return { key, label, passed: false, blocker };
}

/** A check that could not be performed. Never counted as a pass. */
function skip(key: string, label: string, why: string): GateCheck {
  return { key, label, passed: false, skipped: true, blocker: why };
}

/**
 * Every href in the page, in order. Fragments and mail links are not pages.
 *
 * `&amp;` is decoded back to `&` because the assembly helpers escape the URL when
 * they write the anchor. Comparing an escaped href against the report's raw URL
 * would fail every link with a query string, which is most of them.
 */
function anchorsIn(html: string): string[] {
  return Array.from(html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi))
    .map((match) => match[1].trim().replace(/&amp;/gi, "&"))
    .filter((href) => href && !href.startsWith("#") && !href.startsWith("mailto:"));
}

/** One spelling per URL, so a trailing slash is not treated as a different page. */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.hostname.replace(/^www\./i, "").toLowerCase()}${path}${parsed.search}`.toLowerCase();
  } catch {
    return url.replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Headings with nothing under them.
 *
 * A heading followed immediately by another heading is a section the writer never
 * filled, and it reads to a visitor as a broken page rather than a short one.
 */
function emptySections(html: string): string[] {
  const out: string[] = [];
  const headings = Array.from(html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi));
  for (let index = 0; index < headings.length; index += 1) {
    const current = headings[index];
    const start = (current.index ?? 0) + current[0].length;
    const next = headings[index + 1];
    const between = html.slice(start, next ? next.index ?? html.length : html.length);
    if (stripHtml(between).trim().length < 20) {
      out.push(stripHtml(current[2]).replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

/** The house's forbidden words that are actually in the page, as whole words. */
function forbiddenIn(text: string, words: string[]): string[] {
  const found: string[] = [];
  for (const word of words) {
    const clean = word.trim();
    if (clean.length < 2) continue;
    const pattern = new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(text)) found.push(clean);
  }
  return found;
}

/** The first of a pattern list that matches, with its plain-English name. */
function firstMatch(haystack: string, patterns: [RegExp, string][]): string | null {
  for (const [pattern, name] of patterns) {
    if (pattern.test(haystack)) return name;
  }
  return null;
}

export const runGateStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const html = finalHtml(ctx.artifacts as Record<string, unknown>);
  const text = stripHtml(html).replace(/\s+/g, " ").trim();
  const draft = readArtifact(ctx, "write", readArticleDraft);
  const outline = readArtifact(ctx, "outline", readArticleOutline);
  const seo = readArtifact(ctx, "seo", readSeoReport);
  const facts = readArtifact(ctx, "factcheck", readFactCheckReport);
  const links = readArtifact(ctx, "links", readInternalLinkReport);
  const schema = readArtifact(ctx, "schema", readSchemaArtifact);
  const score = readArtifact(ctx, "score", readQualityScore);
  const intent = readArtifact(ctx, "intent", readSearchIntent);
  const trust = readArtifact(ctx, "eeat", readTrustReport);
  const checks: GateCheck[] = [];

  // ── 1. There is a page ────────────────────────────────────────────────────
  // Everything after this reads the HTML, so a missing page is reported once
  // rather than as nineteen separate failures.
  if (!html.trim()) {
    const report: PublishGateReport = {
      passed: false,
      checks: [
        fail(
          "draft_exists",
          "The page exists",
          "There is no draft to publish — no stage has produced a body. Run this article again from the writing step."
        ),
      ],
      blockers: [
        "There is no draft to publish — no stage has produced a body. Run this article again from the writing step.",
      ],
    };
    return done(report, { gatePassed: false, gateBlockers: report.blockers, gateChecksRun: 1 });
  }
  checks.push(pass("draft_exists", "The page exists"));

  // ── 2. Every planned section was written ──────────────────────────────────
  const unfinished = draft?.unfinished ?? [];
  checks.push(
    unfinished.length === 0
      ? pass("sections_complete", "Every section is written")
      : fail(
          "sections_complete",
          "Every section is written",
          `${unfinished.length} section${unfinished.length === 1 ? "" : "s"} of this page ${
            unfinished.length === 1 ? "was" : "were"
          } never written: ${unfinished.join(", ")}. Continue this run to write ${
            unfinished.length === 1 ? "it" : "them"
          } — the finished sections are kept.`
        )
  );

  // ── 3. Title ──────────────────────────────────────────────────────────────
  // The gate's bar is lower than the SEO stage's: that stage flags a title search
  // results will trim, and this one refuses a title that is missing or unusable.
  const title = (draft?.title || outline?.title || "").trim();
  checks.push(
    !title
      ? fail("title", "The page has a title", "The page has no title. Add one in the editor before publishing.")
      : title.length > TITLE_MAX
        ? fail(
            "title",
            "The page has a title",
            `The title is ${title.length} characters, past the ${TITLE_MAX} where it stops being a title and becomes a sentence. Shorten it in the editor.`
          )
        : pass("title", "The page has a title")
  );

  // ── 4. Meta description ───────────────────────────────────────────────────
  const description = (seo?.metaDescription.value || "").trim();
  checks.push(
    !description
      ? fail(
          "meta_description",
          "The page has a meta description",
          "There is no meta description, so search engines and social cards will assemble one from whatever the page opens with. Write one in the editor."
        )
      : description.length > DESC_MAX
        ? fail(
            "meta_description",
            "The page has a meta description",
            `The meta description is ${description.length} characters and will be cut off mid-sentence. Trim it to about 155.`
          )
        : pass("meta_description", "The page has a meta description")
  );

  // ── 5. One H1, and it is the title ────────────────────────────────────────
  const h1Count = seo?.h1Count ?? (html.match(/<h1\b/gi) || []).length;
  checks.push(
    h1Count === 0
      ? pass("single_h1", "The body adds no second H1")
      : fail(
          "single_h1",
          "The body adds no second H1",
          `The body contains ${h1Count} H1 heading${h1Count === 1 ? "" : "s"}. Every CMS this publishes to renders the page title as the H1, so ${
            h1Count === 1 ? "this one duplicates it" : "these duplicate it"
          }. Change ${h1Count === 1 ? "it" : "them"} to H2 in the editor.`
        )
  );

  // ── 6. Headings descend a level at a time ─────────────────────────────────
  const headingOrderOk = seo?.headingOrderOk ?? true;
  checks.push(
    headingOrderOk
      ? pass("heading_order", "The headings descend in order")
      : fail(
          "heading_order",
          "The headings descend in order",
          "The headings skip a level — an H2 is followed by an H4 — which announces a level with no parent to a screen reader and breaks the page's outline. Fix the level in the editor."
        )
  );

  // ── 7. No heading with nothing under it ───────────────────────────────────
  const empty = emptySections(html);
  checks.push(
    empty.length === 0
      ? pass("no_empty_sections", "No heading is left empty")
      : fail(
          "no_empty_sections",
          "No heading is left empty",
          `${empty.length} heading${empty.length === 1 ? " has" : "s have"} nothing underneath: ${empty
            .slice(0, 4)
            .map((heading) => `“${heading}”`)
            .join(", ")}. Write the section or remove the heading.`
        )
  );

  // ── 8. The page is about what was asked for ───────────────────────────────
  // A drifted article is not a small problem: it is a page published under a
  // business's name that answers a question nobody asked it.
  const keyword = ctx.brief.keyword.trim();
  const inBody = keyword ? countKeywordOccurrences(text, keyword) : 0;
  const inTitle = Boolean(keyword) && title.toLowerCase().includes(keyword.toLowerCase());
  checks.push(
    !keyword
      ? skip("keyword_present", "The page is about the query", "This run has no query recorded, so there is nothing to check the page against.")
      : inBody > 0 || inTitle
        ? pass("keyword_present", "The page is about the query")
        : fail(
            "keyword_present",
            "The page is about the query",
            `Neither the title nor the body uses the words “${keyword}” once. Either the page drifted from what it was commissioned to answer, or the query needs to change to match what was actually written.`
          )
  );

  // ── 9. What the reader must know is covered ───────────────────────────────
  const uncovered = Array.isArray(ctx.state.mustKnowUncovered)
    ? (ctx.state.mustKnowUncovered as unknown[]).map((row) => String(row ?? "").trim()).filter(Boolean)
    : [];
  checks.push(
    ctx.state.mustKnowChecked !== true || !intent
      ? skip(
          "must_know_covered",
          "The reader gets what they came for",
          "The outline was never checked against what this reader must know, so this check could not run. It is not a pass."
        )
      : uncovered.length === 0
        ? pass("must_know_covered", "The reader gets what they came for")
        : fail(
            "must_know_covered",
            "The reader gets what they came for",
            `${uncovered.length} of the ${intent.mustKnow.length} things this reader must know ${
              uncovered.length === 1 ? "is" : "are"
            } not covered by any section: ${uncovered.join("; ")}. Add ${
              uncovered.length === 1 ? "it" : "them"
            } before publishing.`
          )
  );

  // ── 10. Nothing the page claims is unsupported ─────────────────────────────
  // The one check the whole evidence half of this pipeline exists to make pass.
  checks.push(
    !facts
      ? skip(
          "no_unsupported_claims",
          "Nothing on the page is unsupported",
          "No fact check ran on this page, so nothing it claims has been verified either way. This is not a pass."
        )
      : facts.unsupported === 0
        ? pass("no_unsupported_claims", "Nothing on the page is unsupported")
        : fail(
            "no_unsupported_claims",
            "Nothing on the page is unsupported",
            `${facts.unsupported} claim${facts.unsupported === 1 ? "" : "s"} on this page ${
              facts.unsupported === 1 ? "is" : "are"
            } contradicted by the material it was written from, or ${
              facts.unsupported === 1 ? "appears" : "appear"
            } nowhere in it: ${facts.entries
              .filter((row) => row.verdict === "unsupported")
              .slice(0, 3)
              .map((row) => `“${row.claim}”`)
              .join("; ")}. Remove or source ${facts.unsupported === 1 ? "it" : "each of them"} in the editor.`
          )
  );

  // ── 11. No business fact nobody can prove ─────────────────────────────────
  // Two stages look for this, and the check reads both. The fact check tests what
  // the page states against the material it was written from; the trust pass looks
  // for borrowed authority in particular — years trading, job counts, client
  // names, awards. A claim only one of them caught is still a claim this business
  // cannot make, so neither list is allowed to be the one nobody reads.
  const seenClaim = new Set<string>();
  const unproven = [
    ...(facts?.unprovenBusinessFacts ?? []),
    ...(trust?.unsupportedExperience ?? []),
  ].filter((row) => {
    const key = row.trim().toLowerCase();
    if (!key || seenClaim.has(key)) return false;
    seenClaim.add(key);
    return true;
  });
  checks.push(
    !facts && !trust
      ? skip(
          "no_unproven_business_facts",
          "Every business claim is one the business can make",
          "Neither the fact check nor the trust pass ran, so the business claims in this page were never tested against the profile."
        )
      : unproven.length === 0
        ? pass("no_unproven_business_facts", "Every business claim is one the business can make")
        : fail(
            "no_unproven_business_facts",
            "Every business claim is one the business can make",
            `The page asserts ${unproven.length} thing${unproven.length === 1 ? "" : "s"} about the business that nothing on file proves: ${unproven
              .slice(0, 3)
              .map((row) => `“${row}”`)
              .join("; ")}. Either confirm ${
              unproven.length === 1 ? "it" : "them"
            } in Brand DNA or cut ${unproven.length === 1 ? "it" : "them"} — an invented credential is the one mistake a reader never forgives.`
          )
  );

  // ── 12. No placeholder text ───────────────────────────────────────────────
  const placeholder = firstMatch(text, PLACEHOLDERS);
  checks.push(
    placeholder === null
      ? pass("no_placeholder_text", "No placeholder text is left in the page")
      : fail(
          "no_placeholder_text",
          "No placeholder text is left in the page",
          `The page still contains ${placeholder}. Find and replace it before this goes on a live site.`
        )
  );

  // ── 13. No raw model output ───────────────────────────────────────────────
  // Markdown that was never converted, or a sentence the model addressed to us
  // rather than to the reader. Both are visible on a published page.
  const raw = firstMatch(html, RAW_OUTPUT);
  checks.push(
    raw === null
      ? pass("no_raw_output", "No unconverted model output is in the page")
      : fail(
          "no_raw_output",
          "No unconverted model output is in the page",
          `The page contains ${raw}, which a visitor would see. Remove it in the editor.`
        )
  );

  // ── 14. The house's forbidden words ───────────────────────────────────────
  const forbidden = ctx.workspace.brand.forbiddenWords;
  const usedForbidden = forbidden.length ? forbiddenIn(text, forbidden) : [];
  checks.push(
    forbidden.length === 0
      ? skip(
          "forbidden_words",
          "None of the words this business avoids appear",
          "No forbidden words are set in Brand DNA, so there was nothing to check for."
        )
      : usedForbidden.length === 0
        ? pass("forbidden_words", "None of the words this business avoids appear")
        : fail(
            "forbidden_words",
            "None of the words this business avoids appear",
            `The page uses ${usedForbidden.length} word${usedForbidden.length === 1 ? "" : "s"} this business does not use: ${usedForbidden
              .map((word) => `“${word}”`)
              .join(", ")}. Replace ${usedForbidden.length === 1 ? "it" : "them"} in the editor.`
          )
  );

  // ── 15. Every image says what it shows ────────────────────────────────────
  const images = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((match) => match[0]);
  const withoutAlt = images.filter((tag) => !/\salt\s*=\s*["'][^"']+["']/i.test(tag)).length;
  checks.push(
    images.length === 0
      ? skip("images_have_alt", "Every image has alt text", "The page has no images, so there was nothing to check.")
      : withoutAlt === 0
        ? pass("images_have_alt", "Every image has alt text")
        : fail(
            "images_have_alt",
            "Every image has alt text",
            `${withoutAlt} of ${images.length} image${images.length === 1 ? "" : "s"} on this page ${
              withoutAlt === 1 ? "has" : "have"
            } no alt text. A screen reader announces nothing for ${
              withoutAlt === 1 ? "it" : "them"
            } and no image search will index ${withoutAlt === 1 ? "it" : "them"}.`
          )
  );

  // ── 16. Every link goes somewhere real ────────────────────────────────────
  //
  // The check this pipeline was rebuilt around. The previous build wrote
  // plausible-looking URLs on the customer's own domain, published them, and
  // produced 404s inside a page that presented itself as a resource. A link is
  // allowed here only if the links stage read the destination or fetched the
  // source; anything else is a URL somebody invented.
  const hrefs = anchorsIn(html);
  const vouched = new Set(
    [...(links?.internal ?? []).map((row) => row.url), ...(links?.external ?? []).map((row) => row.url)].map(
      normalizeUrl
    )
  );
  const unreachable = new Set(
    (links?.removed ?? []).map((row) => normalizeUrl(row.split(" — ")[0] || row))
  );
  const dead = hrefs.filter((href) => unreachable.has(normalizeUrl(href)));
  const unverified = hrefs.filter(
    (href) => /^https?:\/\//i.test(href) && !vouched.has(normalizeUrl(href)) && !unreachable.has(normalizeUrl(href))
  );
  const linkProblems: string[] = [];
  if (dead.length) {
    linkProblems.push(
      `${dead.length} link${dead.length === 1 ? "" : "s"} point${dead.length === 1 ? "s" : ""} at a URL that did not respond when it was checked: ${dead
        .slice(0, 3)
        .join(", ")}`
    );
  }
  if (unverified.length) {
    linkProblems.push(
      `${unverified.length} link${unverified.length === 1 ? "" : "s"} ${
        unverified.length === 1 ? "was" : "were"
      } never verified by the links stage, so nobody has confirmed the ${
        unverified.length === 1 ? "page" : "pages"
      } exist${unverified.length === 1 ? "s" : ""}: ${unverified.slice(0, 3).join(", ")}`
    );
  }
  checks.push(
    hrefs.length === 0
      ? skip("links_resolve", "Every link goes somewhere real", "The page contains no links, so there was nothing to check.")
      : linkProblems.length === 0
        ? pass("links_resolve", "Every link goes somewhere real")
        : fail(
            "links_resolve",
            "Every link goes somewhere real",
            `${linkProblems.join(". ")}. Remove or replace ${
              dead.length + unverified.length === 1 ? "it" : "them"
            } in the editor — a 404 inside a page that claims to be a resource costs more than the link was worth.`
          )
  );

  // ── 17. The structured data parses ────────────────────────────────────────
  // Whether a JSON-LD block is good is a judgement; whether it parses is not, and
  // a block that does not parse is worse than none — it is a broken statement
  // about the page that every machine reading it will reject.
  let schemaParses = false;
  if (schema?.jsonLd) {
    try {
      const parsed = JSON.parse(schema.jsonLd) as { "@graph"?: unknown };
      schemaParses = Array.isArray(parsed["@graph"]) && parsed["@graph"].length > 0;
    } catch {
      schemaParses = false;
    }
  }
  checks.push(
    !schema
      ? skip(
          "schema_valid",
          "The structured data parses",
          "No structured data was produced for this page, so there was nothing to parse."
        )
      : schemaParses
        ? pass("schema_valid", "The structured data parses")
        : fail(
            "schema_valid",
            "The structured data parses",
            "The JSON-LD block for this page is not valid JSON or contains no @graph, so every machine that reads it will discard it. Run the structured data step again."
          )
  );

  // ── 18-20. The three score floors ─────────────────────────────────────────
  // Ours, and named as ours. Each blocks on its own so a user sees which number
  // stopped them rather than a total they cannot take apart.
  if (!score) {
    const why = "The quality score never ran, so none of the three floors could be applied. This is not a pass.";
    checks.push(
      skip("quality_total", `The quality score reaches ${QUALITY_FLOOR}`, why),
      skip("differentiation", `Differentiation reaches ${DIFFERENTIATION_FLOOR}`, why),
      skip("trust", `Trust reaches ${TRUST_FLOOR}`, why)
    );
  } else {
    checks.push(
      score.total >= QUALITY_FLOOR
        ? pass("quality_total", `The quality score reaches ${QUALITY_FLOOR}`)
        : fail(
            "quality_total",
            `The quality score reaches ${QUALITY_FLOOR}`,
            `This page scores ${score.total} out of 100 against our own ten dimensions, below the ${QUALITY_FLOOR} we will publish. It is not a Google score and it predicts nothing about rankings — it is the line between a draft and a page. ${score.biggestGap}`
          ),
      score.differentiation >= DIFFERENTIATION_FLOOR
        ? pass("differentiation", `Differentiation reaches ${DIFFERENTIATION_FLOOR}`)
        : fail(
            "differentiation",
            `Differentiation reaches ${DIFFERENTIATION_FLOOR}`,
            `Differentiation scores ${score.differentiation} out of 100: this page mostly says what the pages already ranking for the query say. Publishing it adds another version of something that exists. ${
              score.dimensions.find((row) => row.key === "differentiation")?.note || ""
            }`.trim()
          ),
      score.trust >= TRUST_FLOOR
        ? pass("trust", `Trust reaches ${TRUST_FLOOR}`)
        : fail(
            "trust",
            `Trust reaches ${TRUST_FLOOR}`,
            `Trust scores ${score.trust} out of 100. ${
              score.dimensions.find((row) => row.key === "trust")?.note ||
              "The page asserts things nothing behind it establishes."
            }`
          )
    );
  }

  // The report's own guard recomputes `passed` and `blockers` from the checks, so
  // the number the UI shows and the list it shows cannot disagree.
  const report: PublishGateReport = { passed: false, checks, blockers: [] };
  const checked = readPublishGateReport(report) || report;
  const skippedCount = checked.checks.filter((check) => check.skipped).length;

  return done(checked, {
    gatePassed: checked.passed,
    gateBlockers: checked.blockers,
    gateChecksRun: checked.checks.length - skippedCount,
    // Named so the editor can say which of the twenty could not be carried out
    // rather than presenting them as passes.
    gateChecksSkipped: checked.checks.filter((check) => check.skipped).map((check) => check.key),
    gateReadyToPublish: checked.passed,
  });
};










