/**
 * STAGE 16 — SEO FUNDAMENTALS
 *
 * The things a function can establish, established by a function. Title length,
 * description length, one H1, headings that descend without skipping a level,
 * whether the query appears where a reader would expect it, images without alt
 * text. Every one of those is a fact about the HTML, so none of them is put to a
 * model.
 *
 * It is worth 5 of the 100 quality points, deliberately. These are hygiene: a page
 * fails them by accident, and a page that passes them all is not thereby good.
 *
 * The one thing this stage writes rather than measures is the meta description,
 * because there is nowhere else in the pipeline that produces one — and then it
 * measures what it wrote, against the same rule as everything else.
 */

import {
  readArticleDraft,
  readArticleOutline,
  readSeoReport,
  type SeoField,
  type SeoReport,
} from "@/lib/article/artifacts";
import { countKeywordOccurrences, stripHtml } from "@/lib/agents/workers/articleAssembly";
import {
  blocked,
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askText } from "./router";

/** Google truncates around here. Not a rule, a display width. */
const TITLE_MIN = 25;
const TITLE_MAX = 62;
const DESC_MIN = 110;
const DESC_MAX = 158;
const DESC_SYSTEM = `You write one meta description. It is the sentence a person reads in the results before they decide whether to click.

- Say what the page tells them and why it is worth their time. Nothing else.
- Between 120 and 155 characters. Count them.
- Use the query's words if they fit naturally. Never repeat the title.
- No "Learn more", no "Discover", no "In this article", no "Read on", no ellipsis, no exclamation mark.
- Never promise anything the page does not deliver.

Return the description as plain text. No quotes, no label, no explanation.`;

/** Every heading in the order it appears, with its level. */
function headingLevels(html: string): { level: number; text: string }[] {
  return Array.from(html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)).map((match) => ({
    level: Number(match[1]),
    text: stripHtml(match[2]).replace(/\s+/g, " ").trim(),
  }));
}

/**
 * Whether the headings descend a level at a time.
 *
 * H2 → H4 is the failure: a screen reader announces a level that has no parent,
 * and the outline of the page stops matching what it looks like. Going back up is
 * fine — H3 → H2 starts a new section.
 */
function descendsCleanly(headings: { level: number }[]): boolean {
  let previous = 1;
  for (const heading of headings) {
    if (heading.level > previous + 1) return false;
    previous = heading.level;
  }
  return true;
}

function titleField(title: string, keyword: string): SeoField {
  const length = title.length;
  const notes: string[] = [];
  if (!title) notes.push("There is no title.");
  else if (length < TITLE_MIN) notes.push(`The title is ${length} characters — too short to say what the page is.`);
  else if (length > TITLE_MAX) notes.push(`The title is ${length} characters, so search results will cut it off around ${TITLE_MAX}.`);
  if (title && keyword && !title.toLowerCase().includes(keyword.toLowerCase())) {
    notes.push("The title does not contain the query, so a reader scanning results has to infer the match.");
  }
  return {
    value: title,
    length,
    ok: Boolean(title) && length >= TITLE_MIN && length <= TITLE_MAX,
    note: notes.length ? notes.join(" ") : undefined,
  };
}
function descriptionField(description: string): SeoField {
  const length = description.length;
  const notes: string[] = [];
  if (!description) notes.push("There is no meta description, so search engines will assemble one from the page.");
  else if (length < DESC_MIN) notes.push(`The description is ${length} characters — short enough that it wastes the space.`);
  else if (length > DESC_MAX) notes.push(`The description is ${length} characters, so it will be cut off around ${DESC_MAX}.`);
  return {
    value: description,
    length,
    ok: Boolean(description) && length >= DESC_MIN && length <= DESC_MAX,
    note: notes.length ? notes.join(" ") : undefined,
  };
}

/** The first paragraph's text, which is where the query belongs if anywhere. */
function firstParagraph(html: string): string {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return match ? stripHtml(match[1]).replace(/\s+/g, " ").trim() : "";
}

/** Written once, then measured like everything else. */
async function writeDescription(ctx: StageContext, title: string, excerpt: string): Promise<string> {
  try {
    const raw = await askText("fast", {
      system: DESC_SYSTEM,
      prompt: `Query: ${ctx.brief.keyword}\nPage title: ${title}\nHow the page opens: ${excerpt || "(no opening was captured)"}${
        ctx.brief.language ? `\nWrite it in: ${ctx.brief.language}` : ""
      }`,
      meter: ctx.meter,
      signal: ctx.signal,
    });
    return raw.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").slice(0, 200);
  } catch {
    if (ctx.signal?.aborted) throw Object.assign(new Error("The run was stopped."), { isCancelled: true });
    return "";
  }
}
export const runSeoStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const draft = readArtifact(ctx, "write", readArticleDraft);
  if (!draft || !draft.html.trim()) {
    return blocked(
      "There is nothing to measure — the writing stage produced no draft. Run this article again from the writing step."
    );
  }
  const outline = readArtifact(ctx, "outline", readArticleOutline);
  const keyword = ctx.brief.keyword;
  const html = draft.html;

  const description = await writeDescription(ctx, draft.title, draft.excerpt);
  const headings = headingLevels(html);
  const intro = firstParagraph(html);
  const images = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((match) => match[0]);
  const withoutAlt = images.filter((tag) => !/\salt\s*=\s*["'][^"']+["']/i.test(tag)).length;

  const report: SeoReport = {
    title: titleField(draft.title, keyword),
    metaDescription: descriptionField(description),
    slug: outline?.slug || "",
    h1Count: headings.filter((heading) => heading.level === 1).length,
    headingOrderOk: descendsCleanly(headings),
    keywordInTitle: Boolean(keyword) && draft.title.toLowerCase().includes(keyword.toLowerCase()),
    keywordInFirstParagraph: Boolean(keyword) && countKeywordOccurrences(intro, keyword) > 0,
    keywordInHeadings: keyword
      ? headings.filter((heading) => countKeywordOccurrences(heading.text, keyword) > 0).length
      : 0,
    imagesWithoutAlt: withoutAlt,
    issues: [],
  };
  // One sentence per problem, each naming the specific thing that is wrong. The
  // plan's rule: nothing downstream is allowed to say "SEO failed".
  const issues: string[] = [];
  if (report.title.note) issues.push(report.title.note);
  if (report.metaDescription.note) issues.push(report.metaDescription.note);
  if (!report.slug) issues.push("No slug was planned, so the URL will be generated by the CMS from the title.");
  if (report.h1Count > 0) {
    issues.push(
      `The draft contains ${report.h1Count} H1 heading${report.h1Count === 1 ? "" : "s"}. The page title is the H1 in every CMS this publishes to, so these duplicate it.`
    );
  }
  if (!report.headingOrderOk) {
    issues.push("The headings skip a level — an H2 is followed by an H4 somewhere, which breaks the page's outline for screen readers.");
  }
  if (!report.keywordInFirstParagraph) {
    issues.push(`The opening paragraph does not use the words "${keyword}", so a reader cannot confirm in one line that they landed in the right place.`);
  }
  if (report.keywordInHeadings === 0 && keyword) {
    issues.push(`No heading uses the words "${keyword}" or a close variant.`);
  }
  if (report.imagesWithoutAlt > 0) {
    issues.push(
      `${report.imagesWithoutAlt} image${report.imagesWithoutAlt === 1 ? " has" : "s have"} no alt text, which fails accessibility and leaves the image unindexed.`
    );
  }
  report.issues = issues;

  const checked = readSeoReport(report) || report;
  return done(checked, {
    metaDescription: checked.metaDescription.value,
    metaTitle: checked.title.value,
    slug: checked.slug,
    seoIssues: checked.issues,
    // Both fed to the score's SEO dimension, which reads counts and never grades
    // keyword density or length.
    seoIssueCount: checked.issues.length,
    seoTitleOk: checked.title.ok,
    seoDescriptionOk: checked.metaDescription.ok,
  });
};
