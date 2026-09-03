/**
 * STAGE 8 — ANGLE AND PROMISE
 *
 * The decision this whole pipeline exists to make. Everything before it is
 * observation — what the business is, what the reader wants, what already ranks.
 * This is where the run commits to a position, and the outline, the writer and
 * two of the score's dimensions are all judged against what it commits to.
 *
 * Two things make it more than a prompt. `adds` has to name something the ranking
 * pages do not do, and it is given those pages' real headings to say it against.
 * And `proofRequired` is a list this stage writes for someone else to check: the
 * evidence gate reads it, and the writer never sees a claim on it that failed.
 *
 * Its worst failure would be quiet: an angle that sounds distinctive because it is
 * vague. So the prompt refuses positions that cannot be falsified, and the stage
 * blocks when there is no intent to write towards.
 */

import {
  readArticleStrategy,
  type ArticleStrategy,
  type BusinessProfile,
  type SearchIntent,
  type SerpResearch,
} from "@/lib/article/artifacts";
import {
  readBusinessProfile,
  readSearchIntent,
  readSerpResearch,
} from "@/lib/article/artifacts";
import { briefWordTarget } from "@/lib/article/brief";
import {
  blocked,
  businessLines,
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askJson } from "./router";
const SYSTEM = `You decide the position a page will take, for a business that will publish it under its own name.

Decide:
- angle: the position, stated so it could be disagreed with. "A guide to X" is a topic, not an angle. "Most X guides skip the permit step, which is the part that actually delays the job" is an angle.
- promise: what the reader can do or decide after reading, in one sentence, testable against the finished page.
- adds: what this page has that the pages already ranking do not. You have their real headings. Each item must be checkable against them. Two to five.
- proofRequired: the specific facts this angle commits the page to proving — a number, a rule, a date, a named source. Someone else will go and verify each one, and any that fails is cut from the page. Write them as things to prove, not as claims. Zero to eight.
- businessTieIn: where this business legitimately belongs in the answer, given only the established facts. If it does not belong anywhere except the closing line, say that.
- targetReader: who this is written for, specifically.

Rules you do not break:
- Never state a business fact that is not in the established facts. If the angle needs one, put it in proofRequired instead.
- The unverified list is what nobody has confirmed. Do not build the angle on any of it.
- An angle that cannot be wrong is not an angle. No "comprehensive", "ultimate", "everything you need to know".
- Do not promise what the format cannot deliver.
- No marketing language.

Return JSON only:
{"angle":"...","promise":"...","adds":["..."],"proofRequired":["..."],"businessTieIn":"...","targetReader":"..."}`;

/** The ranking pages as structure, so `adds` is said against something real. */
function competitorLines(serp: SerpResearch | null): string[] {
  if (!serp) return ["THE PAGES THAT ALREADY RANK: not read on this run."];
  if (serp.note && serp.competitors.length === 0) {
    return [`THE PAGES THAT ALREADY RANK: ${serp.note}`];
  }
  const lines = serp.competitors.slice(0, 8).map((row, index) => {
    const headings = row.headings.length
      ? row.headings.slice(0, 10).join(" | ")
      : "(headings could not be read)";
    const length = row.wordCount ? ` — about ${row.wordCount} words` : "";
    return `${index + 1}. ${row.title || row.url}${length}\n   ${headings}`;
  });
  return [`THE PAGES THAT ALREADY RANK:\n${lines.join("\n")}`];
}
function prompt(
  ctx: StageContext,
  business: BusinessProfile | null,
  intent: SearchIntent,
  serp: SerpResearch | null
): string {
  const parts: string[] = [
    `Query: ${ctx.brief.keyword}`,
    `Length this page is planned at: about ${briefWordTarget(ctx.brief)} words`,
  ];
  if (ctx.brief.title) parts.push(`Working title the user typed: ${ctx.brief.title}`);
  if (ctx.brief.tone) parts.push(`Voice asked for: ${ctx.brief.tone}`);

  parts.push(
    `WHAT THE READER CAME FOR:\nIntent: ${intent.kind}\nTheir problem: ${intent.readerProblem}\nThey must leave knowing:\n- ${intent.mustKnow.join("\n- ")}${
      intent.questions.length ? `\nThey arrive asking:\n- ${intent.questions.join("\n- ")}` : ""
    }${intent.expectedFormat ? `\nThe format this query expects: ${intent.expectedFormat}` : ""}`
  );

  if (business) {
    parts.push(
      `ESTABLISHED BUSINESS FACTS (the only business facts you may state):\n${business.summary}${
        business.services.length ? `\nServices: ${business.services.join(", ")}` : ""
      }${business.audience ? `\nWho it serves: ${business.audience}` : ""}${
        business.proofPoints.length ? `\nDemonstrated: ${business.proofPoints.join("; ")}` : ""
      }`
    );
    if (business.unverified.length) {
      parts.push(
        `NOT CONFIRMED BY ANYBODY — do not build the angle on these:\n- ${business.unverified.join("\n- ")}`
      );
    }
  } else {
    const onFile = businessLines(ctx.workspace);
    parts.push(
      onFile.length
        ? `WHAT THE OWNER HAS FILLED IN:\n${onFile.join("\n")}`
        : "BUSINESS FACTS: none established on this run."
    );
  }

  parts.push(...competitorLines(serp));
  if (serp?.peopleAlsoAsk.length) {
    parts.push(`QUESTIONS GOOGLE SHOWS ALONGSIDE:\n- ${serp.peopleAlsoAsk.slice(0, 12).join("\n- ")}`);
  }
  return parts.join("\n\n");
}
export const runStrategyStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const intent = readArtifact(ctx, "intent", readSearchIntent);
  if (!intent) {
    return blocked(
      "The search intent stage produced nothing usable, so there is no reader to write towards. Run this article again from the intent step."
    );
  }

  const business = readArtifact(ctx, "business", readBusinessProfile);
  const serp = readArtifact(ctx, "serp", readSerpResearch);

  const strategy: ArticleStrategy = await askJson(
    "reasoning",
    "Angle and promise",
    {
      system: SYSTEM,
      prompt: prompt(ctx, business, intent, serp),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readArticleStrategy
  );

  return done(strategy, {
    angle: strategy.angle,
    promise: strategy.promise,
    adds: strategy.adds,
    // The evidence gate reads this list, and the writer only ever sees what
    // survived it. Recorded in state so the gate does not have to re-open the
    // strategy artifact to find out what it was asked to prove.
    proofRequired: strategy.proofRequired,
    // Whether the angle was formed against the live first page or without it.
    angleSawSerp: Boolean(serp && serp.competitors.length > 0),
  });
};
