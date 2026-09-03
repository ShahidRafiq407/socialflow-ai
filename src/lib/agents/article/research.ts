/**
 * STAGE 10 — RESEARCH
 *
 * The stage that goes and looks, so the writer never has to guess. It produces
 * findings, and a finding is a sentence with a URL, a publisher, a date and the
 * passage it rests on — not a sentence with a plausible-looking citation after it.
 *
 * Three rules make it worth running.
 *
 * Sources come from grounding metadata, never from the answer text. A URL a model
 * types into a sentence is a claim about a document; a URL in the grounding
 * metadata is a document it was given. Anything the extraction step cites that was
 * not in that list is dropped, and the count of what was dropped goes on the run.
 *
 * Every surviving URL is then fetched. `reachable` is the result of a request, and
 * the address stored is where that request landed — grounding cites its own
 * redirector, and a source recorded under a redirect URL would put an opaque link
 * in a published article and an unverifiable citation in the ledger.
 *
 * And it never invents the need for research. The targets are what the angle
 * committed to proving plus the outline points that state a figure, a rule or a
 * date. A page whose plan contains none of those is not researched, because there
 * would be nothing to look up.
 *
 * What it cannot do is prove a claim. The five checks live in the evidence gate,
 * which fetches these same pages again and asks whether they actually say it.
 *
 * Server-only: writes the run's provenance rows.
 */

import {
  readArticleOutline,
  readArticleStrategy,
  readResearchDossier,
  readSearchIntent,
  type ArticleOutline,
  type ArticleStrategy,
  type ResearchDossier,
  type ResearchFinding,
  type ResearchSourceType,
  type SearchIntent,
} from "@/lib/article/artifacts";
import { saveResearchSources } from "@/lib/article/evidenceStore";
import {
  assertLive,
  blocked,
  done,
  outOfTime,
  readArtifact,
  skipped,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { fetchPages, type FetchedPage } from "./fetchPage";
import { askGrounded, askJson, type GroundedSource } from "./router";

/** How many things this stage will try to find sources for. */
const TARGET_LIMIT = 9;
/** Targets per search. One search per target would spend the whole budget on three. */
const BATCH_SIZE = 3;
/** Pages fetched to confirm they answer. */
const FETCH_LIMIT = 12;
/** A search plus its extraction call, with room to store what came back. */
const SEARCH_BUDGET_MS = 70_000;

/**
 * Points that state something a source has to carry.
 *
 * Deliberately mechanical. A model asked "which of these needs a source?" will
 * find one for every line, and the budget then goes on looking up sentences that
 * were never in doubt.
 */
const NEEDS_SOURCE =
  /\d|%|percent|price|pricing|cost|fee|average|typical|regulation|law|legal|standard|code|permit|deadline|certif|licen[cs]|warrant|guarantee|statistic|study|survey|report|research|rate|tax|grant|deposit|lifespan|per (?:year|month|week|day|square|sq|m2)|\bsince\b|\bcurrent\b|\brecent\b|\bnew(?:est)?\b/i;

/**
 * What this run has to find sources for, in the order it matters.
 *
 * The angle's proof list first, because the strategy stage wrote it as the facts
 * the page commits to — the evidence gate reads the same list and reports what
 * nothing could support. Then the outline's own points, which is where a section
 * quietly promises a figure the plan never asked anyone to prove.
 */
function researchTargets(
  strategy: ArticleStrategy,
  outline: ArticleOutline | null,
  intent: SearchIntent | null
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string) => {
    const clean = value.replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || clean.length < 8 || seen.has(key) || out.length >= TARGET_LIMIT) return;
    seen.add(key);
    out.push(clean);
  };

  for (const item of strategy.proofRequired) add(item);
  for (const section of outline?.sections || []) {
    for (const point of section.points) {
      if (NEEDS_SOURCE.test(point)) add(`${point} (for the section “${section.heading}”)`);
    }
  }
  // Only when the two lists above found nothing: a must-know item that names a
  // figure is still a promise the page makes.
  if (out.length === 0) {
    for (const item of intent?.mustKnow || []) {
      if (NEEDS_SOURCE.test(item)) add(item);
    }
  }
  return out;
}

const SEARCH_SYSTEM = `You look things up and report only what the results say.

For each thing you were asked about:
- State what the results establish, in one or two sentences, with the figure, the date or the rule in it.
- Name the page it came from and quote the sentence that carries it.
- If the results do not establish it, say plainly that they do not. Do not fill the gap from memory.

Never state a figure, price, date or regulation that is not in a result you were given. A number you recall is not a finding.`;

const EXTRACT_SYSTEM = `You turn search results into findings. A finding is one statement and the one page that carries it.

For each finding:
- statement: the fact as an article would state it — specific, with the figure or the rule in it. Never hedged into meaninglessness.
- sourceUrl: the URL that carries it, copied exactly from the numbered list. Only those URLs exist.
- sourceTitle: that page's title, as given.
- publisher: who publishes it. The organisation, not the domain, when you were told it.
- excerpt: the passage from that page which carries the statement, quoted. Not your paraphrase of it.
- publishedAt: the date the page carries, exactly as it was given. Omit it when none was.
- sourceType: primary (the study, dataset or ruling itself), official (a government or regulator), journalism, vendor (a company selling the thing), forum (a discussion), unknown.

Rules you do not break:
- Never cite a URL that is not in the numbered list. There is no other source.
- One statement per finding. A sentence carrying three figures is three findings.
- The excerpt has to contain what the statement says. If the page only implies it, there is no finding.
- No finding for anything the material did not establish. Name it in "unfound" instead.
- No marketing language, and nothing about the business commissioning the page.

Return JSON only:
{"findings":[{"statement":"...","sourceUrl":"...","sourceTitle":"...","publisher":"...","excerpt":"...","publishedAt":"...","sourceType":"official"}],"unfound":["..."]}`;

/** A finding as the extraction step returns it, before anything has been fetched. */
interface RawFinding {
  statement: string;
  sourceUrl: string;
  sourceTitle: string;
  publisher: string;
  excerpt: string;
  publishedAt?: string;
  sourceType: ResearchSourceType;
}

const SOURCE_TYPES: ResearchSourceType[] = [
  "primary",
  "official",
  "journalism",
  "vendor",
  "forum",
  "unknown",
];

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** The extraction answer, or null when there is neither a finding nor an admission. */
function readExtraction(value: unknown): { findings: RawFinding[]; unfound: string[] } | null {
  const raw = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!raw) return null;
  const findings = (Array.isArray(raw.findings) ? raw.findings : [])
    .slice(0, 40)
    .map((row) => {
      const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const kind = text(entry.sourceType).toLowerCase() as ResearchSourceType;
      return {
        statement: text(entry.statement),
        sourceUrl: text(entry.sourceUrl),
        sourceTitle: text(entry.sourceTitle ?? entry.title),
        publisher: text(entry.publisher),
        excerpt: text(entry.excerpt),
        publishedAt: text(entry.publishedAt) || undefined,
        sourceType: SOURCE_TYPES.includes(kind) ? kind : ("unknown" as ResearchSourceType),
      };
    })
    .filter((row) => row.statement && /^https?:\/\//i.test(row.sourceUrl) && row.excerpt);
  const unfound = (Array.isArray(raw.unfound) ? raw.unfound : [])
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, 20);
  if (findings.length === 0 && unfound.length === 0) return null;
  return { findings, unfound };
}

/** The grounded sources, numbered, with the snippet grounding returned for each. */
function sourceList(sources: GroundedSource[]): string {
  return sources
    .map((source, index) => {
      const snippet = source.snippet ? `\n   Snippet: ${source.snippet.slice(0, 600)}` : "";
      return `${index + 1}. ${source.url}\n   Title: ${source.title || "(none given)"}${snippet}`;
    })
    .join("\n");
}

/** Same page, different spelling. Used only to match a citation back to the list. */
function keyOf(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${path}${url.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Hosts that stand in front of a page rather than publishing it. */
const REDIRECTORS =
  /vertexaisearch|grounding-api-redirect|googleusercontent|webcache|(^|\.)t\.co$|(^|\.)bit\.ly$|(^|\.)lnkd\.in$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/** Who publishes it. A name taken from a redirector names nobody, so the host wins. */
function publisherFor(given: string, url: string): string {
  const host = hostOf(url);
  const clean = given.trim();
  if (!clean) return host;
  if (REDIRECTORS.test(clean) || (clean.toLowerCase() === "google" && REDIRECTORS.test(hostOf(url)))) {
    return host || clean;
  }
  return clean;
}

/**
 * The source's kind, with one correction allowed.
 *
 * A government or academic host is a fact about the domain rather than a
 * judgement, so `unknown` is upgraded to `official`. Nothing else is overridden:
 * a study on a `.gov` host is primary, and demoting it would lose that.
 */
function sourceTypeFor(given: ResearchSourceType, url: string): ResearchSourceType {
  if (given !== "unknown") return given;
  const host = hostOf(url);
  const official = /(^|\.)(gov|mil)(\.[a-z]{2})?$|(^|\.)(edu|ac)(\.[a-z]{2,3})?$/i.test(host);
  return official ? "official" : "unknown";
}

/** One search, and the findings extracted from what it returned. */
async function searchBatch(
  ctx: StageContext,
  targets: string[],
  context: string
): Promise<{ findings: RawFinding[]; unfound: string[]; queries: string[]; dropped: number }> {
  const asked = targets.map((target, index) => `${index + 1}. ${target}`).join("\n");

  assertLive(ctx);
  const grounded = await askGrounded("research", {
    system: SEARCH_SYSTEM,
    prompt: `${context}\n\nFIND SOURCES FOR EACH OF THESE:\n${asked}`,
    meter: ctx.meter,
    signal: ctx.signal,
  });

  // No grounding metadata means nothing was really retrieved, whatever the answer
  // reads like. There is nothing here to attribute a finding to.
  if (grounded.sources.length === 0) {
    return { findings: [], unfound: targets, queries: grounded.searchQueries, dropped: 0 };
  }

  const canonical = new Map(grounded.sources.map((source) => [keyOf(source.url), source.url]));

  assertLive(ctx);
  const extracted = await askJson(
    "reasoning",
    "Research findings",
    {
      system: EXTRACT_SYSTEM,
      prompt: `WHAT WAS ASKED:\n${asked}\n\nWHAT THE SEARCH RETURNED:\n${grounded.text.slice(
        0,
        12_000
      )}\n\nTHE ONLY PAGES THAT EXIST (cite these URLs, exactly as written):\n${sourceList(
        grounded.sources
      )}`,
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readExtraction
  );

  // Attribution checked against the list that was actually in the prompt. A URL
  // from anywhere else is dropped rather than stored, and the count is recorded.
  let dropped = 0;
  const findings: RawFinding[] = [];
  for (const finding of extracted.findings) {
    const match = canonical.get(keyOf(finding.sourceUrl));
    if (!match) {
      dropped += 1;
      continue;
    }
    findings.push({ ...finding, sourceUrl: match });
  }
  return { findings, unfound: extracted.unfound, queries: grounded.searchQueries, dropped };
}

/**
 * Every cited page fetched, and the finding rewritten around what came back.
 *
 * This is where a citation becomes a source. `reachable` is a request's verdict,
 * the stored address is where that request landed rather than the redirector that
 * was cited, and a title or dateline the page carries beats one the model recalled.
 */
async function resolveSources(
  ctx: StageContext,
  findings: RawFinding[]
): Promise<{ findings: ResearchFinding[]; unreachable: number }> {
  const urls = Array.from(new Set(findings.map((finding) => finding.sourceUrl)));
  const pages = urls.length
    ? await fetchPages(urls, {
        timeoutMs: 10_000,
        // Enough to confirm the page answers and read its title and dateline. The
        // evidence gate fetches it properly when it has a claim to check.
        maxChars: 2_000,
        signal: ctx.signal,
        limit: FETCH_LIMIT,
      })
    : [];
  const byUrl = new Map<string, FetchedPage>(pages.map((page) => [page.url, page]));

  const resolved: ResearchFinding[] = findings.map((finding) => {
    const page = byUrl.get(finding.sourceUrl);
    const url = page?.ok ? page.finalUrl : finding.sourceUrl;
    return {
      statement: finding.statement,
      sourceUrl: url,
      sourceTitle: finding.sourceTitle || page?.title || "",
      publisher: publisherFor(finding.publisher, url),
      excerpt: finding.excerpt,
      publishedAt: finding.publishedAt || page?.publishedAt,
      sourceType: sourceTypeFor(finding.sourceType, url),
      reachable: Boolean(page?.ok),
      fetchError: page
        ? page.ok
          ? undefined
          : page.error
        : `Not fetched — this run stopped at ${FETCH_LIMIT} source pages.`,
    };
  });

  // Same statement from the same page twice is one finding.
  const seen = new Set<string>();
  const deduped = resolved.filter((finding) => {
    const key = `${finding.statement.toLowerCase()}::${finding.sourceUrl.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    findings: deduped,
    unreachable: deduped.filter((finding) => !finding.reachable).length,
  };
}

export const runResearchStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const strategy = readArtifact(ctx, "strategy", readArticleStrategy);
  if (!strategy) {
    return blocked(
      "There is no angle to research against — the strategy stage produced nothing usable, and its proof list is what this stage looks up. Run this article again from the strategy step."
    );
  }
  const outline = readArtifact(ctx, "outline", readArticleOutline);
  const intent = readArtifact(ctx, "intent", readSearchIntent);

  const targets = researchTargets(strategy, outline, intent);
  if (targets.length === 0) {
    return skipped(
      "Nothing in this page's plan needs a source: the angle committed to no facts to prove, and no section point states a figure, a price, a date or a rule. The writer is told there are no verified facts rather than being handed unverified ones."
    );
  }

  const context = [
    `Topic: ${ctx.brief.keyword}`,
    ctx.brief.targetCountry
      ? `The reader is in ${ctx.brief.targetCountry}. Prefer sources that apply there, and say when one does not.`
      : "",
    `Today is ${new Date().toISOString().slice(0, 10)}. Say how old a result is whenever the age of it matters.`,
    `The angle this page takes: ${strategy.angle}`,
  ]
    .filter(Boolean)
    .join("\n");

  const batches: string[][] = [];
  for (let at = 0; at < targets.length; at += BATCH_SIZE) {
    batches.push(targets.slice(at, at + BATCH_SIZE));
  }

  const raw: RawFinding[] = [];
  const unfound: string[] = [];
  const queries: string[] = [];
  const notes: string[] = [];
  let dropped = 0;
  let searches = 0;

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];

    // A search and its extraction is the longest thing this stage does. Stopping
    // with the remaining targets named as unfound is recoverable; being killed
    // mid-call loses every finding already paid for.
    if (outOfTime(ctx, SEARCH_BUDGET_MS)) {
      const remaining = batches.slice(index).flat();
      unfound.push(...remaining);
      notes.push(
        `There was no time left to look up ${remaining.length} of the ${targets.length} things this page needs a source for, so they are recorded as unfound and no claim rests on them.`
      );
      break;
    }

    try {
      const found = await searchBatch(ctx, batch, context);
      searches += 1;
      raw.push(...found.findings);
      unfound.push(...found.unfound);
      queries.push(...found.queries);
      dropped += found.dropped;
    } catch (error) {
      if (ctx.signal?.aborted) {
        throw Object.assign(new Error("The run was stopped."), { isCancelled: true });
      }
      // One failed search costs its own targets, not the stage. They go on the
      // unfound list, which is what the evidence gate and the writer read.
      unfound.push(...batch);
      notes.push(
        `A search failed and ${batch.length === 1 ? "its item was" : `its ${batch.length} items were`} not looked up: ${
          (error as Error)?.message || "no reason was given"
        }.`
      );
    }
  }

  const { findings, unreachable } = await resolveSources(ctx, raw);
  // Provenance rows, replacing anything an earlier attempt at this stage wrote.
  await saveResearchSources(ctx.runId, findings);

  if (dropped) {
    notes.push(
      `${dropped} citation${dropped === 1 ? "" : "s"} named a page that was not in the search results and ${
        dropped === 1 ? "was" : "were"
      } dropped.`
    );
  }
  if (unreachable) {
    notes.push(
      `${unreachable} of ${findings.length} sources could not be fetched, so the evidence check will not clear anything resting on them.`
    );
  }
  if (findings.length === 0 && searches > 0) {
    notes.push(
      "Nothing the searches returned could be attributed to a page that answers, so this page states no external facts."
    );
  }

  const dossier: ResearchDossier = {
    findings,
    // Derived from the findings by the guard below, never restated here.
    sourceUrls: [],
    queries: Array.from(new Set(queries)).slice(0, 20),
    unfound: Array.from(new Set(unfound.map((item) => item.trim()).filter(Boolean))),
    note: notes.join(" ") || undefined,
  };
  const checked = readResearchDossier(dossier) || dossier;

  // Candidate outbound links: a source that answered a request. The evidence gate
  // narrows this to the sources behind claims it cleared, and because state merges
  // and the gate runs next, its narrower list is the one the links stage sees.
  const seen = new Set<string>();
  const sources: { url: string; publisher: string }[] = [];
  for (const finding of checked.findings) {
    if (!finding.reachable || seen.has(finding.sourceUrl)) continue;
    seen.add(finding.sourceUrl);
    sources.push({ url: finding.sourceUrl, publisher: finding.publisher });
  }

  return done(checked, {
    researchFindingCount: checked.findings.length,
    researchSourceCount: checked.sourceUrls.length,
    researchSearches: searches,
    researchUnreachable: unreachable,
    researchUnfound: checked.unfound,
    researchQueries: checked.queries,
    ...(dropped ? { researchCitationsDropped: dropped } : {}),
    evidenceSources: sources.slice(0, 12),
  });
};
