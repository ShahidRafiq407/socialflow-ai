/**
 * STAGE 18 — LINKS
 *
 * Internal links come from pages that exist. The site's own sitemap or WordPress
 * index is read, the anchor is chosen against the real page title, and a
 * destination nobody could find is not linked. That is the whole point: the
 * previous build generated plausible URLs on the user's domain, published them,
 * and produced 404s inside a page that claimed to be a resource.
 *
 * External links are only ever the sources this run actually fetched, and each one
 * is requested again here. `reachable` is the result of that request — `true`,
 * `false`, or `null` when it was never made. Nothing is reported as working
 * because it looked plausible.
 *
 * Worth 1.5 of the 100 quality points. Linking is real but small, and a page does
 * not become good by having more of them.
 */

import {
  readArticleDraft,
  readArticleOutline,
  readInternalLinkReport,
  type ExternalLink,
  type InternalLink,
  type InternalLinkReport,
} from "@/lib/article/artifacts";
import { discoverInternalLinkCandidates, type InternalLinkCandidate } from "@/lib/seo/internalLinks";
import { buildSourcesSection, injectLink } from "@/lib/agents/workers/articleAssembly";
import {
  assertLive,
  done,
  readArtifact,
  skipped,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { fetchPage } from "./fetchPage";
import { askJson } from "./router";
const SYSTEM = `You match pages on a site to places in an article where a link would help the reader.

You are given the article's sections and a list of pages that exist on the site, with their real titles and URLs. For each link worth making:
- url: exactly one of the URLs you were given. Never a URL you constructed.
- anchor: the words in the article that should become the link. They must be words a reader would click to get what that page offers, and they must plausibly appear in the section you are pointing at.
- reason: why that page is the right destination for those words. One sentence.

Rules:
- Only link where the destination genuinely helps. Four good links beat twelve.
- Never use the same URL twice.
- Never use "click here", "read more", "this page", or the bare page title as the anchor.
- If none of the pages are relevant to this article, return an empty list. An irrelevant internal link is worse than none.

Return JSON only:
{"links":[{"url":"...","anchor":"...","reason":"..."}]}`;

/** Guard for the match call. Empty is a valid answer; malformed is not. */
function readMatches(value: unknown): InternalLink[] | null {
  const raw = (value as Record<string, unknown> | null) || null;
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.links)) return null;
  return raw.links
    .map((row) => {
      const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        url: String(entry.url ?? "").trim(),
        anchor: String(entry.anchor ?? "").trim(),
        reason: String(entry.reason ?? "").trim(),
      };
    })
    .filter((row) => /^https?:\/\//i.test(row.url) && row.anchor.length > 2);
}

/** The site this article will be published to, if one is known. */
function siteFor(ctx: StageContext): string {
  return (
    ctx.brief.targetWebsite ||
    ctx.workspace.brand.website ||
    ctx.workspace.website ||
    ""
  ).trim();
}

/** The sources this run fetched, as candidate external links. */
function citedSources(ctx: StageContext): { url: string; publisher: string }[] {
  const found = ctx.state.evidenceSources;
  if (!Array.isArray(found)) return [];
  const out: { url: string; publisher: string }[] = [];
  for (const item of found) {
    const url = String((item as any)?.url ?? item ?? "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    let publisher = String((item as any)?.publisher ?? "").trim();
    if (!publisher) {
      try {
        publisher = new URL(url).hostname.replace(/^www\./i, "");
      } catch {
        publisher = "";
      }
    }
    out.push({ url, publisher });
  }
  return out.slice(0, 12);
}
/**
 * The internal links, matched against real pages and nothing else.
 *
 * A model that returns a URL it was not given has invented a page on the user's
 * domain, so the answer is filtered against the candidate list by exact URL
 * rather than trusted.
 */
async function matchInternal(
  ctx: StageContext,
  candidates: InternalLinkCandidate[],
  sections: string[],
  title: string
): Promise<{ links: InternalLink[]; note?: string }> {
  if (candidates.length === 0) return { links: [] };
  const allowed = new Map(candidates.map((row) => [row.url, row]));

  try {
    const matched = await askJson(
      "fast",
      "Internal links",
      {
        system: SYSTEM,
        prompt: [
          `THE ARTICLE: ${title}`,
          `Its query: ${ctx.brief.keyword}`,
          `ITS SECTIONS:\n- ${sections.join("\n- ")}`,
          `PAGES THAT EXIST ON THIS SITE:\n${candidates
            .map((row) => `${row.url}${row.title ? ` — ${row.title}` : ""}`)
            .join("\n")}`,
        ].join("\n\n"),
        meter: ctx.meter,
        signal: ctx.signal,
      },
      readMatches
    );

    const seen = new Set<string>();
    const links: InternalLink[] = [];
    let invented = 0;
    for (const link of matched) {
      if (!allowed.has(link.url)) {
        invented += 1;
        continue;
      }
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      links.push(link);
      if (links.length >= 8) break;
    }
    return {
      links,
      note: invented
        ? `${invented} suggested link${invented === 1 ? " pointed" : "s pointed"} at a URL that is not on the list of pages read from the site, so ${invented === 1 ? "it was" : "they were"} dropped.`
        : undefined,
    };
  } catch {
    if (ctx.signal?.aborted) throw Object.assign(new Error("The run was stopped."), { isCancelled: true });
    return { links: [], note: "The internal link pass failed, so no internal links were added." };
  }
}
/**
 * Each cited source, requested again.
 *
 * A source that was reachable when the research stage read it can be gone by the
 * time the page is published, so the check happens here, at the last moment
 * before the link is placed. A failure is recorded, not hidden.
 */
async function checkExternal(
  ctx: StageContext,
  sources: { url: string; publisher: string }[]
): Promise<{ links: ExternalLink[]; removed: string[] }> {
  const links: ExternalLink[] = [];
  const removed: string[] = [];

  for (const source of sources) {
    assertLive(ctx);
    const page = await fetchPage(source.url, { signal: ctx.signal, timeoutMs: 8_000, maxChars: 1_000 });
    if (page.ok) {
      links.push({
        url: source.url,
        anchor: page.title || source.publisher || source.url,
        publisher: source.publisher,
        reachable: true,
        status: page.status,
      });
    } else {
      removed.push(`${source.url} — ${page.error || `HTTP ${page.status}`}`);
    }
  }
  return { links, removed };
}
/**
 * The links, placed.
 *
 * `injectLink` walks text nodes only and skips anchors and headings, so a link
 * cannot land inside an attribute or inside another link. An anchor whose words
 * are not in the page is reported as not applied rather than forced in — rewriting
 * the prose to fit a link is the wrong way round.
 */
function placeLinks(
  html: string,
  internal: InternalLink[],
  external: ExternalLink[],
  wantSources: boolean
): { html: string; internalApplied: InternalLink[]; externalApplied: ExternalLink[] } {
  let out = html;
  const internalApplied: InternalLink[] = [];
  const externalApplied: ExternalLink[] = [];

  for (const link of internal) {
    const result = injectLink(out, link.anchor, link.url, { title: link.reason });
    if (result.applied) {
      out = result.html;
      internalApplied.push(link);
    }
  }
  for (const link of external) {
    const result = injectLink(out, link.anchor, link.url, { external: true, title: link.publisher });
    if (result.applied) {
      out = result.html;
      externalApplied.push(link);
    }
  }

  // Sources that could not be worked into the prose still belong on the page when
  // the brief asked for a source list — a citation nobody can see is not a citation.
  if (wantSources && external.length > 0) {
    const section = buildSourcesSection(
      external.map((link) => ({ url: link.url, anchorText: link.anchor, label: link.publisher || link.anchor })),
      "Sources"
    );
    if (section) out = `${out}\n\n${section}`;
  }
  return { html: out, internalApplied, externalApplied };
}
export const runLinksStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  if (!ctx.brief.enableInternalLinks && !ctx.brief.enableExternalLinks) {
    return skipped("Both link types were turned off for this article.");
  }

  const draft = readArtifact(ctx, "write", readArticleDraft);
  const outline = readArtifact(ctx, "outline", readArticleOutline);
  const sections = outline?.sections.map((section) => section.heading) || [];
  const title = draft?.title || outline?.title || ctx.brief.keyword;
  const notes: string[] = [];

  let internal: InternalLink[] = [];
  if (ctx.brief.enableInternalLinks) {
    const site = siteFor(ctx);
    if (!site) {
      notes.push(
        "No website is connected, so there are no internal links. Connect the site in the Plugins tab and the next article will link to its real pages."
      );
    } else {
      const found = await discoverInternalLinkCandidates({
        siteUrl: site,
        keyword: ctx.brief.keyword,
        context: title,
        limit: 12,
      });
      assertLive(ctx);
      if (found.note) notes.push(found.note);
      const matched = await matchInternal(ctx, found.candidates, sections, title);
      internal = matched.links;
      if (matched.note) notes.push(matched.note);
      if (found.candidates.length > 0 && internal.length === 0 && !matched.note) {
        notes.push(
          `${found.candidates.length} pages were read from ${site} and none was a relevant destination for this article, so no internal links were added.`
        );
      }
    }
  }

  let external: ExternalLink[] = [];
  let removed: string[] = [];
  if (ctx.brief.enableExternalLinks) {
    const sources = citedSources(ctx);
    if (sources.length === 0) {
      notes.push(
        "This run cited no external sources, so there are no outbound links. Deep mode runs the research and evidence stages that produce them."
      );
    } else {
      const checked = await checkExternal(ctx, sources);
      external = checked.links;
      removed = checked.removed;
      if (removed.length) {
        notes.push(
          `${removed.length} cited source${removed.length === 1 ? "" : "s"} could not be reached when checked just now, so ${removed.length === 1 ? "it is" : "they are"} not linked.`
        );
      }
    }
  }
  const placed = draft?.html
    ? placeLinks(draft.html, internal, external, ctx.brief.enableSources)
    : { html: "", internalApplied: [] as InternalLink[], externalApplied: [] as ExternalLink[] };

  const notPlaced = internal.length - placed.internalApplied.length;
  if (notPlaced > 0) {
    notes.push(
      `${notPlaced} internal link${notPlaced === 1 ? "'s anchor text was" : "s' anchor text was"} not found in the finished page, so ${notPlaced === 1 ? "it was" : "they were"} not placed.`
    );
  }

  const report: InternalLinkReport = {
    // Only what is actually in the page. A link the report claims and the HTML
    // does not contain is the kind of gap that makes the whole report worthless.
    internal: placed.internalApplied,
    external: placed.externalApplied,
    removed,
    html: placed.html || undefined,
    note: notes.length ? notes.join(" ") : undefined,
  };
  const checked = readInternalLinkReport(report) || report;

  return done(checked, {
    internalLinkCount: checked.internal.length,
    externalLinkCount: checked.external.length,
    linksRemoved: checked.removed.length,
    linkAnchors: checked.internal.map((link) => link.anchor),
    ...(checked.note ? { linkNote: checked.note } : {}),
  });
};
