/**
 * WHAT A LIVE PAGE SHOULD GAIN
 *
 * `rankOpportunities` produces candidates by a mechanical rule: the page earns
 * impressions for a query and words from that query are not in its text. That rule
 * can be explained in one sentence, which is why it is the one used — but it is
 * wrong often enough to matter. A page can answer "how much does it cost" under a
 * heading called "Pricing" and never use the word "much".
 *
 * So this file is the second half of that. It hands the *real page text* and the
 * candidates to a model and asks it to sort them into three piles: answered,
 * worth adding, and declined. A candidate that survives to `sections` is one where
 * something has read the page and still says it is missing.
 *
 * Three properties it keeps, the same three the overlap stage keeps:
 *
 *   No model call when there is nothing to judge. Zero candidates means a proposal
 *   written here, saying so, at no cost.
 *
 *   Every query is re-checked against the candidates that were really in the
 *   prompt. A section proposed for a query nobody measured is dropped and counted,
 *   because that section becomes a change to a live page.
 *
 *   Every `placeAfter` and every edit `target` has to be a heading the page really
 *   has. An instruction to change a section that does not exist cannot be followed.
 *
 * It proposes. It does not write, and it does not touch the page: `needsResearch`
 * exists so that everything a new section asserts goes through research and the
 * evidence gate before a word of it is drafted.
 */

import {
  readOptimizationProposal,
  type OptimizationProposal,
  type PerformanceSummary,
  type ProposedEdit,
  type ProposedSection,
  type QueryOpportunity,
} from "@/lib/article/performance";
import { askJson, type ModelMeter } from "./router";

/** Enough of the page to judge coverage. The footer is not worth paying for twice. */
const PAGE_CHARS = 14_000;
const HEADINGS_SHOWN = 30;
/** Candidates put in front of the judgement. More than this is a rewrite, not an update. */
const TRIGGERS_SHOWN = 12;
/** A page needing more than four new sections needs rewriting, and the prompt says so. */
const MAX_SECTIONS = 4;

const SYSTEM = `You read a page that is already published and decide what, if anything, should be added to it.

You are given the page's real text and the search queries it is already earning impressions for. For each query, sort it into one of three piles.

Return JSON only:
{"summary":"...","answered":[{"query":"...","where":"..."}],"sections":[{"heading":"...","queries":["..."],"covers":["..."],"placeAfter":"...","needsResearch":["..."]}],"edits":[{"target":"...","change":"...","queries":["..."]}],"declined":[{"query":"...","reason":"..."}]}

- summary: one sentence a person reads on a card. What the scan concluded. Not a sales line.
- answered: the query is already answered by this text. "where" names the heading that answers it. This is the pile to use whenever the page covers the question, even if it never uses the searcher's words.
- sections: something the page does not have.
  - heading: how it would read on the page. Never a heading the page already has.
  - queries: only queries from the list you were given.
  - covers: the points the section must make, as an outline. Do not write the prose.
  - placeAfter: an existing heading, copied exactly, that this belongs after. Use "" for the end of the article.
  - needsResearch: facts the section needs that this page does not already establish. Write each one as the thing to verify. Every one of them is researched and checked against a source before a word is drafted, so list them instead of assuming them.
- edits: an existing passage that should change. "target" is an existing heading copied exactly. "change" is one sentence saying what has to be different.
- declined: a query you will not act on, and why. A refusal is a result.

Rules you do not break:
- Never name a query that is not in the list you were given.
- You have the page. The list was built by matching words mechanically, so it is sometimes wrong — if the text answers the question under different words, the query is answered, and say where.
- Ranking badly is not evidence of a gap. A page can answer something well and still not be chosen.
- Something covered in a paragraph does not need a new section. That is an edit at most.
- Never propose more than ${MAX_SECTIONS} sections. If the page needs more than that, say so in the summary and propose the ${MAX_SECTIONS} that matter.
- Never promise a ranking or a traffic result. You know what the page does not say. You do not know what Google will do about it.
- If nothing should change, return empty sections and edits and say that in the summary. That is a complete answer, not a failure.`;

/** Headings compared on their words, so casing and punctuation do not decide a match. */
function headingKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function triggerLines(opportunities: QueryOpportunity[]): string {
  return opportunities
    .map((row, index) =>
      [
        `${index + 1}. "${row.query}"`,
        `   ${row.impressions} impression${row.impressions === 1 ? "" : "s"}, ${row.clicks} click${
          row.clicks === 1 ? "" : "s"
        }, average position ${row.position.toFixed(1)} over ${row.days} day${
          row.days === 1 ? "" : "s"
        }`,
        `   What was measured: ${row.reason}`,
      ].join("\n")
    )
    .join("\n");
}

export interface ScanInput {
  /** The live URL, for the prompt only — the fetch has already happened. */
  page: string;
  title: string;
  /** The query the article was written for, when one is on record. */
  keyword?: string;
  headings: string[];
  /** The page's text as fetched. Trimmed here, not by the caller. */
  text: string;
  summary: PerformanceSummary;
  opportunities: QueryOpportunity[];
  meter?: ModelMeter;
  signal?: AbortSignal;
}

/** What the scan concluded, and what had to be thrown away to trust it. */
export interface ScanResult {
  proposal: OptimizationProposal;
  dropped: { queries: number; sections: number; edits: number };
  /** True when there is something for a person to approve. */
  actionable: boolean;
}

function emptyResult(summary: string): ScanResult {
  return {
    proposal: { summary, answered: [], sections: [], edits: [], declined: [] },
    dropped: { queries: 0, sections: 0, edits: 0 },
    actionable: false,
  };
}

/**
 * The candidates, the page, and one judgement.
 *
 * The prompt carries the numbers *and* the sentence that explains them, because a
 * model told only "impressions: 240" cannot tell the difference between a query the
 * page never mentions and one it covers without a heading — and those two lead to
 * different proposals.
 */
export async function scanForOptimizations(input: ScanInput): Promise<ScanResult> {
  const opportunities = (input.opportunities || []).slice(0, TRIGGERS_SHOWN);
  const headings = (input.headings || []).map((value) => String(value || "").trim()).filter(Boolean);
  const text = String(input.text || "").trim();

  // Written here, with no model call. "Nothing to propose" is a real answer and it
  // should not cost a request to say it.
  if (opportunities.length === 0) {
    return emptyResult(
      input.summary.impressions > 0
        ? `Nothing to propose: across ${input.summary.days} day${
            input.summary.days === 1 ? "" : "s"
          } and ${input.summary.impressions} impressions, every query this page was found for is already in its text and in a heading.`
        : "Nothing to propose: this page has no stored Search Console rows yet, so there is nothing measured to react to. Sync it once it has been live long enough to appear."
    );
  }
  if (!text) {
    return emptyResult(
      "The live page could not be read, so the queries were not judged against it. Nothing was assumed about what the page covers."
    );
  }

  const judged = await askJson(
    "reasoning",
    "Optimisation scan",
    {
      system: SYSTEM,
      prompt: [
        `THE PAGE: ${input.page}`,
        `Its title: ${input.title || "(no title)"}`,
        input.keyword ? `It was written for: ${input.keyword}` : "",
        headings.length
          ? `Its headings, in order — the only headings you may name in placeAfter or target:\n- ${headings
              .slice(0, HEADINGS_SHOWN)
              .join("\n- ")}`
          : "Its headings could not be read, so leave placeAfter empty and propose no edits.",
        `WHAT IT IS FOUND FOR: ${input.summary.impressions} impressions and ${input.summary.clicks} clicks between ${input.summary.from} and ${input.summary.to}.`,
        `THE QUERIES TO SORT — the only queries you may name anywhere in your answer:\n${triggerLines(
          opportunities
        )}`,
        `THE PAGE'S TEXT AS PUBLISHED:\n${text.slice(0, PAGE_CHARS)}${
          text.length > PAGE_CHARS ? "\n[trimmed here]" : ""
        }`,
        "Return the JSON.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      meter: input.meter,
      signal: input.signal,
    },
    readOptimizationProposal
  );

  // Everything below is the same discipline as the overlap stage: what the model
  // named is checked against what was really put in front of it, and what does not
  // survive is counted rather than quietly forgotten. A section here becomes a
  // change to a page that is already live and already earning impressions.
  const allowed = new Set(opportunities.map((row) => row.query));
  const headingKeys = new Set(headings.map(headingKey));
  const titleKey = headingKey(input.title);
  const dropped = { queries: 0, sections: 0, edits: 0 };

  const keepQueries = (queries: string[]): string[] =>
    queries.filter((query) => {
      if (allowed.has(query)) return true;
      dropped.queries += 1;
      return false;
    });

  const edits: ProposedEdit[] = [];
  for (const edit of judged.edits) {
    const key = headingKey(edit.target);
    // The title stands in for the opening, which has no heading of its own.
    if (!headingKeys.has(key) && key !== titleKey) {
      dropped.edits += 1;
      continue;
    }
    const queries = keepQueries(edit.queries);
    if (queries.length === 0) {
      dropped.edits += 1;
      continue;
    }
    edits.push({ ...edit, queries });
  }

  const sections: ProposedSection[] = [];
  for (const section of judged.sections) {
    const queries = keepQueries(section.queries);
    if (queries.length === 0) {
      dropped.sections += 1;
      continue;
    }
    // A "new" section under a heading the page already has would put the same
    // heading on the page twice. The points are the model's own, so they become a
    // change to the section that is already there rather than being thrown away.
    if (headingKeys.has(headingKey(section.heading))) {
      edits.push({
        target: section.heading,
        change: `Extend this section to cover: ${section.covers.join("; ")}`,
        queries,
      });
      continue;
    }
    if (sections.length >= MAX_SECTIONS) {
      dropped.sections += 1;
      continue;
    }
    sections.push({
      ...section,
      queries,
      // An instruction to place something after a heading the page does not have
      // cannot be followed, and the end of the article is the honest default.
      placeAfter: headingKeys.has(headingKey(section.placeAfter)) ? section.placeAfter : "",
    });
  }

  const answered = judged.answered.filter((row) => {
    if (allowed.has(row.query)) return true;
    dropped.queries += 1;
    return false;
  });
  const declined = judged.declined.filter((row) => {
    if (allowed.has(row.query)) return true;
    dropped.queries += 1;
    return false;
  });

  const checked = readOptimizationProposal({
    summary: judged.summary,
    answered,
    sections,
    edits,
    declined,
  });
  const proposal = checked ?? { summary: judged.summary, answered, sections, edits, declined };

  return {
    proposal,
    dropped,
    // Nothing to approve is not a failed scan, and the caller is told which it was
    // rather than having to infer it from an empty array.
    actionable: proposal.sections.length > 0 || proposal.edits.length > 0,
  };
}
