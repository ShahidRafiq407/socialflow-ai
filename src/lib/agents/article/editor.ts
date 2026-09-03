/**
 * STAGE 21 — EDIT PASS
 *
 * The last stage allowed to change the body, and the only one that edits prose
 * another stage wrote. It reads the page as it now stands — the links stage's HTML
 * when anchors were placed in it, the writer's otherwise — and it changes only the
 * sections something in this run has actually said is wrong.
 *
 * What it will not touch, and why each one matters.
 *
 * Headings. Stage 19 planned every image against a real H2 and stage 20 built the
 * structured data from the headings as they were, so a renamed heading leaves the
 * media plan pointing at a section that no longer exists and the JSON-LD describing
 * a page that no longer matches. The H2 is sliced off, kept, and put back verbatim.
 *
 * The blocks our own code assembled: the contents list, the takeaways, the answers,
 * the sources, every figure, the video. They are built from data by `articleAssembly`
 * and `youtube`, they carry the classes the schema stage parses back out, and a model
 * rewriting one would break that parse while the report cheerfully said "clarify".
 * They are lifted out of the page whole before it is split and put back afterwards
 * byte for byte, so no edit can reach them. That is not only safety: the takeaways
 * and the contents list have H2s of their own and the answers open a wrapper the
 * writer's last section would otherwise run into, so lifting them out is what makes
 * the intro and the closing section editable at all rather than permanently unbalanced.
 *
 * A section whose HTML does not close what it opens. Splitting a page at its H2s
 * cuts through any wrapper opened earlier, so a part can end inside one. Those are
 * left alone and named, because an edited fragment could not be put back.
 *
 * The problems come from the run, never from an impression: the fact check's claims
 * it could not support, the passages the differentiation pass found already on the
 * ranking pages, the experience the trust pass could not establish, and sentences
 * this file finds in more than one section. A section nothing was said about is not
 * sent to a model at all — a pass told to look for something to change finds
 * something to change.
 *
 * Two measurements decide whether an edit is kept. Every link that was in the
 * section has to still be in it, and a section that comes back a third of its
 * length has been rewritten rather than edited. In both cases the original stands
 * and the reason is recorded. The counts are measured off the HTML on each side,
 * because the pass is not editing towards a length and length is not evidence of
 * anything.
 */

import {
  countHtmlWords,
  injectLink,
  sanitizeModelHtml,
  stripHtml,
} from "@/lib/agents/workers/articleAssembly";
import {
  finalHtml,
  readArticleDraft,
  readEditPassReport,
  readFactCheckReport,
  readOriginalityReport,
  readTrustReport,
  type EditChange,
  type EditKind,
  type EditPassReport,
} from "@/lib/article/artifacts";
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

/** How many sections one request will edit. One model call each. */
const MAX_EDITED_SECTIONS = 6;
/** One edit call, with room to check what came back and carry on. */
const SECTION_BUDGET_MS = 45_000;
/** Below this share of its own words, a section was rewritten, not edited. */
const MIN_KEPT_RATIO = 0.4;
/** A section this short has nothing left to cut, whatever was said about it. */
const MIN_SECTION_WORDS = 40;
/**
 * Longer than this and the section is not sent at all. A section handed over in
 * halves comes back as one half, and the tail would be gone with nothing to say so.
 */
const MAX_SECTION_CHARS = 9_000;
/** Problems shown per section. More than this is a rewrite brief, not an edit. */
const MAX_PROBLEMS_SHOWN = 6;
/** Changes kept per section. The artifact caps the total at sixty. */
const MAX_CHANGES_SHOWN = 12;

/**
 * How badly a section needs the pass, when there are more of them than one request
 * can edit. A claim nothing in the run supports is the one that must not ship, so it
 * is worth more than a passage that merely repeats what a competitor says.
 */
const CLAIM_WEIGHT = 3;
const OVERLAP_WEIGHT = 2;
const REPEAT_WEIGHT = 1;

/** The kinds the artifact accepts. Local, and typed against the contract. */
const KINDS: EditKind[] = ["cut", "tighten", "clarify", "dedupe", "claim"];

/**
 * The blocks `articleAssembly` builds from data rather than prose: the contents
 * list, the takeaways, the answers, the source list. The schema stage parses two of
 * them back out of the HTML by these very classes. Only consulted for a block the
 * carve below could not lift out whole, which means one whose markup does not close.
 */
const ASSEMBLED = /article-toc|toc-title|key-takeaways|article-faq|faq-item|article-sources/i;

/** Tags that have to balance inside a section for it to stand on its own. */
const BLOCK_TAGS = ["section", "nav", "aside", "div", "figure", "ul", "ol", "table", "blockquote"];

/**
 * Everything on the page this stage is not editing, by the tag and class the code
 * that built it emits. Each one is lifted out whole before the page is split.
 *
 * The video is here because `sanitizeModelHtml` deletes an `<iframe>`, so an embed
 * inside an edited section would come back gone. Figures are here because the alt
 * text is the media stage's, written for someone who cannot see the image, and a
 * rewrite of it is not this stage's to make.
 */
const KEEP_BLOCKS: { tag: string; open: RegExp }[] = [
  { tag: "nav", open: /<nav\b[^>]*class="[^"]*article-toc[^"]*"[^>]*>/i },
  { tag: "aside", open: /<aside\b[^>]*class="[^"]*key-takeaways[^"]*"[^>]*>/i },
  { tag: "section", open: /<section\b[^>]*class="[^"]*article-faq[^"]*"[^>]*>/i },
  { tag: "section", open: /<section\b[^>]*class="[^"]*article-sources[^"]*"[^>]*>/i },
  { tag: "div", open: /<div\b[^>]*class="[^"]*youtube-video-embed[^"]*"[^>]*>/i },
  { tag: "figure", open: /<figure\b[^>]*>/i },
];

/** How many blocks one page may have lifted out. A page has a handful. */
const MAX_KEPT_BLOCKS = 40;

/** What stands in for a lifted block. A comment, so nothing renders and no word counts. */
const keepToken = (index: number): string => `<!--POSTLOOM_KEEP_${index}-->`;
const KEEP_TOKEN = /<!--POSTLOOM_KEEP_(\d+)-->/g;
/** The same test without the global flag, so a `test` cannot carry a `lastIndex`. */
const HAS_KEEP = /<!--POSTLOOM_KEEP_\d+-->/;
const LEADING_KEEP = /^(?:\s*<!--POSTLOOM_KEEP_\d+-->)+\s*/;
const TRAILING_KEEP = /(?:\s*<!--POSTLOOM_KEEP_\d+-->\s*)+$/;

const SYSTEM = `You edit one section of a finished article. You are given its HTML and the problems this run found in it.

Fix those problems. Change nothing else.

- Every <a href="...">words</a> stays exactly as it is: same href, same words inside it. Those destinations were checked and those anchors were placed deliberately.
- There is no <h2> in what you were given and there is none in what you return. The heading is not yours to change.
- Keep the HTML simple and closed: <p>, <h3>, <ul>/<li>, <ol>/<li>, <strong>, <em>, <a>, <table>. Every tag you open, you close.
- A claim the run could not support is cut, or written as what it actually is — "typically", "in most cases", or attributed to the source that does support it. It is never left standing as a fact.
- A passage the ranking pages already cover is replaced with something this business can say that they cannot, or cut. Rearranging the words and leaving the point identical is not a fix.
- You are not editing towards a length. Cut what does not earn its place, then stop.
- If a fix would need something nobody gave you — a figure, an experience, a name — leave that passage alone and say so in leftAlone.

Return JSON only:
{"html":"the whole edited section, without its heading","changes":[{"kind":"cut","note":"what you changed and why"}],"leftAlone":["what you did not change — why"]}

kind is one of: cut, tighten, clarify, dedupe, claim.
Return the section's full HTML, not a diff and not only the parts you touched.`;

// ---------------------------------------------------------------------------
// THE PAGE, IN PARTS
// ---------------------------------------------------------------------------

/**
 * Where the element that starts at `start` ends, counting its own kind on the way.
 *
 * Counted rather than matched to the first closing tag, because the video embed is a
 * div inside a div: a non-greedy regex would close it at the inner one and leave the
 * outer half of it in the prose. -1 when the element never closes, and the caller
 * leaves that block where it is for the balance check to refuse.
 */
function elementEnd(html: string, start: number, tag: string): number {
  const scanner = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  scanner.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(html)) !== null) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return scanner.lastIndex;
  }
  return -1;
}

/** The page with every assembled block held aside, and the blocks themselves. */
interface Carved {
  html: string;
  kept: string[];
}

/**
 * The assembled blocks out of the page, each replaced by a token.
 *
 * This is what makes the rest of the file simple: after it, the page is the prose
 * somebody wrote and the H2s they wrote it under, and nothing a model is shown can
 * reach a figure, an embed, the answers or the contents list.
 */
function carve(html: string): Carved {
  const kept: string[] = [];
  let out = html;
  for (const block of KEEP_BLOCKS) {
    // A page carries several of some of these — a figure per section — so each
    // pattern is applied until the page has no more of them.
    while (kept.length < MAX_KEPT_BLOCKS) {
      const found = block.open.exec(out);
      if (!found) break;
      const end = elementEnd(out, found.index, block.tag);
      if (end < 0) break;
      kept.push(out.slice(found.index, end));
      out = `${out.slice(0, found.index)}${keepToken(kept.length - 1)}${out.slice(end)}`;
    }
  }
  return { html: out, kept };
}

/**
 * The blocks back where their tokens are, once and once only.
 *
 * A token restored twice would put a second contents list on the page, and the schema
 * stage reads the first of the answers it finds — so a repeat resolves to nothing
 * rather than to a duplicate.
 */
function restore(html: string, kept: string[]): string {
  const used = new Set<number>();
  return html.replace(KEEP_TOKEN, (_token, digits: string) => {
    const index = Number(digits);
    if (used.has(index) || !kept[index]) return "";
    used.add(index);
    return kept[index];
  });
}

/** One section of the page, as HTML rather than as prose. */
interface RawSection {
  /** Exactly what the split produced. What a section nothing edits keeps. */
  raw: string;
  /** The H2's text, for matching a report's location and naming a change. */
  heading: string;
  /** The H2 tag as written. Re-attached unchanged after an edit. */
  headingHtml: string;
  /** Everything under the heading, tokens and all. */
  bodyHtml: string;
  /** Tokens for the blocks that stood before the prose — the hero, usually. */
  head: string;
  /** The prose, and the only string an edit is ever shown or allowed to replace. */
  editable: string;
  /** Tokens for the blocks that stood after it — an image, the answers, the sources. */
  tail: string;
  /** Its prose, flattened, for finding a passage a report named. */
  flatText: string;
  words: number;
}

/** Whitespace collapsed and lowercased, so a lookup survives the markup. */
function flat(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The page split at its own H2s, with each part's HTML kept intact. */
function rawSections(html: string): RawSection[] {
  return String(html || "")
    .split(/(?=<h2)/i)
    .filter((part) => part.trim())
    .map((part) => {
      const match = part.match(/<h2[^>]*>[\s\S]*?<\/h2>/i);
      const headingHtml = match ? match[0] : "";
      const bodyHtml = headingHtml
        ? part.slice(part.indexOf(headingHtml) + headingHtml.length)
        : part;
      // The tokens either side are peeled off rather than sent: a model shown a
      // comment it was not told about drops it, and the block would go with it.
      const head = bodyHtml.match(LEADING_KEEP)?.[0] ?? "";
      const tail = bodyHtml.slice(head.length).match(TRAILING_KEEP)?.[0] ?? "";
      const editable = bodyHtml.slice(head.length, bodyHtml.length - tail.length);
      return {
        raw: part,
        heading: headingHtml ? stripHtml(headingHtml) : "",
        headingHtml,
        bodyHtml,
        head,
        editable,
        tail,
        flatText: flat(stripHtml(editable)),
        words: countHtmlWords(editable),
      };
    });
}

/** The section's name in a sentence a person reads. */
function nameOf(section: RawSection): string {
  return section.heading || "the opening";
}

/** True when every block tag this HTML opens is also closed inside it. */
function selfContained(html: string): boolean {
  for (const tag of BLOCK_TAGS) {
    const open = html.match(new RegExp(`<${tag}\\b`, "gi"))?.length ?? 0;
    const close = html.match(new RegExp(`</${tag}\\s*>`, "gi"))?.length ?? 0;
    if (open !== close) return false;
  }
  return true;
}

/**
 * Why this section cannot be edited, or null when it can.
 *
 * Only asked about sections something was said about, so the reasons that come back
 * are all worth reading — a report listing why the contents list was not rewritten
 * is noise.
 */
function untouchable(section: RawSection): string | null {
  const where = nameOf(section);
  if (ASSEMBLED.test(section.editable)) {
    return `“${where}” runs into a block this app assembles from data rather than prose anybody wrote, and that block does not close inside the page, so the section was left exactly as it is.`;
  }
  // A block between two paragraphs of one section rather than at either end of it.
  // The prose cannot be handed over in one piece without the token going with it, and
  // putting the block back in the middle of an edit is guesswork.
  if (HAS_KEEP.test(section.editable)) {
    return `“${where}” has a figure or an embed in the middle of its prose, so the section could not be sent for editing in one piece and was left alone.`;
  }
  if (!selfContained(section.editable)) {
    return `“${where}” runs into a block that was opened before it, so an edit could not have been put back safely and it was left alone.`;
  }
  if (section.words < MIN_SECTION_WORDS) {
    return `“${where}” is ${section.words} words, too short to edit down further, so it was left alone.`;
  }
  if (section.editable.length > MAX_SECTION_CHARS) {
    return `“${where}” is too long to send in one piece, and a section sent in halves comes back missing its tail, so it was left alone.`;
  }
  return null;
}

/** Every link in a piece of HTML, with the words that were made clickable. */
function linksIn(html: string): { href: string; anchor: string; external: boolean }[] {
  return Array.from(html.matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi)).map(
    (match) => {
      const attributes = `${match[1]} ${match[3]}`;
      return {
        href: match[2],
        anchor: stripHtml(match[4]),
        // Kept so a restored link goes back the way it was placed rather than as an
        // internal one that opens in the same tab.
        external: /target="_blank"|rel="[^"]*noopener/i.test(attributes),
      };
    }
  );
}

// ---------------------------------------------------------------------------
// WHAT THIS RUN SAID IS WRONG
// ---------------------------------------------------------------------------

/** One thing this run said is wrong with one section. */
interface Problem {
  /** Used to order sections when not every one of them can be edited. */
  weight: number;
  /** The sentence the model is shown. It names where the complaint came from. */
  text: string;
}

/** The section a passage is in, found by its own words. -1 when it is nowhere. */
function locate(sections: RawSection[], passage: string): number {
  const needle = flat(passage);
  if (needle.length < 12) return -1;
  const probe = needle.length > 90 ? needle.slice(0, 90) : needle;
  return sections.findIndex((section) => section.flatText.includes(probe));
}

/** The section a report named by heading. -1 when no heading matches. */
function byHeading(sections: RawSection[], location: string): number {
  const wanted = flat(location);
  if (wanted.length < 3) return -1;
  return sections.findIndex((section) => {
    const heading = flat(section.heading);
    if (!heading) return false;
    if (heading === wanted) return true;
    // Partial matches only between strings long enough for the overlap to mean
    // something. "How" appearing in two headings is not a match.
    if (heading.length < 5 || wanted.length < 5) return false;
    return heading.includes(wanted) || wanted.includes(heading);
  });
}

/** Sentences long enough that finding one twice means something. */
function sentencesOf(text: string): string[] {
  return text
    .split(/[.!?]+\s+/)
    .map((row) => row.trim())
    .filter((row) => row.split(/\s+/).length >= 8);
}

/**
 * Sentences that appear in more than one section, found here rather than asked for.
 *
 * A model asked "is anything repeated" answers with an impression. A string that
 * occurs twice is a fact, and it is attached to the later section because the first
 * time a point is made is usually the right place for it.
 */
function repeats(sections: RawSection[]): Map<number, Problem[]> {
  const seen = new Map<string, number>();
  const found = new Map<number, Problem[]>();
  sections.forEach((section, index) => {
    for (const sentence of sentencesOf(section.flatText)) {
      const first = seen.get(sentence);
      if (first === undefined) {
        seen.set(sentence, index);
        continue;
      }
      if (first === index) continue;
      const list = found.get(index) ?? [];
      if (list.length >= 3) continue;
      list.push({
        weight: REPEAT_WEIGHT,
        text: `This sentence is already in “${nameOf(
          sections[first]
        )}”, word for word: “${sentence}”`,
      });
      found.set(index, list);
    }
  });
  return found;
}

interface Collected {
  /** Problems by section index. */
  bySection: Map<number, Problem[]>;
  /** Problems whose passage is nowhere in the page, with the reason to record. */
  unplaced: string[];
  /** Which of this run's checks actually reported something. */
  reported: string[];
}

/**
 * True when a passage is inside one of the blocks that was lifted out.
 *
 * The difference matters in what the pass reports: a claim sitting in an answer this
 * app assembled from the FAQ data was not "not found in the page", it was found
 * somewhere this stage does not edit, and the fix belongs to whatever produced it.
 */
function inKeptBlock(kept: string[], passage: string): boolean {
  const needle = flat(passage);
  if (needle.length < 12) return false;
  const probe = needle.length > 90 ? needle.slice(0, 90) : needle;
  return kept.some((block) => flat(stripHtml(block)).includes(probe));
}

/** What to record about a finding that is not in any editable section. */
function elsewhere(kept: string[], passage: string): string {
  return inKeptBlock(kept, passage)
    ? "It is in the contents list, the takeaways, the answers or a caption — blocks this app assembles from data rather than prose — so the edit pass left it alone."
    : "It could not be found in the page as written, so it was left alone.";
}

/**
 * Every problem this run recorded, matched to the section it is in.
 *
 * A finding that cannot be located is not guessed at. The fact check names a
 * heading; the other two name a passage, and a passage is looked up in the page's
 * own words. What cannot be found is reported as not found — the publish gate still
 * fails an unproven claim, so nothing is quietly dropped by being unfindable here.
 */
function collect(ctx: StageContext, sections: RawSection[], kept: string[]): Collected {
  const bySection = repeats(sections);
  const unplaced: string[] = [];
  const reported: string[] = [];
  const add = (index: number, problem: Problem) => {
    const list = bySection.get(index) ?? [];
    list.push(problem);
    bySection.set(index, list);
  };

  const facts = readArtifact(ctx, "factcheck", readFactCheckReport);
  const open = (facts?.entries ?? []).filter((entry) => entry.verdict !== "supported");
  if (open.length) reported.push("the fact check");
  for (const entry of open) {
    let index = entry.location ? byHeading(sections, entry.location) : -1;
    if (index < 0) index = locate(sections, entry.claim);
    const verdict =
      entry.verdict === "unsupported" ? "could not support" : "could not confirm either way";
    const text = `The fact check ${verdict} this claim: “${entry.claim}” — ${entry.note}`;
    if (index < 0) {
      unplaced.push(`${text} ${elsewhere(kept, entry.claim)}`);
      continue;
    }
    add(index, { weight: CLAIM_WEIGHT, text });
  }

  const trust = readArtifact(ctx, "eeat", readTrustReport);
  if (trust?.unsupportedExperience.length) reported.push("the trust pass");
  for (const claim of trust?.unsupportedExperience ?? []) {
    const index = locate(sections, claim);
    const text = `This page claims experience that nothing on file establishes: “${claim}”`;
    if (index < 0) {
      unplaced.push(`${text} ${elsewhere(kept, claim)}`);
      continue;
    }
    add(index, { weight: CLAIM_WEIGHT, text });
  }

  const overlap = readArtifact(ctx, "originality", readOriginalityReport);
  if (overlap?.overlaps.length) reported.push("the differentiation pass");
  for (const finding of overlap?.overlaps ?? []) {
    const index = locate(sections, finding.passage);
    if (index < 0) {
      unplaced.push(
        `A passage ${finding.url} already covers was not edited: “${finding.passage}” ${elsewhere(
          kept,
          finding.passage
        )}`
      );
      continue;
    }
    add(index, {
      weight: OVERLAP_WEIGHT,
      text: `${finding.url} already covers this passage${
        finding.theirs ? `, which it puts as “${finding.theirs}”` : ""
      }: “${finding.passage}”`,
    });
  }

  return { bySection, unplaced, reported };
}

// ---------------------------------------------------------------------------
// ONE SECTION, EDITED AND CHECKED
// ---------------------------------------------------------------------------

/** What came back from one edit call, before any of it is believed. */
interface SectionEdit {
  html: string;
  changes: { kind: EditKind; note: string }[];
  leftAlone: string[];
}

/**
 * The guard for one edit.
 *
 * The HTML is sanitised here rather than later, so what the rest of this file
 * measures is the same string that would go into the page. An H2 is removed because
 * the heading is re-attached from the original: one returned here would duplicate it.
 * A keep token is removed for the same reason — the blocks are put back from the page,
 * and a token invented here would move one or make a second copy of it.
 */
function readSectionEdit(value: unknown): SectionEdit | null {
  const raw = (value as Record<string, unknown> | null) || null;
  if (!raw || typeof raw !== "object") return null;
  const html = sanitizeModelHtml(String(raw.html ?? ""))
    .replace(/<h2[^>]*>[\s\S]*?<\/h2>/gi, "")
    .replace(KEEP_TOKEN, "")
    .trim();
  if (!html) return null;
  const changes = (Array.isArray(raw.changes) ? raw.changes : [])
    .map((row) => {
      const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const kind = String(entry.kind ?? "")
        .trim()
        .toLowerCase() as EditKind;
      return {
        kind: KINDS.includes(kind) ? kind : ("clarify" as EditKind),
        note: String(entry.note ?? "").trim(),
      };
    })
    .filter((row) => row.note);
  const leftAlone = (Array.isArray(raw.leftAlone) ? raw.leftAlone : [])
    .map((row) => String(row ?? "").trim())
    .filter(Boolean);
  return { html, changes, leftAlone };
}

type SectionOutcome =
  | { ok: true; bodyHtml: string; changes: EditChange[]; leftAlone: string[] }
  | { ok: false; reason: string };

/** The other sections' headings, so an edit does not move work into this one. */
function otherHeadings(sections: RawSection[], index: number): string[] {
  return sections
    .filter((section, position) => position !== index && Boolean(section.heading))
    .map((section) => section.heading)
    .slice(0, 24);
}

/**
 * One section, edited — or the reason it stands as it was.
 *
 * A failed call is not a failed stage: five good edits must not be thrown away
 * because the sixth came back malformed. Cancellation is the exception and is
 * re-thrown, because a stopped run should stop paying for calls.
 */
async function editSection(
  ctx: StageContext,
  title: string,
  section: RawSection,
  problems: Problem[],
  siblings: string[]
): Promise<SectionOutcome> {
  const where = nameOf(section);
  const system = ctx.brief.humanize
    ? `${SYSTEM}\n\nRead the section back before you return it and cut any sentence that reads like it was assembled from a template rather than written by someone who knows the subject.`
    : SYSTEM;

  let edit: SectionEdit;
  try {
    edit = await askJson(
      "writing",
      "Edit pass",
      {
        system,
        prompt: [
          `THE ARTICLE: ${title}`,
          `The query it answers: ${ctx.brief.keyword}`,
          section.heading
            ? `THE SECTION YOU ARE EDITING: ${section.heading}`
            : "THE SECTION YOU ARE EDITING: the opening, before the first heading.",
          siblings.length
            ? `THE REST OF THE PAGE, so you do not pull into this section what is already elsewhere:\n- ${siblings.join(
                "\n- "
              )}`
            : "",
          `WHAT THIS RUN FOUND IN IT:\n${problems
            .slice(0, MAX_PROBLEMS_SHOWN)
            .map((problem, index) => `${index + 1}. ${problem.text}`)
            .join("\n")}`,
          `THE SECTION'S HTML:\n${section.editable}`,
          "Return the JSON.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        meter: ctx.meter,
        signal: ctx.signal,
      },
      readSectionEdit
    );
  } catch {
    if (ctx.signal?.aborted) {
      throw Object.assign(new Error("The run was stopped."), { isCancelled: true });
    }
    return {
      ok: false,
      reason: `The edit of “${where}” did not come back in a usable shape, so the section stands as it was written.`,
    };
  }

  // A change list against identical HTML is a claim, not an edit.
  if (edit.html === section.editable.trim()) {
    return {
      ok: false,
      reason: `“${where}” came back unchanged, so nothing was recorded against it.`,
    };
  }

  // A section that comes back a fraction of its length was rewritten, and a rewrite
  // at stage 21 throws away prose the earlier stages checked and scored.
  const words = countHtmlWords(edit.html);
  if (words < Math.round(section.words * MIN_KEPT_RATIO)) {
    return {
      ok: false,
      reason: `The edit of “${where}” returned ${words} of its ${section.words} words, which is a rewrite rather than an edit, so the original stands.`,
    };
  }

  if (!selfContained(edit.html)) {
    return {
      ok: false,
      reason: `The edit of “${where}” left a tag open that it did not close, so the original stands rather than going into the page broken.`,
    };
  }

  // Every link that was in this section is still in it, or put back where its words
  // survived. The links stage reports the anchors it placed, and a report naming a
  // link the page no longer contains is worse than no report at all.
  let body = edit.html;
  const lost: string[] = [];
  for (const link of linksIn(section.editable)) {
    if (body.includes(`href="${link.href}"`)) continue;
    const restored = injectLink(body, link.anchor, link.href, { external: link.external });
    if (restored.applied) {
      body = restored.html;
      continue;
    }
    lost.push(link.href);
  }
  if (lost.length) {
    return {
      ok: false,
      reason: `The edit of “${where}” removed ${
        lost.length === 1 ? "a link" : `${lost.length} links`
      } the links stage had placed and the words to put ${
        lost.length === 1 ? "it" : "them"
      } back were gone, so the original stands: ${lost.join(", ")}.`,
    };
  }

  return {
    ok: true,
    // The blocks that stood either side of the prose go back exactly where they were.
    bodyHtml: `${section.head}${body}${section.tail}`,
    changes: edit.changes
      .slice(0, MAX_CHANGES_SHOWN)
      .map((change) => ({ kind: change.kind, location: where, note: change.note })),
    leftAlone: edit.leftAlone.map((row) => `${where}: ${row}`),
  };
}

export const runEditorStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  // Whatever the page is now: the editor's own HTML is preferred by `finalHtml`,
  // but this stage has not run yet on any run that reaches it, so what comes back
  // is the links stage's page or the writer's.
  const html = finalHtml(ctx.artifacts as Record<string, unknown>);
  if (!html.trim()) {
    return blocked(
      "There is no page to edit — no stage before this one produced a body. Run this article again from the writing step: the edit pass changes what is there, it does not write it."
    );
  }

  const draft = readArtifact(ctx, "write", readArticleDraft);
  const title = draft?.title || ctx.brief.keyword;
  // The assembled blocks out first, so what gets split into sections is the prose.
  const carved = carve(html);
  const sections = rawSections(carved.html);
  const before = countHtmlWords(html);
  const { bySection, unplaced, reported } = collect(ctx, sections, carved.kept);
  const leftAlone: string[] = [...unplaced];

  // The sections that can be edited, worst first. Everything ruled out is named
  // here rather than passed over, because "the pass did not change this" and "the
  // pass could not change this" are different facts about the same section.
  const queue: { index: number; problems: Problem[]; weight: number }[] = [];
  for (const [index, problems] of bySection) {
    const section = sections[index];
    if (!section) continue;
    const reason = untouchable(section);
    if (reason) {
      leftAlone.push(reason);
      continue;
    }
    queue.push({
      index,
      problems,
      weight: problems.reduce((sum, problem) => sum + problem.weight, 0),
    });
  }
  queue.sort((a, b) => b.weight - a.weight || a.index - b.index);

  const bodies = sections.map((section) => section.bodyHtml);
  const edited = new Set<number>();
  const changes: EditChange[] = [];

  for (let position = 0; position < queue.length; position += 1) {
    const remaining = queue.length - position;
    const names = queue
      .slice(position)
      .map((row) => `“${nameOf(sections[row.index])}”`)
      .join(", ");

    if (position >= MAX_EDITED_SECTIONS) {
      leftAlone.push(
        `${remaining} further section${remaining === 1 ? "" : "s"} had something said about ${
          remaining === 1 ? "it" : "them"
        } and ${
          remaining === 1 ? "was" : "were"
        } not reached in this pass: ${names}. Continue does not re-run a finished stage, so ${
          remaining === 1 ? "it stands" : "they stand"
        } as written.`
      );
      break;
    }

    // The platform kills the function at 300 seconds. Stopping here keeps the edits
    // already made; being killed mid-call keeps none of them.
    if (outOfTime(ctx, SECTION_BUDGET_MS)) {
      leftAlone.push(
        `There was no time left in this request to edit ${remaining} section${
          remaining === 1 ? "" : "s"
        } that had something said about ${remaining === 1 ? "it" : "them"}, so ${
          remaining === 1 ? "it stands" : "they stand"
        } as written: ${names}.`
      );
      break;
    }
    assertLive(ctx);

    const row = queue[position];
    const outcome = await editSection(
      ctx,
      title,
      sections[row.index],
      row.problems,
      otherHeadings(sections, row.index)
    );
    if (!outcome.ok) {
      leftAlone.push(outcome.reason);
      continue;
    }
    bodies[row.index] = outcome.bodyHtml;
    edited.add(row.index);
    changes.push(...outcome.changes);
    leftAlone.push(...outcome.leftAlone);
  }

  // Untouched parts go back exactly as the split produced them, and the blocks go
  // back where their tokens are, so a page whose edits all failed is byte for byte
  // the page that came in.
  let out = edited.size
    ? restore(
        sections
          .map((section, index) =>
            edited.has(index) ? `${section.headingHtml}\n${bodies[index]}\n\n` : section.raw
          )
          .join("")
          .trim(),
        carved.kept
      )
    : "";

  // The invariant, checked once over the whole page rather than trusted from the
  // section checks: every link the links stage placed is still here. If one is not,
  // the edit is dropped rather than published against a report that names it.
  if (out) {
    const missing = linksIn(html).filter((link) => !out.includes(`href="${link.href}"`));
    if (missing.length) {
      leftAlone.push(
        `${missing.length} link${missing.length === 1 ? "" : "s"} the links stage placed ${
          missing.length === 1 ? "was" : "were"
        } not in the edited page, so the whole edit was dropped and the page stands as it was: ${missing
          .map((link) => link.href)
          .join(", ")}.`
      );
      out = "";
      edited.clear();
      changes.length = 0;
    }
  }

  // And every block that was lifted out is back in it, whole. The tokens are peeled
  // off before a section is sent and stripped out of anything that comes back, so a
  // block can only go missing if the reassembly above lost it — which would publish a
  // page with no contents list against a report that never mentioned one.
  if (out) {
    const lostBlocks = carved.kept.filter((block) => !out.includes(block));
    if (lostBlocks.length) {
      leftAlone.push(
        `${lostBlocks.length} block${lostBlocks.length === 1 ? "" : "s"} this app assembles — a figure, the answers, the contents list — ${
          lostBlocks.length === 1 ? "was" : "were"
        } not in the edited page, so the whole edit was dropped and the page stands as it was.`
      );
      out = "";
      edited.clear();
      changes.length = 0;
    }
  }

  const after = out ? countHtmlWords(out) : before;
  const report: EditPassReport = {
    // Stored only when something really changed. `finalHtml` prefers this stage's
    // HTML over every other's, so an unchanged copy would make the edit pass the
    // source of a page it did not edit.
    html: out || undefined,
    changes,
    wordCountBefore: before,
    wordCountAfter: after,
    leftAlone: leftAlone.slice(0, 20),
  };
  const checked = readEditPassReport(report) || report;

  // What the pass did, in one sentence, naming the checks it worked from. "Nothing
  // was changed" from a run where nothing reported a problem and "nothing was
  // changed" from a run whose findings could not be located are not the same fact.
  const note = edited.size
    ? `${checked.changes.length} change${checked.changes.length === 1 ? "" : "s"} across ${
        edited.size
      } section${edited.size === 1 ? "" : "s"}, working from ${
        reported.length ? reported.join(", ") : "the repeated sentences found in the page"
      }. ${before} words before, ${after} after.`
    : reported.length
      ? `Nothing was changed. What ${reported.join(
          ", "
        )} reported could not be acted on section by section, and the reasons are listed against the pass.`
      : "Nothing was changed: no earlier check reported a problem in this page, and no sentence appears in more than one section.";

  return done(checked, {
    editChanges: checked.changes.length,
    editSectionsChanged: edited.size,
    editKinds: Array.from(new Set(checked.changes.map((change) => change.kind))),
    editWordsBefore: checked.wordCountBefore,
    editWordsAfter: checked.wordCountAfter,
    editLeftAlone: checked.leftAlone.length,
    editNote: note,
  });
};

