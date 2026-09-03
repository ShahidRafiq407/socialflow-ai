/**
 * STAGE 7 — OPPORTUNITY
 *
 * Whether this topic is worth a page from this business, scored on the five things
 * this pipeline has actually observed.
 *
 * There is no search volume here and no keyword difficulty, and that absence is the
 * design. This build has no volume source, so a number in that column would be
 * invented — and an invented number with a percentage next to it is the most
 * believable thing on the screen. Every factor in `OPPORTUNITY_FACTORS` is
 * answerable from something an earlier stage went and read: the business profile,
 * the live first page, the site's own inventory, the gap bands.
 *
 * The prompt is generated from that same table, weights included, so the two cannot
 * drift apart. The total is computed from the weights by `readTopicOpportunity`,
 * which discards whatever total the model reports.
 *
 * It does not stop the run. Somebody asked for this topic; a stage that refused
 * would only mean the article got written in quick mode with less checking instead.
 * A verdict of "skip" is advice, and it is recorded with the reason and with what
 * would have to change, where the person who asked can read it.
 */

import {
  OPPORTUNITY_FACTORS,
  readBusinessProfile,
  readContentGapReport,
  readContentInventory,
  readPageTypeDecision,
  readSearchIntent,
  readSerpResearch,
  readTopicOpportunity,
  type BusinessProfile,
  type ContentGapReport,
  type ContentInventory,
  type PageTypeDecision,
  type SearchIntent,
  type SerpResearch,
  type TopicOpportunity,
} from "@/lib/article/artifacts";
import {
  businessLines,
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askJson } from "./router";

/** The factors and their weights, straight from the table the total is computed from. */
const FACTOR_LINES = OPPORTUNITY_FACTORS.map(
  (factor) => `- ${factor.key} (${factor.label}, worth ${factor.weight} of the 100): ${factor.hint}`
).join("\n");

const SYSTEM = `You judge whether a topic is worth a page from one specific business.

Score each of these factors from 0 to 100, and say in one sentence what the score rests on:
${FACTOR_LINES}

Then give:
- verdict: "write" when the topic earns the page as it stands, "later" when something has to change first, "skip" when this business should not write it at all.
- reason: the verdict in one or two sentences, naming the factor that decided it.
- raise: what would make this topic worth more, specifically — a fact to go and get, a page to build before this one, a service it would have to sit closer to. Empty when the verdict is "write".

Rules you do not break:
- Do not score search volume, keyword difficulty, competition strength or traffic. Nobody measured them and you have no way to know them. A number for any of those is a guess presented as a measurement.
- Do not compute a total. It is computed from the weights above.
- Every note names its evidence. "The business installs these floors, and the page would be about installing them" is evidence. "Seems relevant" is not.
- Judge only what you were given. A factor you cannot judge scores low with the note saying what is missing, and is never scored high on the assumption it is fine.
- No marketing language.

Return JSON only:
{"factors":[{"key":"business_fit","score":0,"note":"..."}],"verdict":"write","reason":"...","raise":["..."]}`;

/** What already ranks, as room or the absence of it. Titles and lengths only. */
function competitionLines(serp: SerpResearch | null): string {
  if (!serp || serp.competitors.length === 0) {
    return `WHAT ALREADY RANKS: ${
      serp?.note || "the live results were not read on this run"
    } Score "room" low and say the page was not seen, rather than assuming there is space on it.`;
  }
  const lines = serp.competitors.slice(0, 8).map((row, index) => {
    const length = row.wordCount ? ` — about ${row.wordCount} words` : "";
    const headings = row.headings.length ? `\n   ${row.headings.slice(0, 8).join(" | ")}` : "";
    return `${index + 1}. ${row.title || row.url}${length}${headings}`;
  });
  return `WHAT ALREADY RANKS:\n${lines.join("\n")}`;
}

/** The bands, which are the observed answer to how much room there is. */
function gapLines(gaps: ContentGapReport | null): string {
  if (!gaps) {
    return "COVERAGE GAPS: not sorted on this run, so nobody has compared this topic against the first page.";
  }
  const band = (name: "opportunity" | "missing" | "weak") =>
    gaps.topics
      .filter((topic) => topic.band === name)
      .slice(0, 8)
      .map((topic) => `- ${topic.topic}: ${topic.note}`)
      .join("\n");
  const parts = [
    `COVERAGE GAPS, read from ${gaps.pagesCompared} ranking page${gaps.pagesCompared === 1 ? "" : "s"} (${gaps.counts.common} common, ${gaps.counts.weak} weak, ${gaps.counts.missing} missing, ${gaps.counts.opportunity} opportunity):`,
  ];
  const opportunity = band("opportunity");
  const missing = band("missing");
  const weak = band("weak");
  if (opportunity) parts.push(`Nobody covers these and this business can answer them:\n${opportunity}`);
  if (missing) parts.push(`Nobody covers these:\n${missing}`);
  if (weak) parts.push(`Covered badly:\n${weak}`);
  return parts.join("\n");
}

function prompt(
  ctx: StageContext,
  business: BusinessProfile | null,
  pageType: PageTypeDecision | null,
  intent: SearchIntent | null,
  serp: SerpResearch | null,
  gaps: ContentGapReport | null,
  inventory: ContentInventory | null
): string {
  const parts: string[] = [`Topic: ${ctx.brief.keyword}`];
  if (ctx.brief.targetCountry) parts.push(`Read by people in: ${ctx.brief.targetCountry}`);

  if (business) {
    parts.push(
      `THE BUSINESS:\n${business.summary}${
        business.services.length ? `\nServices: ${business.services.join(", ")}` : ""
      }${business.audience ? `\nWho it serves: ${business.audience}` : ""}${
        business.proofPoints.length ? `\nDemonstrated: ${business.proofPoints.join("; ")}` : ""
      }`
    );
    if (business.unverified.length) {
      parts.push(
        `NOBODY HAS CONFIRMED THESE — "first_hand" may not rest on one:\n- ${business.unverified.join("\n- ")}`
      );
    }
  } else {
    const onFile = businessLines(ctx.workspace);
    parts.push(
      onFile.length
        ? `WHAT THE OWNER HAS FILLED IN:\n${onFile.join("\n")}`
        : "THE BUSINESS: nothing was established on this run. Score business_fit and first_hand low and say so."
    );
  }

  if (intent) {
    parts.push(
      `WHAT THE READER CAME FOR:\nIntent: ${intent.kind}\nTheir problem: ${intent.readerProblem}${
        intent.mustKnow.length ? `\nThey must leave knowing:\n- ${intent.mustKnow.slice(0, 8).join("\n- ")}` : ""
      }`
    );
  }
  if (pageType) {
    parts.push(
      `THE FORMAT THIS QUERY WANTS: ${pageType.choice} — ${pageType.reason}${
        pageType.existingUrl ? `\nA page on this site already covers it: ${pageType.existingUrl}` : ""
      }`
    );
  }

  parts.push(competitionLines(serp));
  parts.push(gapLines(gaps));

  if (inventory) {
    parts.push(
      inventory.topics.length
        ? `WHAT THIS SITE ALREADY WRITES ABOUT (${inventory.pages.length} page${
            inventory.pages.length === 1 ? "" : "s"
          } read of ${inventory.discovered} found):\n- ${inventory.topics.join("\n- ")}`
        : `THIS SITE'S OWN PAGES: ${inventory.note || "nothing readable was found"}`
    );
  }
  return parts.join("\n\n");
}

export const runOpportunityStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const business = readArtifact(ctx, "business", readBusinessProfile);
  const pageType = readArtifact(ctx, "content_type", readPageTypeDecision);
  const intent = readArtifact(ctx, "intent", readSearchIntent);
  const serp = readArtifact(ctx, "serp", readSerpResearch);
  const gaps = readArtifact(ctx, "gaps", readContentGapReport);
  const inventory = readArtifact(ctx, "inventory", readContentInventory);

  const opportunity: TopicOpportunity = await askJson(
    "reasoning",
    "Opportunity",
    {
      system: SYSTEM,
      prompt: prompt(ctx, business, pageType, intent, serp, gaps, inventory),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readTopicOpportunity
  );

  return done(opportunity, {
    // Weighted from the factor table, not taken from the model.
    opportunityTotal: opportunity.total,
    opportunityVerdict: opportunity.verdict,
    opportunityReason: opportunity.reason,
    opportunityRaise: opportunity.raise,
    // Which factors were actually scored, so a total built on two of five is
    // readable as such rather than looking like a low score.
    opportunityFactorsScored: opportunity.factors.length,
  });
};
