/**
 * STAGE 5 — LIVE RESULTS
 *
 * What actually ranks for this query, read from the live first page rather than
 * recalled. Three stages depend on it being real: gaps compares our outline
 * against these headings, opportunity weighs the competition, and the SEO stage
 * has something to compare depth against.
 *
 * It never blocks. A missing Serper key or a rejected request is a fact about our
 * setup, not a reason to abandon a run — so the artifact comes back with a `note`
 * naming the reason and empty lists, and every later stage that reads it can see
 * that nobody looked at the first page. That is the difference between "no
 * competitors found" and "we could not check".
 */

import { readSerpResearch, type SerpCompetitor, type SerpResearch } from "@/lib/article/artifacts";
import { fetchSerpAnalysis } from "@/actions/serp";
import { assertLive, done, type StageContext, type StageResult, type StageRunner } from "./contract";
import { askJson } from "./router";

/** How many of the ranking pages get fetched and measured. */
const MEASURE_COUNT = 5;

const SYSTEM = `You read a page of search results and name what is on it. You do not judge it.

- entities: the specific things the ranking pages name — products, standards, places, tools, regulations, materials, brands. Only what appears in the titles and headings you are given. Ten to twenty-five, singular, no duplicates.
- formats: what kind of pages these are. Use plain labels: how-to guide, listicle, comparison, definition, service page, tool, review, case study, forum thread, video. Only formats present in what you were given.

Rules:
- Never add an entity that is not in the material. An entity you inferred is a guess, and a later stage will treat it as observed fact.
- No marketing language. No commentary on quality.

Return JSON only:
{"entities":["..."],"formats":["..."]}`;

interface Derived {
  entities: string[];
  formats: string[];
}

/** Local guard: this call has no artifact of its own, only two lists. */
function readDerived(value: unknown): Derived | null {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;
  const list = (input: unknown, limit: number): string[] =>
    Array.isArray(input)
      ? Array.from(
          new Set(
            input
              .map((item) => String(item ?? "").replace(/\s+/g, " ").trim())
              .filter((item) => item.length > 0 && item.length <= 80)
          )
        ).slice(0, limit)
      : [];
  const entities = list(raw.entities, 40);
  const formats = list(raw.formats, 10);
  if (entities.length === 0 && formats.length === 0) return null;
  return { entities, formats };
}
/** The competitors, as the search API returned them. Nothing is inferred here. */
function toCompetitors(results: { link: string; title: string; headings?: string[]; wordCount?: number }[]): SerpCompetitor[] {
  return results
    .filter((row) => /^https?:\/\//i.test(String(row?.link || "")))
    .map((row) => ({
      url: String(row.link),
      title: String(row.title || "").trim(),
      headings: Array.isArray(row.headings)
        ? row.headings.map((h) => String(h ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40)
        : [],
      wordCount: typeof row.wordCount === "number" && row.wordCount > 0 ? row.wordCount : undefined,
    }));
}

/** What the model is shown: the real titles and the real headings, nothing else. */
function derivePrompt(keyword: string, competitors: SerpCompetitor[], paa: string[]): string {
  const pages = competitors
    .map((row, index) => {
      const headings = row.headings.length ? row.headings.slice(0, 15).join(" | ") : "(headings could not be read)";
      return `${index + 1}. ${row.title || row.url}\n   ${headings}`;
    })
    .join("\n");
  const parts = [`Query: ${keyword}`, `RANKING PAGES:\n${pages}`];
  if (paa.length) parts.push(`QUESTIONS GOOGLE SHOWS ALONGSIDE:\n${paa.join("\n")}`);
  return parts.join("\n\n");
}
export const runSerpStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const keyword = ctx.brief.keyword;
  const country = (ctx.brief.targetCountry || "").trim();

  const live = await fetchSerpAnalysis(keyword, {
    targetCountry: country || undefined,
    measureCompetitors: true,
    measureCount: MEASURE_COUNT,
  });
  assertLive(ctx);

  // The live read failed. Say so on the artifact and let the run continue: an
  // outline written without the first page is worse, but an outline that thinks
  // it saw an empty first page is wrong.
  if (!live.success || !live.data) {
    const artifact: SerpResearch = {
      keyword,
      country,
      competitors: [],
      peopleAlsoAsk: [],
      relatedSearches: [],
      entities: [],
      formats: [],
      note: `The live results could not be read: ${live.error || "the search API returned nothing"}. Nothing downstream has seen the ranking pages.`,
    };
    return done(artifact, { serpRead: false, serpNote: artifact.note, competitorCount: 0 });
  }

  const data = live.data;
  const competitors = toCompetitors(data.topResults || []);
  const peopleAlsoAsk = (data.peopleAlsoAsk || []).map((q) => String(q).trim()).filter(Boolean);
  const relatedSearches = (data.relatedSearches || []).map((q) => String(q).trim()).filter(Boolean);
  const withHeadings = competitors.filter((row) => row.headings.length > 0).length;
  // Entities and formats are the one derived part of this stage, so a failure
  // here costs two lists and not the observation. The reason is recorded rather
  // than swallowed.
  let derived: Derived = { entities: [], formats: [] };
  let deriveNote = "";
  if (competitors.length > 0) {
    try {
      derived = await askJson(
        "fast",
        "Live results",
        {
          system: SYSTEM,
          prompt: derivePrompt(keyword, competitors, peopleAlsoAsk),
          meter: ctx.meter,
          signal: ctx.signal,
        },
        readDerived
      );
    } catch (error: any) {
      assertLive(ctx); // a cancelled run stops here rather than reporting a note
      deriveNote = `The ranking pages were read, but the entity pass failed (${error?.message || "unknown error"}), so entities and formats are empty.`;
    }
  }

  const notes: string[] = [];
  if (competitors.length === 0) {
    notes.push("The search API answered but returned no organic results for this query.");
  } else if (withHeadings === 0) {
    notes.push("None of the ranking pages could be fetched, so their headings are unknown — only titles were read.");
  }
  if (deriveNote) notes.push(deriveNote);

  const artifact: SerpResearch = {
    keyword: data.keyword || keyword,
    country: data.gl ? data.gl.toUpperCase() : country,
    competitors,
    peopleAlsoAsk,
    relatedSearches,
    entities: derived.entities,
    formats: derived.formats,
    note: notes.length ? notes.join(" ") : undefined,
  };

  // Read back through the artifact's own guard, so what the row stores is what
  // every later stage will parse out of it.
  const checked = readSerpResearch(artifact) || artifact;
  return done(checked, {
    serpRead: true,
    competitorCount: checked.competitors.length,
    competitorsMeasured: data.measuredPages || 0,
    // The mean length of the pages that already rank. A fact about the market,
    // and deliberately not a quality signal: no stage scores an article on it.
    serpAvgWordCount: data.estimatedAvgWordCount || 0,
    serpAvgHeadings: data.estimatedHeadingCount || 0,
    peopleAlsoAskCount: checked.peopleAlsoAsk.length,
    serpEntities: checked.entities,
    ...(checked.note ? { serpNote: checked.note } : {}),
  });
};
