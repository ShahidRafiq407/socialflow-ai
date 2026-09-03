/**
 * STAGE 6 — COVERAGE GAPS
 *
 * The first page, sorted into four bands: what everybody covers, what is covered
 * badly, what is missing, and what is missing *and* this business can answer from
 * its own work. Only the last band is worth much, and it is the only one that
 * depends on knowing whose page this is — which is why this stage reads the
 * business profile and not just the search results.
 *
 * Two numbers are computed here rather than asked for. `counts` is derived from the
 * bands in the list, so a summary line cannot disagree with the table under it. And
 * `pagesCompared` is the number of ranking pages that were really put in front of
 * the judgement — because "nothing is missing", read off zero pages, is not a
 * finding about the topic at all. It is a finding about the crawl.
 *
 * Every URL in `seenOn` is checked against the pages the SERP stage actually
 * returned. An observation attributed to a page nobody read is the failure this
 * whole pipeline is built to prevent, and here it would be an especially quiet one:
 * a fabricated citation next to a real gap still reads as evidence.
 *
 * It does not block. When the live results could not be read at all there is
 * nothing to compare against, and the stage says so and steps aside rather than
 * inventing a first page or ending the run over a search API.
 */

import {
  readBusinessProfile,
  readContentGapReport,
  readContentInventory,
  readSearchIntent,
  readSerpResearch,
  type BusinessProfile,
  type ContentGapReport,
  type ContentInventory,
  type GapBand,
  type SearchIntent,
  type SerpResearch,
} from "@/lib/article/artifacts";
import {
  businessLines,
  done,
  readArtifact,
  skipped,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askJson } from "./router";

/** How many ranking pages the bands are read from. */
const SHOW_PAGES = 8;

const SYSTEM = `You compare what a reader of a query needs against what the pages already ranking for it actually cover.

Sort each subject into one band:
- common — every ranking page covers it, so leaving it out would be a hole.
- weak — covered, but thinly, vaguely, or wrongly.
- missing — the reader needs it and none of these pages covers it.
- opportunity — nobody covers it, and this business can answer it from its own work.

For each subject give:
- topic: the subject, phrased as something a reader wants to know. Not a heading, and not a keyword.
- band: one of the four.
- seenOn: the URLs, taken from the list you were given, where you observed it. Required for common and weak. Empty for missing and opportunity.
- note: what is actually there, or what is absent, in one sentence, specific enough to act on. "Gives a price range with no mention of what moves it" is a note. "Could be better" is not.

Rules you do not break:
- Report only what the material shows. A page whose headings could not be read tells you nothing: never band a subject as missing or as an opportunity because a page was unreadable.
- Never cite a URL that is not in the list you were given.
- "opportunity" requires the established business facts to support it. If this business cannot answer the subject first-hand, the band is "missing".
- Twelve to twenty subjects. Do not pad the list with things nobody searching this would care about.
- No marketing language, and no advice about keyword placement.

Return JSON only:
{"topics":[{"topic":"...","band":"common","seenOn":["..."],"note":"..."}]}`;

/** The ranking pages, as structure. The same shape the angle stage is shown. */
function competitorLines(serp: SerpResearch): string {
  const lines = serp.competitors.slice(0, SHOW_PAGES).map((row, index) => {
    const headings = row.headings.length
      ? row.headings.slice(0, 14).join(" | ")
      : "(headings could not be read — this page tells you nothing about what it covers)";
    const length = row.wordCount ? ` — about ${row.wordCount} words` : "";
    return `${index + 1}. ${row.url}\n   ${row.title || "(no title)"}${length}\n   ${headings}`;
  });
  return `PAGES THAT ALREADY RANK (cite only these URLs):\n${lines.join("\n")}`;
}

function prompt(
  ctx: StageContext,
  serp: SerpResearch,
  intent: SearchIntent | null,
  business: BusinessProfile | null,
  inventory: ContentInventory | null
): string {
  const parts: string[] = [`Query: ${ctx.brief.keyword}`];

  if (intent) {
    parts.push(
      `WHAT THE READER CAME FOR:\nIntent: ${intent.kind}\nTheir problem: ${intent.readerProblem}${
        intent.mustKnow.length ? `\nThey must leave knowing:\n- ${intent.mustKnow.join("\n- ")}` : ""
      }${intent.questions.length ? `\nThey arrive asking:\n- ${intent.questions.join("\n- ")}` : ""}`
    );
  }

  if (business) {
    parts.push(
      `WHAT THIS BUSINESS CAN ANSWER FIRST-HAND (the only basis for an "opportunity"):\n${business.summary}${
        business.services.length ? `\nServices: ${business.services.join(", ")}` : ""
      }${business.proofPoints.length ? `\nDemonstrated: ${business.proofPoints.join("; ")}` : ""}`
    );
    if (business.unverified.length) {
      parts.push(
        `NOBODY HAS CONFIRMED THESE — an opportunity may not rest on one:\n- ${business.unverified.join("\n- ")}`
      );
    }
  } else {
    const onFile = businessLines(ctx.workspace);
    parts.push(
      onFile.length
        ? `WHAT THE OWNER HAS FILLED IN:\n${onFile.join("\n")}`
        : "BUSINESS FACTS: none established on this run, so nothing can be banded as an opportunity."
    );
  }

  parts.push(competitorLines(serp));
  if (serp.note) parts.push(`ABOUT THAT READ: ${serp.note}`);
  if (serp.peopleAlsoAsk.length) {
    parts.push(`QUESTIONS GOOGLE SHOWS ALONGSIDE:\n- ${serp.peopleAlsoAsk.slice(0, 12).join("\n- ")}`);
  }
  if (serp.relatedSearches.length) {
    parts.push(`RELATED SEARCHES:\n- ${serp.relatedSearches.slice(0, 10).join("\n- ")}`);
  }
  if (inventory?.topics.length) {
    parts.push(
      `SUBJECTS THIS SITE ALREADY WRITES ABOUT (evidence of what it works on — not a reason to leave a subject out):\n- ${inventory.topics.join(
        "\n- "
      )}`
    );
  }
  return parts.join("\n\n");
}

export const runGapsStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const serp = readArtifact(ctx, "serp", readSerpResearch);
  if (!serp || serp.competitors.length === 0) {
    // Nothing was read, so there is nothing to sort. Stepping aside keeps the
    // difference between "the first page covers everything" and "nobody saw the
    // first page" — a distinction an empty report would destroy.
    return skipped(
      `There are no ranking pages to compare against: ${
        serp?.note || "the live results were not read on this run"
      } Nothing was assumed about what the pages already ranking cover.`
    );
  }

  const intent = readArtifact(ctx, "intent", readSearchIntent);
  const business = readArtifact(ctx, "business", readBusinessProfile);
  const inventory = readArtifact(ctx, "inventory", readContentInventory);

  const shown = serp.competitors.slice(0, SHOW_PAGES);
  const cited = new Set(shown.map((row) => row.url));

  const report: ContentGapReport = await askJson(
    "reasoning",
    "Coverage gaps",
    {
      system: SYSTEM,
      prompt: prompt(ctx, serp, intent, business, inventory),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readContentGapReport
  );

  // Every citation checked against the pages that were really in the prompt. A URL
  // the model produced from somewhere else is dropped rather than shown, and the
  // count of what was dropped goes on the run so it is visible that it happened.
  let dropped = 0;
  const topics = report.topics.map((topic) => {
    const seenOn = topic.seenOn.filter((url) => {
      if (cited.has(url)) return true;
      dropped += 1;
      return false;
    });
    return { ...topic, seenOn };
  });

  const artifact: ContentGapReport = {
    topics,
    // Recomputed by the guard below from the bands in `topics`.
    counts: report.counts,
    // The pages the judgement was actually made against, counted here.
    pagesCompared: shown.length,
  };
  const checked = readContentGapReport(artifact) || { ...artifact, topics };

  const named = (band: GapBand): string[] =>
    checked.topics.filter((topic) => topic.band === band).map((topic) => topic.topic).slice(0, 10);

  return done(checked, {
    gapCounts: checked.counts,
    gapTopicCount: checked.topics.length,
    gapsCompared: checked.pagesCompared,
    // Read by the opportunity stage, and by the score's differentiation dimension.
    gapOpportunities: named("opportunity"),
    gapMissing: named("missing"),
    gapWeak: named("weak"),
    ...(dropped ? { gapCitationsDropped: dropped } : {}),
  });
};
