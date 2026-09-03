/**
 * STAGE 9 — OUTLINE
 *
 * The plan the writer follows section by section, and the reason the writer never
 * has to decide what the article is about while it is writing prose.
 *
 * Two constraints make it more than a heading list. Every section carries the
 * reader question it answers — a section that cannot name one is padding, and the
 * prompt says so — and every `mustKnow` item from the intent stage has to be
 * covered by some section, which this stage checks itself rather than trusting.
 * An uncovered item is recorded on the run, so the score's completeness dimension
 * reads a fact instead of forming an opinion.
 *
 * Word targets are distributed here, not invented by the writer. They exist so a
 * 1,500-word brief does not come back as 4,000 words of the same point; they are
 * a planning input and no stage scores the article on hitting them.
 */

import {
  readArticleOutline,
  readArticleStrategy,
  readSearchIntent,
  readSerpResearch,
  type ArticleOutline,
  type ArticleStrategy,
  type SearchIntent,
  type SerpResearch,
} from "@/lib/article/artifacts";
import { briefWordTarget } from "@/lib/article/brief";
import { slugify } from "@/lib/agents/workers/articleAssembly";
import {
  blocked,
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askJson } from "./router";
const SYSTEM = `You plan a page that has already decided what it is arguing. You do not write it.

Produce:
- title: what the page is called. It must read like a person wrote it and must match the angle. Not the keyword with words bolted on.
- slug: lowercase, hyphens, no stop-word padding.
- directAnswer: the reader's question answered in one or two sentences, plainly, before any preamble. Someone who reads only this should already have the answer.
- sections: the page in order. Each has a heading, the reader question it answers, the specific points it makes, and a word target.
- faq: questions worth answering at the end that no section covers. Empty if none, or if you were told the page has no FAQ.

Rules you do not break:
- Every "must know" item you were given is covered by some section. If one is not, you have not finished.
- Every section names the reader question it answers. If you cannot name one, cut the section.
- Points are specific enough that a writer could not fill them with generalities. "Explain the benefits" is not a point.
- No section that exists to hold a keyword. No "Conclusion" that repeats the introduction.
- Do not plan a section that requires a fact nobody has verified. The angle's proof list is being checked separately.
- Word targets add up to roughly the total you were given, and no single section takes more than a third of it.

Return JSON only:
{"title":"...","slug":"...","directAnswer":"...","sections":[{"heading":"...","readerQuestion":"...","points":["..."],"wordTarget":000}],"faq":["..."]}`;

/** Headings that already rank, so the outline is planned against them, not blind. */
function serpLines(serp: SerpResearch | null): string {
  if (!serp || serp.competitors.length === 0) {
    return `HOW THE RANKING PAGES ARE STRUCTURED: ${serp?.note || "not read on this run"}.`;
  }
  const lines = serp.competitors
    .slice(0, 6)
    .map((row, index) => {
      const headings = row.headings.length
        ? row.headings.slice(0, 12).join(" | ")
        : "(headings could not be read)";
      return `${index + 1}. ${row.title || row.url}\n   ${headings}`;
    })
    .join("\n");
  return `HOW THE RANKING PAGES ARE STRUCTURED (cover what matters, do not copy the order):\n${lines}`;
}
function prompt(
  ctx: StageContext,
  strategy: ArticleStrategy,
  intent: SearchIntent,
  serp: SerpResearch | null,
  words: number
): string {
  const parts: string[] = [
    `Query: ${ctx.brief.keyword}`,
    `Total length to plan for: about ${words} words`,
    ctx.brief.enableFaq
      ? "The page has an FAQ block at the end."
      : "The page has no FAQ block. Return faq as an empty list.",
  ];
  if (ctx.brief.title) parts.push(`Working title the user typed (improve it if it is weak): ${ctx.brief.title}`);
  if (ctx.brief.language) parts.push(`Written in: ${ctx.brief.language}`);
  if (ctx.brief.pointOfView) parts.push(`Point of view: ${ctx.brief.pointOfView}`);
  if (ctx.brief.tone) parts.push(`Voice: ${ctx.brief.tone}`);

  parts.push(
    `THE POSITION THIS PAGE TAKES:\nAngle: ${strategy.angle}\nPromise to the reader: ${strategy.promise}\nWhat this page adds that the others do not:\n- ${strategy.adds.join("\n- ")}${
      strategy.targetReader ? `\nWritten for: ${strategy.targetReader}` : ""
    }${strategy.businessTieIn ? `\nWhere the business belongs: ${strategy.businessTieIn}` : ""}`
  );

  parts.push(
    `WHAT THE READER MUST KNOW BY THE LAST LINE (every one of these is covered by a section):\n- ${intent.mustKnow.join("\n- ")}`
  );
  if (intent.questions.length) {
    parts.push(`THEY ARRIVE ASKING:\n- ${intent.questions.join("\n- ")}`);
  }
  if (intent.expectedFormat) {
    parts.push(`THE FORMAT THIS QUERY EXPECTS: ${intent.expectedFormat}`);
  }
  if (strategy.proofRequired.length) {
    parts.push(
      `FACTS BEING VERIFIED SEPARATELY (plan for them, but no section may depend on one that fails):\n- ${strategy.proofRequired.join("\n- ")}`
    );
  }

  parts.push(serpLines(serp));
  if (serp?.peopleAlsoAsk.length) {
    parts.push(`QUESTIONS GOOGLE SHOWS ALONGSIDE:\n- ${serp.peopleAlsoAsk.slice(0, 12).join("\n- ")}`);
  }
  return parts.join("\n\n");
}
/**
 * Word targets that add up.
 *
 * A model asked for a per-section budget returns numbers that sum to anything, so
 * the sum is fixed here rather than left for the writer to discover. Even split
 * when it gave nothing, proportional when it gave a shape worth keeping, and no
 * section over a third of the page.
 */
function distributeWords(sections: ArticleOutline["sections"], total: number): ArticleOutline["sections"] {
  const cap = Math.max(120, Math.round(total / 3));
  const given = sections.map((section) => (section.wordTarget > 0 ? section.wordTarget : 0));
  const sum = given.reduce((a, b) => a + b, 0);
  const even = Math.max(80, Math.round(total / Math.max(1, sections.length)));

  return sections.map((section, index) => {
    const raw = sum > 0 ? Math.round((given[index] / sum) * total) : even;
    return { ...section, wordTarget: Math.min(cap, Math.max(80, raw || even)) };
  });
}

const COVERAGE_SYSTEM = `You check an outline against a list of things a reader must know.

For each item, name the heading that covers it. If no section covers it, return "NONE" for that item. Judge on whether a reader would find the answer there, not on wording.

Return JSON only, one entry per item, in the order given:
{"coverage":[{"item":"...","heading":"..."}]}`;

/** The coverage answer, or null when the shape is unusable. */
function readCoverage(value: unknown): { item: string; heading: string }[] | null {
  const raw = (value as Record<string, unknown> | null) || null;
  const list = raw && Array.isArray(raw.coverage) ? raw.coverage : null;
  if (!list || list.length === 0) return null;
  return list
    .map((row) => {
      const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        item: String(entry.item ?? "").trim(),
        heading: String(entry.heading ?? "").trim(),
      };
    })
    .filter((row) => row.item.length > 0);
}
/**
 * Which "must know" items the outline actually covers.
 *
 * A separate, cheap call rather than the outline's own word for it: a model asked
 * "did you cover everything?" in the same breath as "write the outline" says yes.
 * Returns null when the check itself could not run, and the caller records that as
 * unchecked rather than as covered.
 */
async function checkCoverage(
  ctx: StageContext,
  outline: ArticleOutline,
  mustKnow: string[]
): Promise<string[] | null> {
  if (mustKnow.length === 0) return [];
  const headings = outline.sections
    .map((section) => `- ${section.heading} — answers: ${section.readerQuestion || "(not stated)"}`)
    .join("\n");
  try {
    const answer = await askJson(
      "fast",
      "Outline coverage",
      {
        system: COVERAGE_SYSTEM,
        prompt: `MUST KNOW:\n${mustKnow.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nSECTIONS:\n${headings}${
          outline.faq.length ? `\n\nFAQ AT THE END:\n- ${outline.faq.join("\n- ")}` : ""
        }`,
        meter: ctx.meter,
        signal: ctx.signal,
      },
      readCoverage
    );
    const covered = new Set(
      answer
        .filter((row) => row.heading && !/^none$/i.test(row.heading))
        .map((row) => row.item.toLowerCase())
    );
    return mustKnow.filter((item) => !covered.has(item.toLowerCase()));
  } catch {
    if (ctx.signal?.aborted) throw Object.assign(new Error("The run was stopped."), { isCancelled: true });
    return null;
  }
}
export const runOutlineStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const strategy = readArtifact(ctx, "strategy", readArticleStrategy);
  if (!strategy) {
    return blocked(
      "There is no angle to outline against — the strategy stage produced nothing usable. Run this article again from the strategy step."
    );
  }
  const intent = readArtifact(ctx, "intent", readSearchIntent);
  const serp = readArtifact(ctx, "serp", readSerpResearch);
  const words = briefWordTarget(ctx.brief);
  const mustKnow = intent?.mustKnow || [];

  const planned: ArticleOutline = await askJson(
    "reasoning",
    "Outline",
    {
      system: SYSTEM,
      prompt: prompt(ctx, strategy, intent || { kind: "informational", readerProblem: ctx.brief.keyword, mustKnow: [], questions: [], expectedFormat: "" }, serp, words),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readArticleOutline
  );

  const outline: ArticleOutline = {
    ...planned,
    // Always through the shared slugifier: a model asked for a slug sometimes
    // returns a sentence, and the URL is not the place to find that out.
    slug: slugify(planned.slug || planned.title),
    sections: distributeWords(planned.sections, words),
    // The brief decides whether there is an FAQ, not the model.
    faq: ctx.brief.enableFaq ? planned.faq : [],
  };

  const uncovered = await checkCoverage(ctx, outline, mustKnow);

  return done(outline, {
    outlineTitle: outline.title,
    outlineSlug: outline.slug,
    sectionCount: outline.sections.length,
    plannedWords: outline.sections.reduce((sum, section) => sum + section.wordTarget, 0),
    faqCount: outline.faq.length,
    // Read by the score's completeness dimension and by the publish gate. Null
    // means the check could not run — not that everything is covered.
    mustKnowUncovered: uncovered,
    mustKnowChecked: uncovered !== null,
  });
};
