/**
 * STAGE 15 — TRUST SIGNALS
 *
 * Six things a reader uses to decide whether to believe a page: first-hand
 * experience, named expertise, sourced claims, specifics, transparency about what
 * it does not know, and currency. Each one is present or absent, and either way the
 * report names the passage or names what is missing.
 *
 * The score is not asked for. `computeTrustScore` sums the weights of the signals
 * marked present, in the guard, because a model asked "how trustworthy is this
 * page?" returns a number with nothing under it — and a page's trustworthiness is
 * the worst possible thing to take on trust. Every signal the check returned no
 * verdict for is written into the report as unjudged rather than dropped, so six
 * rows are always shown and a silence is never read as a pass.
 *
 * `unsupportedExperience` is the list that matters. A page saying "we have laid
 * 4,000 floors" when nothing on this run established that is a false statement
 * about a real company, published under its name. It is seeded from the fact
 * check's own list of unproven business facts so the two reports cannot disagree,
 * and the publish gate reads it.
 *
 * This stage never edits the draft.
 */

import {
  computeTrustScore,
  readArticleDraft,
  readArticleStrategy,
  readBusinessProfile,
  readFactCheckReport,
  readTrustReport,
  TRUST_SIGNALS,
  type BusinessProfile,
  type FactCheckReport,
  type TrustReport,
  type TrustSignal,
} from "@/lib/article/artifacts";
import {
  assertLive,
  blocked,
  businessLines,
  done,
  outOfTime,
  readArtifact,
  skipped,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { blocksAsText, draftBlocks } from "./draftBlocks";
import { askJson } from "./router";

/** How much of the draft the check reads. Long enough for a full article. */
const DRAFT_CHARS = 14_000;
/** One call, with room to assemble the report afterwards. */
const TRUST_BUDGET_MS = 40_000;

const SIGNAL_KEYS = TRUST_SIGNALS.map((signal) => signal.key);

const SYSTEM = `You judge whether a page gives a reader reason to believe it. You are not the writer and you do not rewrite anything.

Return one entry for each of these six signals, using the key exactly as written:
${TRUST_SIGNALS.map((signal) => `- ${signal.key} — ${signal.label}: ${signal.hint}`).join("\n")}

For each:
- key: the key above.
- present: true only if the page actually does it. Intending to, or sounding like it, is not doing it.
- note: what is there, quoted or closely described, or what is absent. Specific either way. "Names the 28-day cure time and where that comes from" is a note. "Good detail" is not.
- location: the heading it was found under. Only when present is true.

Also return:
- unsupportedExperience: every claim the page makes about the business or its work that the established facts do not prove — years trading, job counts, client names, certifications, awards, guarantees, "we have seen", "in our experience". Quote the page. This list is the point of the check: a page cannot borrow authority it has not been given.
- missing: what to add, strongest first. One line each, addressed to whoever edits the page.

Rules you do not break:
- Judge the page in front of you against the material you were given. Nothing else counts as support.
- First-hand experience means something only someone who has done the work would write. A confident tone is not experience.
- Sourced means the page carries the source. A number with no source is not sourced, however plausible it is.
- Do not mark transparency present because the page hedges everything. Saying what it does not know is transparency; vagueness is the opposite.
- A signal you cannot judge is absent, with the note saying why.

Return JSON only:
{"signals":[{"key":"experience","present":true,"note":"...","location":"..."}],"unsupportedExperience":["..."],"missing":["..."]}`;

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

interface Judged {
  signals: TrustSignal[];
  unsupportedExperience: string[];
  missing: string[];
}

/** The verdicts, or null when not one recognised signal came back with a reason. */
function readJudged(value: unknown): Judged | null {
  const raw = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!raw) return null;
  const list = Array.isArray(raw.signals) ? raw.signals : [];
  const seen = new Set<string>();
  const signals: TrustSignal[] = [];
  for (const row of list.slice(0, 24)) {
    const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const key = text(entry.key).toLowerCase();
    const note = text(entry.note);
    if (!SIGNAL_KEYS.includes(key) || !note || seen.has(key)) continue;
    seen.add(key);
    const location = text(entry.location);
    signals.push({
      key,
      present: entry.present === true,
      note,
      ...(location ? { location } : {}),
    });
  }
  if (signals.length === 0) return null;
  return {
    signals,
    unsupportedExperience: (Array.isArray(raw.unsupportedExperience) ? raw.unsupportedExperience : [])
      .map((item) => text(item))
      .filter(Boolean)
      .slice(0, 20),
    missing: (Array.isArray(raw.missing) ? raw.missing : [])
      .map((item) => text(item))
      .filter(Boolean)
      .slice(0, 12),
  };
}

/**
 * The six signals, in the order they are weighted, with the unjudged ones stated.
 *
 * A signal nobody returned a verdict for is written in as absent and says so. It
 * costs the page its weight, which is the honest direction: an unjudged signal is
 * not evidence that the page has it.
 */
function allSix(judged: TrustSignal[]): TrustSignal[] {
  const found = new Map(judged.map((signal) => [signal.key, signal]));
  return TRUST_SIGNALS.map(
    (spec) =>
      found.get(spec.key) ?? {
        key: spec.key,
        present: false,
        note: `The trust check returned no verdict for ${spec.label.toLowerCase()}, so it is not counted as present. Nothing here says the page lacks it.`,
      }
  );
}

/** Deduplicated, keeping the first wording of each claim. */
function mergeClaims(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.slice(0, 20);
}

/** The material the judgement is made against. Nothing outside it counts. */
function materialLines(
  ctx: StageContext,
  business: BusinessProfile | null,
  facts: FactCheckReport | null
): string[] {
  const parts: string[] = [];

  if (business) {
    parts.push(
      `ESTABLISHED BUSINESS FACTS — the only things the page may state about itself:\n${business.summary}${
        business.services.length ? `\nServices: ${business.services.join(", ")}` : ""
      }${business.proofPoints.length ? `\nDemonstrated: ${business.proofPoints.join("; ")}` : ""}${
        business.sourceUrls.length ? `\nRead from: ${business.sourceUrls.join(", ")}` : ""
      }`
    );
    if (business.unverified.length) {
      parts.push(
        `NOBODY CONFIRMED THESE — if the page states one as fact, it belongs in unsupportedExperience:\n- ${business.unverified.join(
          "\n- "
        )}`
      );
    }
  } else {
    const onFile = businessLines(ctx.workspace);
    parts.push(
      onFile.length
        ? `WHAT THE OWNER HAS FILLED IN — nothing beyond this is established:\n${onFile.join("\n")}`
        : "ESTABLISHED BUSINESS FACTS: none were established for this run, so every claim the page makes about the business is unsupported."
    );
  }

  const verified = Array.isArray(ctx.state.verifiedClaims)
    ? ctx.state.verifiedClaims.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  parts.push(
    verified.length
      ? `FACTS VERIFIED AGAINST SOURCES EARLIER IN THIS RUN — a claim from this list is sourced:\n- ${verified
          .slice(0, 40)
          .join("\n- ")}`
      : "FACTS VERIFIED AGAINST SOURCES EARLIER IN THIS RUN: none. No number, price, date or rule on this page has been checked against a source, which is what \"sourcing\" asks about."
  );

  if (facts) {
    if (facts.unprovenBusinessFacts.length) {
      parts.push(
        `THE FACT CHECK ALREADY FOUND THESE UNPROVEN — repeat them in unsupportedExperience:\n- ${facts.unprovenBusinessFacts.join(
          "\n- "
        )}`
      );
    }
    const unsupported = facts.entries.filter((entry) => entry.verdict === "unsupported").slice(0, 12);
    if (unsupported.length) {
      parts.push(
        `THE FACT CHECK COULD NOT SUPPORT THESE CLAIMS:\n- ${unsupported
          .map((entry) => `${entry.claim} (${entry.note})`)
          .join("\n- ")}`
      );
    }
  } else {
    parts.push(
      "FACT CHECK: none ran on this page, so nothing it asserts has been verified either way."
    );
  }
  return parts;
}

export const runEeatStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const draft = readArtifact(ctx, "write", readArticleDraft);
  if (!draft || !draft.html.trim()) {
    return blocked(
      "There is no draft to check for trust signals — the writing stage produced nothing. Run this article again from the writing step."
    );
  }

  if (outOfTime(ctx, TRUST_BUDGET_MS)) {
    // No number is better than a number nobody produced. A trust score of 0,
    // recorded because a clock ran out, would read as a judgement of the page.
    return skipped(
      "There was no time left in this request to check the page's trust signals, so none were judged and no trust score was recorded."
    );
  }
  assertLive(ctx);

  const business = readArtifact(ctx, "business", readBusinessProfile);
  const facts = readArtifact(ctx, "factcheck", readFactCheckReport);
  const strategy = readArtifact(ctx, "strategy", readArticleStrategy);

  const judged = await askJson(
    "reasoning",
    "Trust signals",
    {
      system: SYSTEM,
      prompt: [
        `THE PAGE: ${draft.title}`,
        `The query it answers: ${ctx.brief.keyword}`,
        strategy?.proofRequired.length
          ? `THE PAGE COMMITTED TO PROVING THESE — check whether it did:\n- ${strategy.proofRequired.join(
              "\n- "
            )}`
          : "",
        ...materialLines(ctx, business, facts),
        `THE PAGE:\n${blocksAsText(draftBlocks(draft.html), DRAFT_CHARS)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readJudged
  );

  const signals = allSix(judged.signals);
  const report: TrustReport = {
    // Recomputed by the guard from the rows below. Stated here so the artifact is
    // whole before it is checked, not so the number comes from two places.
    score: computeTrustScore(signals),
    signals,
    // The fact check's list first: those claims were already tested against the
    // material, and a trust report that quietly dropped one would let the gate and
    // the trust card show different counts of the same problem.
    unsupportedExperience: mergeClaims(
      facts?.unprovenBusinessFacts ?? [],
      judged.unsupportedExperience
    ),
    missing: judged.missing,
  };
  const checked = readTrustReport(report) || report;

  const absent = checked.signals.filter((signal) => !signal.present).map((signal) => signal.key);
  return done(checked, {
    trustSignalScore: checked.score,
    trustSignalsPresent: checked.signals.filter((signal) => signal.present).map((signal) => signal.key),
    trustSignalsAbsent: absent,
    // Read by the publish gate and by the editor stage. The gate blocks on it.
    unsupportedExperience: checked.unsupportedExperience,
    trustMissing: checked.missing.slice(0, 6),
    trustSignalsJudged: judged.signals.length,
  });
};
