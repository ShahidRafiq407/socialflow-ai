/**
 * STAGE 17 — OVERLAP WITH THE SITE'S OWN PAGES
 *
 * Two of a site's own URLs chasing one query is a self-inflicted problem, and the
 * honest answer is sometimes "do not publish this — improve that instead". So this
 * stage is allowed to return `update_instead`, and when it does it names the page.
 *
 * The candidates are chosen here, not by a model. Every page the crawl read is
 * scored on how many significant terms it shares with the query and the draft's
 * own headings, and only the pages that share at least one go into the prompt. A
 * site with 120 pages does not need 120 of them judged, and the count of what was
 * compared travels on the artifact: "nothing overlaps", from a crawl that read
 * nothing, is a fact about the crawl rather than about the site.
 *
 * When nothing shares a term there is no model call at all. The report is written
 * here, and it says exactly what was checked — the words those pages use, not their
 * full text — because a filter this crude must not be reported as a full reading.
 *
 * The page stage 3 told this run to update is left out of the comparison on
 * purpose. Replacing a page is not competing with it, and counting it as overlap
 * would have this stage contradicting a decision the run has already made.
 *
 * It never edits the draft.
 */

import {
  readArticleDraft,
  readCannibalizationReport,
  readContentInventory,
  readPageTypeDecision,
  type CannibalizationReport,
  type InventoryPage,
} from "@/lib/article/artifacts";
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
import { draftBlocks } from "./draftBlocks";
import { askJson } from "./router";

/** Pages put in front of the judgement, most alike first. */
const CANDIDATE_LIMIT = 12;
/** Headings shown per page. Enough to see what it covers. */
const HEADINGS_SHOWN = 10;
/** One call, with room to assemble the report afterwards. */
const COMPARE_BUDGET_MS = 40_000;

/**
 * Words that appear on every page of every site, so sharing one means nothing.
 * Deliberately short: a stop list long enough to be clever starts discarding the
 * terms that identify a subject.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "your", "you", "our", "are", "how", "what", "why", "when", "who",
  "can", "will", "from", "that", "this", "into", "out", "get", "best", "top", "guide", "about",
  "all", "any", "has", "have", "not", "but", "its", "it's", "was", "were", "been", "being",
  "more", "most", "much", "many", "other", "than", "then", "them", "they", "there", "their",
  "here", "does", "did", "doing", "should", "would", "could", "make", "made", "use", "using",
  "need", "needs", "new", "one", "two", "way", "ways", "tips", "everything", "know", "page",
  "home", "contact", "blog", "news", "post", "posts",
]);

const SYSTEM = `You decide whether a site is about to publish a page that competes with one it already has.

You are given a draft and pages the site already has. For each of those pages return:
- url: copied exactly from the list.
- title: the page's title as given.
- overlap: 0-100 — how much of THIS QUERY that page already answers. Not how similar the two pages are in general. A page on a neighbouring subject that never answers the query overlaps very little, however alike the titles look.
- advice:
  - "publish" — this page is not in the way.
  - "update_instead" — this page already targets the query and is the better home for the work. Publishing a second one splits the site against itself.
  - "differentiate" — both can exist, but the draft must be narrowed or re-angled so they answer different questions.
  - "internal_link" — different questions already, and the two should link to each other.
- reason: one sentence naming what that page covers that makes this the answer. A verdict with no reason is not a judgement.

Then, for the draft as a whole:
- verdict: the same four options, for what to do with the draft.
- reason: one sentence. If the verdict is update_instead, name the page.

Rules you do not break:
- Judge from the titles, subjects and headings you were given. You have not read the full text of these pages, so do not claim to know what is inside them beyond that.
- Never name a URL that is not in the list.
- Overlapping subject matter is not overlapping intent. Two pages can both be about a material and answer different questions.
- Do not advise update_instead unless one specific page really does target this query. It is the strongest thing you can say here.
- If nothing overlaps, return an empty pages list and the verdict publish.

Return JSON only:
{"pages":[{"url":"...","title":"...","overlap":40,"advice":"differentiate","reason":"..."}],"verdict":"publish","reason":"..."}`;

/** Significant words, lowercased, with the ones every page shares removed. */
function terms(value: string): Set<string> {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/[\s\-/]+/)
      .map((word) => word.replace(/^'+|'+$/g, ""))
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

/** How many of the query's own terms a page uses in its title, subject or headings. */
function sharedTerms(wanted: Set<string>, page: InventoryPage): number {
  const theirs = terms(
    `${page.title} ${page.topic} ${page.headings.slice(0, HEADINGS_SHOWN).join(" ")}`
  );
  let hits = 0;
  for (const word of wanted) if (theirs.has(word)) hits += 1;
  return hits;
}

function candidateLines(pages: InventoryPage[]): string {
  return pages
    .map((page, index) => {
      const headings = page.headings.slice(0, HEADINGS_SHOWN).join(" | ");
      return [
        `${index + 1}. ${page.url}`,
        `   Title: ${page.title || "(no title)"}`,
        page.topic ? `   Its subject: ${page.topic}` : "",
        page.wordCount ? `   Length: about ${page.wordCount} words` : "",
        headings ? `   Its headings: ${headings}` : "   Its headings could not be read.",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export const runCannibalizationStage: StageRunner = async (
  ctx: StageContext
): Promise<StageResult> => {
  const draft = readArtifact(ctx, "write", readArticleDraft);
  if (!draft || !draft.html.trim()) {
    return blocked(
      "There is no draft to compare against the site — the writing stage produced nothing. Run this article again from the writing step."
    );
  }

  const inventory = readArtifact(ctx, "inventory", readContentInventory);
  if (!inventory || inventory.pages.length === 0) {
    // Nothing was read, so nothing can be said. An empty report here would read as
    // "the site has no competing page", which is not what happened.
    return skipped(
      `The site's own pages were not read on this run${
        inventory?.note ? ` — ${inventory.note}` : ""
      }, so whether one of them already answers this query is unknown. Nothing was assumed either way.`
    );
  }

  const pageType = readArtifact(ctx, "content_type", readPageTypeDecision);
  const updating = pageType?.existingUrl || "";
  const headings = draftBlocks(draft.html)
    .map((block) => block.heading)
    .filter(Boolean);

  const wanted = terms(`${ctx.brief.keyword} ${draft.title} ${headings.slice(0, 12).join(" ")}`);
  const scored = inventory.pages
    // The page this run was told to update is the draft's own destination, not a
    // rival for it.
    .filter((page) => page.url !== updating)
    .map((page) => ({ page, hits: sharedTerms(wanted, page) }))
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  const candidates = scored.slice(0, CANDIDATE_LIMIT).map((row) => row.page);

  const readable = inventory.pages.length;
  if (candidates.length === 0) {
    // Written here, with no model call, and stating what was actually checked. The
    // filter reads titles, subjects and headings — not the pages themselves — so
    // the report says so rather than implying the site was read in full.
    const report: CannibalizationReport = {
      pages: [],
      compared: readable,
      highestOverlap: 0,
      verdict: "publish",
      reason: `No page on ${
        inventory.site || "this site"
      } shares a subject with this query: ${readable} page${
        readable === 1 ? " was" : "s were"
      } read and not one uses a term from it in its title, subject or headings${
        updating ? ", and the page this run is updating is not counted as competing with itself" : ""
      }. Judged on the words those pages use, not on their full text.`,
    };
    const checked = readCannibalizationReport(report) || report;
    return done(checked, {
      cannibalizationVerdict: checked.verdict,
      cannibalizationCompared: checked.compared,
      cannibalizationHighestOverlap: 0,
      cannibalizationOverlappingPages: [],
      cannibalizationReason: checked.reason,
      ...(updating ? { cannibalizationUpdateTarget: updating } : {}),
    });
  }

  if (outOfTime(ctx, COMPARE_BUDGET_MS)) {
    return skipped(
      `There was no time left in this request to compare the draft against the ${candidates.length} page${
        candidates.length === 1 ? "" : "s"
      } on this site that share a subject with it, so whether one of them already answers the query is unknown.`
    );
  }
  assertLive(ctx);

  const judged = await askJson(
    "reasoning",
    "Overlap",
    {
      system: SYSTEM,
      prompt: [
        `THE QUERY THE DRAFT TARGETS: ${ctx.brief.keyword}`,
        `THE DRAFT — title: ${draft.title}${
          draft.excerpt ? `\nWhat it says it is: ${draft.excerpt}` : ""
        }${headings.length ? `\nIts sections:\n- ${headings.slice(0, 20).join("\n- ")}` : ""}`,
        pageType
          ? `WHAT THIS RUN DECIDED TO BUILD: ${pageType.choice} — ${pageType.reason}${
              updating
                ? `\nIt is updating ${updating}. That page is deliberately not in the list below: replacing a page is not competing with it.`
                : ""
            }`
          : "",
        `PAGES THIS SITE ALREADY HAS — the only URLs you may name. ${candidates.length} of the ${readable} pages read share a term with the query; the rest do not:\n${candidateLines(
          candidates
        )}`,
        "Return the JSON.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readCannibalizationReport
  );

  // Every URL checked against the pages that were really in the prompt, and the
  // count of what was dropped goes on the run. A page named here becomes advice to
  // change or abandon a real URL, so an invented one is worse than none.
  const named = new Set(candidates.map((page) => page.url));
  let dropped = 0;
  const pages = judged.pages.filter((page) => {
    if (named.has(page.url)) return true;
    dropped += 1;
    return false;
  });

  // A verdict that names a page nobody read cannot stand. `update_instead` with no
  // surviving page becomes `differentiate`: something looked close enough to say
  // it, and the honest form of that with no URL behind it is "narrow this".
  const verdict =
    judged.verdict === "update_instead" && !pages.some((page) => page.advice === "update_instead")
      ? "differentiate"
      : judged.verdict;

  const report: CannibalizationReport = {
    pages,
    // The pages really put in front of the judgement, not the whole crawl.
    compared: candidates.length,
    // Recomputed by the guard off the surviving rows.
    highestOverlap: pages.length ? pages[0].overlap : 0,
    verdict,
    reason: judged.reason,
  };
  const checked = readCannibalizationReport(report) || report;

  return done(checked, {
    cannibalizationVerdict: checked.verdict,
    cannibalizationCompared: checked.compared,
    cannibalizationHighestOverlap: checked.highestOverlap,
    cannibalizationOverlappingPages: checked.pages
      .slice(0, 6)
      .map((page) => ({ url: page.url, overlap: page.overlap, advice: page.advice })),
    cannibalizationReason: checked.reason,
    // Read by the links stage: a page this close is the anchor worth pointing at.
    cannibalizationLinkCandidates: checked.pages
      .filter((page) => page.advice === "internal_link" || page.advice === "differentiate")
      .map((page) => page.url)
      .slice(0, 6),
    ...(updating ? { cannibalizationUpdateTarget: updating } : {}),
    ...(dropped ? { cannibalizationPagesDropped: dropped } : {}),
  });
};
