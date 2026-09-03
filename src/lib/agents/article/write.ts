/**
 * STAGE 12 — WRITE
 *
 * Section by section, not in one call. Three reasons, all learned the hard way:
 * a single call for a 2,500-word page returns 900 words and claims otherwise; a
 * model writing the whole page at once repeats itself across sections it cannot
 * see; and the platform kills the function at 300 seconds, so a run has to be
 * able to stop cleanly and report which sections it did not reach.
 *
 * Each section is written with the sections already written in front of it, so it
 * can be told not to repeat them, and with the outline's own points as the thing
 * it must actually say. The word count on the artifact is measured from the HTML
 * that came back — never the model's claim about how much it wrote.
 *
 * `unfinished` is the honest half of this stage. A run that ran out of time
 * returns the sections it wrote and names the ones it did not, and the publish
 * gate refuses a draft that still has any.
 */

import {
  readArticleDraft,
  readArticleOutline,
  readArticleStrategy,
  readBusinessProfile,
  readSearchIntent,
  type ArticleDraft,
  type ArticleOutline,
  type ArticleStrategy,
  type BusinessProfile,
  type OutlineSection,
} from "@/lib/article/artifacts";
import { countHtmlWords, sanitizeModelHtml, stripHtml } from "@/lib/agents/workers/articleAssembly";
import {
  assertLive,
  blocked,
  done,
  outOfTime,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askText } from "./router";
const SYSTEM = `You write one section of a page, in HTML, for a business publishing under its own name.

How you write:
- Answer first. The first sentence of the section earns the heading; the explanation follows it.
- Concrete over general. A number, a name, a step, a condition. If you cannot be concrete about a point, say what is actually known and move on.
- Short sentences carry the load. Vary the length because that is how people write, not to hit a rhythm.
- Address the reader as "you" where it is natural. Never address them as "we" unless the point is about the business.
- Second person about the reader, first person plural only for the business.

What you never do:
- Never open with "In today's fast-paced world", "In the ever-evolving landscape", "It is important to note", "Let's dive in", or any variation.
- Never state a business fact you were not given. No client names, no years in business, no certifications, no statistics of your own.
- Never state a statistic, price, date or regulation as fact unless it is in the material you were given. If the point needs one you do not have, write what is verifiable and leave the number out.
- Never repeat a point an earlier section already made. You are shown what has been written.
- No filler transitions ("Furthermore", "Moreover", "In conclusion"). No summary paragraph at the end of a section.
- No headings other than the one you were given. No H1.

Format:
- Start with the section's heading as an <h2>. Sub-points may use <h3>.
- Body in <p>. Lists in <ul>/<ol> only where the content is genuinely a list. Tables in <table> where the content is genuinely tabular.
- Bold with <strong> for the thing a skimmer needs, not for emphasis.
- Return HTML only. No markdown fences, no commentary, no preamble.`;

/** What has been written already, trimmed to its text so it fits in a prompt. */
function alreadyWritten(sections: { heading: string; html: string }[]): string {
  if (sections.length === 0) return "";
  const summary = sections
    .map((section) => `## ${section.heading}\n${stripHtml(section.html).slice(0, 700)}`)
    .join("\n\n");
  return `ALREADY WRITTEN — do not repeat any of it, do not re-introduce the topic:\n${summary.slice(0, 9_000)}`;
}
/** Claims the evidence gate cleared. Empty in quick mode, which has no gate. */
function verifiedClaims(ctx: StageContext): string[] {
  const found = ctx.state.verifiedClaims;
  if (!Array.isArray(found)) return [];
  return found.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 30);
}

function voiceLines(ctx: StageContext): string[] {
  const brand = ctx.workspace.brand;
  const lines: string[] = [];
  const voice = ctx.brief.tone || brand.tone;
  if (voice) lines.push(`Voice: ${voice}`);
  if (ctx.brief.pointOfView) lines.push(`Point of view: ${ctx.brief.pointOfView}`);
  if (ctx.brief.language) lines.push(`Language: write in ${ctx.brief.language}`);
  if (brand.writingRules) lines.push(`House rules: ${brand.writingRules}`);
  if (brand.forbiddenWords.length) {
    lines.push(`Words this business never uses: ${brand.forbiddenWords.join(", ")}`);
  }
  return lines;
}

function sectionPrompt(
  ctx: StageContext,
  outline: ArticleOutline,
  strategy: ArticleStrategy,
  business: BusinessProfile | null,
  section: OutlineSection,
  index: number,
  written: { heading: string; html: string }[]
): string {
  const first = index === 0;
  const last = index === outline.sections.length - 1;
  const parts: string[] = [
    `THE PAGE: ${outline.title}`,
    `The query it answers: ${ctx.brief.keyword}`,
    `Angle: ${strategy.angle}`,
    `Promise to the reader: ${strategy.promise}`,
  ];
  const voice = voiceLines(ctx);
  if (voice.length) parts.push(voice.join("\n"));

  parts.push(
    `WRITE THIS SECTION:\nHeading: ${section.heading}\nThe reader question it answers: ${
      section.readerQuestion || "(not stated — answer the heading)"
    }\nPoints it must make:\n- ${section.points.join("\n- ")}\nLength: about ${section.wordTarget} words`
  );

  if (first) {
    parts.push(
      `This is the opening section. Answer the query in the first two sentences — this is the answer someone should get without scrolling:\n${outline.directAnswer || "(no direct answer was planned; write one)"}`
    );
  }
  if (last) {
    parts.push(
      strategy.businessTieIn
        ? `This is the final section. Where the business legitimately belongs: ${strategy.businessTieIn}. One mention, in context, no sales pitch.`
        : "This is the final section. Close on the reader's decision, not on a summary."
    );
  }
  if (business) {
    parts.push(
      `THE BUSINESS (the only business facts you may state):\n${business.summary}${
        business.services.length ? `\nServices: ${business.services.join(", ")}` : ""
      }${business.proofPoints.length ? `\nDemonstrated: ${business.proofPoints.join("; ")}` : ""}`
    );
    if (business.unverified.length) {
      parts.push(`NOBODY HAS CONFIRMED THESE — they do not go in the page:\n- ${business.unverified.join("\n- ")}`);
    }
  }

  const evidence = verifiedClaims(ctx);
  parts.push(
    evidence.length
      ? `VERIFIED FACTS YOU MAY STATE (each was checked against its source):\n- ${evidence.join("\n- ")}`
      : "VERIFIED FACTS: none were supplied for this run. Do not introduce statistics, prices, dates or regulations as fact."
  );

  const already = alreadyWritten(written);
  if (already) parts.push(already);

  parts.push(
    `THE FULL OUTLINE, so you know what is covered elsewhere and must not cover here:\n${outline.sections
      .map((row, i) => `${i + 1}. ${row.heading}${i === index ? "  <-- you are writing this one" : ""}`)
      .join("\n")}`
  );

  return parts.join("\n\n");
}
/**
 * Where a second attempt picks up.
 *
 * A run that hit the time ceiling stored what it had written and named the
 * sections it did not reach. Sections are written in order, so the first
 * unfinished heading is where to start again — and the prose already paid for is
 * kept rather than rewritten.
 */
function resumeFrom(
  outline: ArticleOutline,
  prior: ArticleDraft | null
): { html: string; startAt: number } {
  if (!prior || prior.unfinished.length === 0 || !prior.html.trim()) {
    return { html: "", startAt: 0 };
  }
  const missing = new Set(prior.unfinished.map((heading) => heading.toLowerCase()));
  const startAt = outline.sections.findIndex((section) => missing.has(section.heading.toLowerCase()));
  if (startAt <= 0) return { html: "", startAt: 0 };
  return { html: prior.html, startAt };
}

/** The first real sentence or two of the page, for the meta description to build on. */
function excerptFrom(html: string): string {
  const text = stripHtml(html).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const cut = text.slice(0, 200);
  const stop = cut.lastIndexOf(". ");
  return (stop > 80 ? cut.slice(0, stop + 1) : cut).trim();
}

/** One section, written. Empty means the model returned nothing usable. */
async function writeSection(
  ctx: StageContext,
  outline: ArticleOutline,
  strategy: ArticleStrategy,
  business: BusinessProfile | null,
  section: OutlineSection,
  index: number,
  written: { heading: string; html: string }[]
): Promise<string> {
  const prompt = sectionPrompt(ctx, outline, strategy, business, section, index, written);
  const system = ctx.brief.humanize
    ? `${SYSTEM}\n\nBefore you return it, read it back and cut any sentence that reads like it was assembled from a template rather than written by someone who knows the subject.`
    : SYSTEM;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    assertLive(ctx);
    const raw = await askText("writing", { system, prompt, meter: ctx.meter, signal: ctx.signal });
    const html = sanitizeModelHtml(raw);
    if (countHtmlWords(html) >= 40) return html;
  }
  return "";
}
/** A writing call is the most expensive thing here, so it needs real headroom. */
const SECTION_BUDGET_MS = 55_000;

export const runWriteStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const outline = readArtifact(ctx, "outline", readArticleOutline);
  if (!outline) {
    return blocked(
      "There is no outline to write from — the outline stage produced nothing usable. Run this article again from the outline step."
    );
  }
  const strategy = readArtifact(ctx, "strategy", readArticleStrategy);
  if (!strategy) {
    return blocked(
      "There is no angle to write towards — the strategy stage produced nothing usable. Run this article again from the strategy step."
    );
  }
  const business = readArtifact(ctx, "business", readBusinessProfile);
  const intent = readArtifact(ctx, "intent", readSearchIntent);

  const { html: carried, startAt } = resumeFrom(outline, readArtifact(ctx, "write", readArticleDraft));
  const written: { heading: string; html: string }[] = [];
  const unfinished: string[] = [];
  let body = carried;
  let sectionsWritten = startAt;

  if (carried) {
    written.push({ heading: "earlier sections of this page", html: carried });
  }

  for (let index = startAt; index < outline.sections.length; index += 1) {
    const section = outline.sections[index];

    // The platform kills the function at 300 seconds. Stopping here with the
    // remaining headings named is recoverable; being killed mid-call is not.
    if (outOfTime(ctx, SECTION_BUDGET_MS)) {
      unfinished.push(...outline.sections.slice(index).map((row) => row.heading));
      break;
    }

    const html = await writeSection(ctx, outline, strategy, business, section, index, written);
    if (!html) {
      unfinished.push(section.heading);
      continue;
    }
    body = body ? `${body}\n\n${html}` : html;
    written.push({ heading: section.heading, html });
    sectionsWritten += 1;
  }
  const draft: ArticleDraft = {
    title: outline.title,
    html: body,
    excerpt: excerptFrom(body),
    // Measured from the HTML that came back. The model's own claim about how
    // much it wrote is not a number anybody should store.
    wordCount: countHtmlWords(body),
    sectionCount: sectionsWritten,
    unfinished,
  };

  // Nothing at all came back. There is no draft to check, score or fix.
  if (draft.wordCount === 0) {
    return blocked(
      `Not one section could be written — ${outline.sections.length} were planned and every attempt came back empty. This is usually the model provider refusing the request; try again, and if it repeats, the run needs a different angle or a shorter brief.`,
      draft
    );
  }

  // Written, but not all of it. Blocked rather than done: the next attempt
  // resumes from this artifact instead of rewriting what is already paid for,
  // and the publish gate never sees a page with a hole in it.
  if (unfinished.length > 0) {
    return blocked(
      `${sectionsWritten} of ${outline.sections.length} sections are written (${draft.wordCount} words). These are not: ${unfinished.join(", ")}. Continue this run to write them — the finished sections are kept.`,
      draft
    );
  }

  return done(draft, {
    draftWordCount: draft.wordCount,
    draftSections: draft.sectionCount,
    draftTitle: draft.title,
    // Read by the score's completeness dimension alongside the outline's own
    // coverage check. Length is not a quality signal and nothing scores it.
    plannedVsWritten: `${draft.wordCount} written against a plan of ${outline.sections.reduce((sum, row) => sum + row.wordTarget, 0)}`,
    mustKnowCount: intent?.mustKnow.length ?? 0,
  });
};
