/**
 * STAGE 14 — FACT CHECK
 *
 * Reads the finished draft and pulls out every sentence that asserts something
 * checkable — a number, a date, a price, a rule, a named study, a claim about the
 * business — then says, for each one, whether the material behind this run
 * actually supports it.
 *
 * The distinction that matters is between "unsupported" and "uncertain".
 * Unsupported means the material contradicts it or the claim was invented;
 * uncertain means nobody here can tell. Both are reported, neither is silently
 * rewritten, and the publish gate reads the counts. A stage that quietly deleted
 * the sentence would leave the user believing the page was checked when what
 * actually happened is that the evidence disappeared.
 *
 * This stage never edits the draft. The editor stage does that, from this report.
 */

import {
  readArticleDraft,
  readArticleStrategy,
  readBusinessProfile,
  readFactCheckReport,
  type BusinessProfile,
  type FactCheckReport,
} from "@/lib/article/artifacts";
import { stripHtml } from "@/lib/agents/workers/articleAssembly";
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
import { askJson } from "./router";
const SYSTEM = `You check a finished page against the material it was written from. You are not the writer and you do not rewrite anything.

Find every sentence that asserts something checkable: a number, a percentage, a price, a date, a duration, a legal or regulatory rule, a named study or organisation, a superlative ("the fastest", "the only"), a comparison, or a claim about the business publishing the page.

For each one, return:
- claim: the assertion, quoted or closely paraphrased.
- verdict:
  - "supported" — the material you were given establishes it.
  - "unsupported" — the material contradicts it, or the claim appears nowhere in the material and is the kind of fact that cannot be reasoned to. An invented statistic is unsupported.
  - "uncertain" — plausible and probably true, but nothing here establishes it.
- sourceUrl: the source that supports it, when the material names one. Omit it otherwise. Never write a URL that was not given to you.
- note: why. One sentence. A verdict with no reason is not a check.
- location: the heading of the section it appears in.

Also return unprovenBusinessFacts: claims the page makes about the business itself that the established facts do not prove — years trading, client names, certifications, team size, awards, guarantees.

Rules:
- General knowledge that needs no source is not a claim. "Concrete needs to cure" is not a claim. "Concrete needs 28 days to cure" is.
- Do not mark something unsupported because you personally do not know it. That is "uncertain".
- Do not invent a source to justify a verdict.
- If the page makes no checkable assertions at all, return an empty entries list.

Return JSON only:
{"entries":[{"claim":"...","verdict":"supported|unsupported|uncertain","sourceUrl":"...","note":"...","location":"..."}],"unprovenBusinessFacts":["..."]}`;

/** The material the check is run against. Nothing outside this counts as support. */
function materialLines(ctx: StageContext, business: BusinessProfile | null): string[] {
  const parts: string[] = [];
  if (business) {
    parts.push(
      `ESTABLISHED BUSINESS FACTS:\n${business.summary}${
        business.services.length ? `\nServices: ${business.services.join(", ")}` : ""
      }${business.proofPoints.length ? `\nDemonstrated: ${business.proofPoints.join("; ")}` : ""}${
        business.sourceUrls.length ? `\nRead from: ${business.sourceUrls.join(", ")}` : ""
      }`
    );
    if (business.unverified.length) {
      parts.push(`NOBODY CONFIRMED THESE:\n- ${business.unverified.join("\n- ")}`);
    }
  } else {
    parts.push("ESTABLISHED BUSINESS FACTS: none were established for this run.");
  }

  const verified = Array.isArray(ctx.state.verifiedClaims)
    ? ctx.state.verifiedClaims.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  parts.push(
    verified.length
      ? `FACTS VERIFIED AGAINST SOURCES EARLIER IN THIS RUN:\n- ${verified.slice(0, 40).join("\n- ")}`
      : "FACTS VERIFIED AGAINST SOURCES EARLIER IN THIS RUN: none. This run had no evidence pass, so any statistic, price, date or regulation in the page is at best uncertain."
  );
  return parts;
}
/** The draft as `## heading` + prose, split where its own H2s are. */
function toBlocks(html: string): { heading: string; text: string }[] {
  const parts = html.split(/(?=<h2)/i).filter((part) => part.trim());
  return parts
    .map((part) => {
      const match = part.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      const heading = match ? stripHtml(match[1]).replace(/\s+/g, " ").trim() : "";
      const text = stripHtml(match ? part.replace(match[0], "") : part)
        .replace(/\s+/g, " ")
        .trim();
      return { heading, text };
    })
    .filter((block) => block.text.length > 0 || block.heading.length > 0);
}

/** Blocks grouped into calls, so one long page does not become one huge prompt. */
const CHUNK_CHARS = 16_000;

function toChunks(blocks: { heading: string; text: string }[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const piece = `## ${block.heading || "(no heading)"}\n${block.text}`;
    if (current && current.length + piece.length > CHUNK_CHARS) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Merge two reports without letting one call's counts overwrite another's. */
function merge(into: FactCheckReport, add: FactCheckReport): FactCheckReport {
  const seen = new Set(into.entries.map((entry) => entry.claim.toLowerCase()));
  const entries = [...into.entries];
  for (const entry of add.entries) {
    const key = entry.claim.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return {
    entries,
    unsupported: entries.filter((entry) => entry.verdict === "unsupported").length,
    uncertain: entries.filter((entry) => entry.verdict === "uncertain").length,
    unprovenBusinessFacts: Array.from(
      new Set([...into.unprovenBusinessFacts, ...add.unprovenBusinessFacts])
    ),
  };
}
export const runFactCheckStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const draft = readArtifact(ctx, "write", readArticleDraft);
  if (!draft || !draft.html.trim()) {
    return blocked(
      "There is no draft to check — the writing stage produced nothing. Run this article again from the writing step."
    );
  }

  const business = readArtifact(ctx, "business", readBusinessProfile);
  const strategy = readArtifact(ctx, "strategy", readArticleStrategy);
  const material = materialLines(ctx, business);
  const chunks = toChunks(toBlocks(draft.html));

  let report: FactCheckReport = { entries: [], unsupported: 0, uncertain: 0, unprovenBusinessFacts: [] };
  const unchecked: string[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    if (outOfTime(ctx, 40_000)) {
      unchecked.push(...chunks.slice(index).map((chunk) => chunk.split("\n")[0].replace(/^##\s*/, "")));
      break;
    }
    assertLive(ctx);

    const part = await askJson(
      "reasoning",
      "Fact check",
      {
        system: SYSTEM,
        prompt: [
          `THE PAGE: ${draft.title}`,
          `The query it answers: ${ctx.brief.keyword}`,
          strategy?.proofRequired.length
            ? `THE PAGE COMMITTED TO PROVING THESE:\n- ${strategy.proofRequired.join("\n- ")}`
            : "",
          ...material,
          chunks.length > 1
            ? `THE PAGE, PART ${index + 1} OF ${chunks.length} — check only what is here:\n${chunks[index]}`
            : `THE PAGE:\n${chunks[index]}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        meter: ctx.meter,
        signal: ctx.signal,
      },
      readFactCheckReport
    );
    report = merge(report, part);
  }
  // Sections nobody got to are recorded as uncertain, in the report the user
  // reads, rather than left out of it. "Not checked" and "checked and fine" are
  // not the same thing and this is the only place that distinction can be made.
  for (const heading of unchecked) {
    report.entries.push({
      claim: `Nothing in "${heading}" was checked.`,
      verdict: "uncertain",
      note: "The fact check ran out of time before reaching this section, so no claim in it has been verified either way.",
      location: heading,
    });
  }
  if (unchecked.length) {
    report.uncertain = report.entries.filter((entry) => entry.verdict === "uncertain").length;
  }

  return done(report, {
    factsChecked: report.entries.length,
    factsUnsupported: report.unsupported,
    factsUncertain: report.uncertain,
    unprovenBusinessFacts: report.unprovenBusinessFacts,
    factCheckComplete: unchecked.length === 0,
  });
};
