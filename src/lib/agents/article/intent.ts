/**
 * STAGE 4 — SEARCH INTENT
 *
 * Before anything is written, the run has to be able to state what the reader
 * came for. Every later stage is judged against this: the outline covers
 * `mustKnow` or it is incomplete, the score's intent dimension reads `kind`, and
 * the publish gate refuses a page that answers a different question than the one
 * the query asks.
 *
 * It runs before the live results are read, deliberately. Reading what already
 * ranks first would make this stage a summary of the competition instead of a
 * reading of the query — and then "matches intent" would only ever mean "matches
 * whatever Google currently shows".
 */

import { readSearchIntent, type SearchIntent } from "@/lib/article/artifacts";
import { readBusinessProfile } from "@/lib/article/artifacts";
import {
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askJson } from "./router";

const SYSTEM = `You read a search query the way the person who typed it would.

Decide:
- kind: informational (they want to understand), commercial (they are comparing before buying), transactional (they are ready to act), navigational (they want a specific place).
- readerProblem: the problem behind the query, in their words, one sentence. Not the keyword restated.
- mustKnow: the things they must know by the last line for the page to have been worth opening. Three to seven, each concrete.
- questions: the questions they arrive with.
- expectedFormat: what kind of page this query expects — a how-to, a comparison, a definition, a service page, a checklist.

Rules:
- Judge the query, not the business. A business that sells one thing does not make an informational query commercial.
- Every mustKnow item must be answerable. "Understand the landscape" is not.
- No marketing language.

Return JSON only:
{"kind":"...","readerProblem":"...","mustKnow":["..."],"questions":["..."],"expectedFormat":"..."}`;
export const runIntentStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const business = readArtifact(ctx, "business", readBusinessProfile);

  const lines: string[] = [`Query: ${ctx.brief.keyword}`];
  if (ctx.brief.title) lines.push(`Working title the user typed: ${ctx.brief.title}`);
  if (ctx.brief.targetCountry) lines.push(`Searched from: ${ctx.brief.targetCountry}`);
  if (ctx.brief.language) lines.push(`Written in: ${ctx.brief.language}`);
  if (business) {
    lines.push(
      `The business publishing this: ${business.summary}`,
      business.audience ? `Who it serves: ${business.audience}` : ""
    );
  }

  const intent: SearchIntent = await askJson(
    "reasoning",
    "Search intent",
    {
      system: SYSTEM,
      prompt: lines.filter(Boolean).join("\n"),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readSearchIntent
  );

  return done(intent, {
    intentKind: intent.kind,
    readerProblem: intent.readerProblem,
    mustKnow: intent.mustKnow,
  });
};

