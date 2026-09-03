/**
 * TRENDING TOPIC SUGGESTIONS FROM BRAND DNA
 *
 * The old suggestion step asked the model for "4 trending keywords" and, when
 * that failed, returned `best <industry> solutions for 2026` — a made-up phrase
 * with no evidence anyone searches it. Nothing here is invented:
 *
 *   1. the model turns the workspace's Brand DNA into seed queries its audience
 *      would actually type (this is the only step that is pure inference),
 *   2. each seed is run through Google via Serper, and the harvested
 *      `relatedSearches` and `peopleAlsoAsk` are REAL queries Google surfaced,
 *   3. the model then picks from that real pool and writes the angle and title,
 *      and is told it may not add a keyword that is not in the pool.
 *
 * Without a Serper key there is no pool, so the ideas come back flagged
 * `brand-model` with a warning that they were not checked against live search —
 * the caller shows that instead of pretending the list is validated.
 */

import { fetchSerpAnalysis, type SerpAnalysis } from "@/actions/serp";
import { hasSerperKey, SERPER_MISSING_MESSAGE } from "@/lib/apiKeys";
import { MODELS, vertexProvider } from "@/lib/agents/llm";

export interface TopicBrandContext {
  brandName?: string;
  industry?: string;
  targetAudience?: string;
  tone?: string;
  missionVision?: string;
  writingStyle?: string;
  /** Customer problems the business says it solves — the best seed-query source. */
  customerProblems?: string;
  /** Why customers pick this business over the alternatives. */
  differentiator?: string;
  /** The offer an article should lead towards. */
  ctaOffer?: string;
  forbiddenWords?: string[];
  /** Titles already published, so the same article is not suggested twice. */
  existingTitles?: string[];
  targetCountry?: string;
  /** What the user typed, when they have a direction in mind. */
  seedHint?: string;
}

export interface TopicIdea {
  keyword: string;
  title: string;
  /** Why this brand in particular can win the query. */
  angle: string;
  searchIntent: string;
  /** The E-E-A-T pillar the brand's own experience covers here. */
  pillar: string;
  /** Where the keyword came from. `brand-model` means unvalidated inference. */
  source: "google-related" | "google-paa" | "brand-model";
  /** Real People-Also-Ask questions attached to this topic, if Google returned any. */
  questions: string[];
}

export interface TopicIdeasResult {
  ideas: TopicIdea[];
  /** Seed queries the pool was harvested from, so the user can see the reasoning. */
  seeds: string[];
  /** How many real Google queries the ideas were chosen from. 0 = unvalidated. */
  poolSize: number;
  warnings: string[];
}

const TOPIC_MODEL = MODELS.ARTICLE_GENERATOR;
const PILLARS = ["Experience", "Expertise", "Authoritativeness", "Trustworthiness"];

function brandBlock(ctx: TopicBrandContext): string {
  const lines = [
    ctx.brandName ? `Brand: ${ctx.brandName}` : "",
    ctx.industry ? `Industry: ${ctx.industry}` : "",
    ctx.targetAudience ? `Audience: ${ctx.targetAudience}` : "",
    ctx.tone ? `Tone: ${ctx.tone}` : "",
    ctx.writingStyle ? `Writing style: ${ctx.writingStyle}` : "",
    ctx.missionVision ? `Mission: ${ctx.missionVision}` : "",
    ctx.customerProblems ? `Customer problems they solve: ${ctx.customerProblems}` : "",
    ctx.differentiator ? `Why customers choose them: ${ctx.differentiator}` : "",
    ctx.ctaOffer ? `Their offer: ${ctx.ctaOffer}` : "",
    ctx.forbiddenWords?.length ? `Words the brand never uses: ${ctx.forbiddenWords.join(", ")}` : "",
    ctx.targetCountry && ctx.targetCountry !== "WW" ? `Primary market: ${ctx.targetCountry}` : "",
    ctx.seedHint ? `The user is thinking about: ${ctx.seedHint}` : "",
    ctx.existingTitles?.length
      ? `Already published (do not repeat these): ${ctx.existingTitles.slice(0, 25).join(" | ")}`
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}

async function callJson(system: string, user: string, temperature: number): Promise<any> {
  return vertexProvider.generateJSON(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { modelName: TOPIC_MODEL, temperature }
  );
}

/** Seed queries the audience would type. Inference, and labelled as such. */
export async function deriveSeedQueries(
  ctx: TopicBrandContext,
  count = 3
): Promise<string[]> {
  const system =
    "You turn a brand profile into the search queries its customers really type. " +
    "You answer with JSON only.";
  const user = `${brandBlock(ctx)}

Write ${count} short Google search queries this brand's audience would type when they have a problem this brand solves.

RULES
- 2 to 5 words each. Queries, not titles. No brand names, no years, no punctuation.
- Cover different stages: one problem-aware, one solution-comparing, one how-to.
- Plain language the audience uses, not industry jargon they would not search.

Return JSON: {"queries":["...","...","..."]}`;

  try {
    const raw = await callJson(system, user, 0.5);
    const queries = Array.isArray(raw?.queries) ? raw.queries : [];
    return queries
      .map((q: any) => String(q || "").trim().replace(/["?]/g, ""))
      .filter((q: string) => q.length >= 3 && q.split(/\s+/).length <= 8)
      .slice(0, count);
  } catch {
    return [];
  }
}

interface PoolEntry {
  query: string;
  source: "google-related" | "google-paa";
}

/** The real queries Google returned around the seeds, deduplicated. */
export function buildQueryPool(analyses: SerpAnalysis[]): PoolEntry[] {
  const seen = new Set<string>();
  const pool: PoolEntry[] = [];

  const push = (query: string, source: PoolEntry["source"]) => {
    const value = String(query || "").trim();
    if (value.length < 4) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ query: value, source });
  };

  for (const analysis of analyses) {
    for (const related of analysis.relatedSearches || []) push(related, "google-related");
    for (const question of analysis.peopleAlsoAsk || []) push(question, "google-paa");
  }
  return pool;
}

function normalizeIdeas(
  raw: any,
  pool: PoolEntry[],
  count: number
): { ideas: TopicIdea[]; dropped: number } {
  const rows = Array.isArray(raw?.topics) ? raw.topics : Array.isArray(raw) ? raw : [];
  const bySource = new Map(pool.map((p) => [p.query.toLowerCase(), p.source]));
  const ideas: TopicIdea[] = [];
  let dropped = 0;

  for (const row of rows) {
    const keyword = String(row?.keyword || "").trim();
    if (!keyword) continue;

    // A keyword the pool never contained is inference, and is labelled that way.
    const matched = bySource.get(keyword.toLowerCase());
    if (!matched && pool.length > 0) {
      dropped++;
      continue;
    }

    const title = String(row?.title || "").trim() || keyword;
    const pillar = PILLARS.includes(String(row?.pillar)) ? String(row.pillar) : PILLARS[1];
    const questions = Array.isArray(row?.questions)
      ? row.questions.map((q: any) => String(q || "").trim()).filter(Boolean).slice(0, 4)
      : [];

    ideas.push({
      keyword,
      title: title.slice(0, 120),
      angle: String(row?.angle || "").trim().slice(0, 300),
      searchIntent: String(row?.searchIntent || "").trim().slice(0, 60) || "informational",
      pillar,
      source: matched || "brand-model",
      questions,
    });
    if (ideas.length >= count) break;
  }

  return { ideas, dropped };
}

/**
 * Brand-relevant topics, chosen from queries Google really returned.
 *
 * Never throws: a missing key, a dead SERP call or a refused model response all
 * come back as an empty or unvalidated list plus a warning the UI shows.
 */
export async function suggestTopicIdeas(
  ctx: TopicBrandContext,
  options?: { count?: number; signal?: AbortSignal }
): Promise<TopicIdeasResult> {
  const count = Math.max(1, Math.min(8, options?.count ?? 4));
  const warnings: string[] = [];

  const seedHint = ctx.seedHint?.trim();
  const derived = await deriveSeedQueries(ctx, 3);
  const seeds = Array.from(new Set([...(seedHint ? [seedHint] : []), ...derived])).slice(0, 4);

  if (seeds.length === 0) {
    return {
      ideas: [],
      seeds: [],
      poolSize: 0,
      warnings: [
        "No seed queries could be derived. Add an industry and target audience to the Brand DNA, or type a keyword to start from.",
      ],
    };
  }

  // ── Harvest the real pool ────────────────────────────────────────────────
  let pool: PoolEntry[] = [];
  if (!hasSerperKey()) {
    warnings.push(
      `${SERPER_MISSING_MESSAGE} These suggestions were not checked against live search results.`
    );
  } else {
    const analyses = await Promise.all(
      seeds.map(async (seed) => {
        const res = await fetchSerpAnalysis(seed, {
          targetCountry: ctx.targetCountry,
          // Only the query lists are needed here; measuring pages would cost
          // seconds per seed for numbers the picker step fetches anyway.
          measureCompetitors: false,
        });
        return res.success && res.data ? res.data : null;
      })
    );
    const usable = analyses.filter((a): a is SerpAnalysis => a !== null);
    if (usable.length === 0) {
      warnings.push(
        "Google returned nothing for the seed queries, so these suggestions are unvalidated."
      );
    }
    pool = buildQueryPool(usable);
    if (usable.length > 0 && pool.length === 0) {
      warnings.push(
        "Google returned no related searches for this niche, so these suggestions are unvalidated."
      );
    }
  }

  // ── Choose from it ───────────────────────────────────────────────────────
  const system =
    "You are an SEO content strategist. You only recommend topics a brand can " +
    "cover from first-hand experience, and you answer with JSON only.";

  const poolBlock =
    pool.length > 0
      ? `REAL GOOGLE QUERIES (these are the only keywords you may use — copy one EXACTLY, character for character):
${pool.map((p, i) => `${i + 1}. ${p.query}`).join("\n")}`
      : `No live search data is available, so propose the ${count} queries you are most confident this audience types.`;

  const user = `${brandBlock(ctx)}

${poolBlock}

Choose the ${count} best article topics for this brand.

RULES
1. ${pool.length > 0 ? "The `keyword` MUST be copied exactly from the numbered list. Do not reword, shorten, or fix its grammar." : "Each `keyword` must be a plausible short search query, 2-6 words."}
2. Pick queries where THIS brand has something first-hand to say. Skip a high-volume query the brand cannot answer from experience.
3. No two topics may be the same article in different words.
4. \`title\` is a real headline, 55-65 characters, keyword near the front.
5. \`angle\` is one sentence naming the specific first-hand thing this brand can show — a process, a result, a mistake it has seen. Not "we are experts".
6. \`pillar\` is the E-E-A-T pillar this brand's own evidence covers: Experience, Expertise, Authoritativeness or Trustworthiness.
7. \`searchIntent\` is one of: informational, commercial, transactional, navigational.
8. \`questions\` are up to 3 real questions a reader would still have. Copy them from the list above when one fits.

Return JSON:
{"topics":[{"keyword":"...","title":"...","angle":"...","searchIntent":"...","pillar":"...","questions":["..."]}]}`;

  let raw: any = null;
  try {
    raw = await callJson(system, user, 0.45);
  } catch (error: any) {
    return {
      ideas: [],
      seeds,
      poolSize: pool.length,
      warnings: [
        ...warnings,
        `The topic suggestion model did not answer (${error?.message || "unknown error"}). Nothing was invented — try again.`,
      ],
    };
  }

  const { ideas, dropped } = normalizeIdeas(raw, pool, count);
  if (dropped > 0) {
    warnings.push(
      `${dropped} suggestion${dropped === 1 ? "" : "s"} were dropped because the keyword was not one Google returned.`
    );
  }
  if (ideas.length === 0) {
    warnings.push("No suggestion survived the check against real search queries. Try again.");
  }

  return { ideas, seeds, poolSize: pool.length, warnings };
}
