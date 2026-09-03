/**
 * STAGE 2 — CONTENT INVENTORY
 *
 * What the site already has, read from the site.
 *
 * Three later stages put questions to this one. The page-type stage cannot
 * conclude "improve the page you already have" without a page to name. The gap
 * stage needs to know which subjects this business already speaks to. The overlap
 * stage needs the real pages to compare a draft against, because two of a site's
 * own URLs chasing one query is the kind of problem nobody notices until both
 * rank badly.
 *
 * The crawl follows the site's own links rather than guessing paths — a site that
 * calls its services page `/leistungen` still links to it — and the two numbers on
 * the artifact are kept apart on purpose. `discovered` is every page-looking URL
 * the crawl saw; `pages` is what it actually read. One number in place of both
 * would have the panel claim the site has twelve pages when the truth is the crawl
 * had budget for twelve.
 *
 * It never blocks, and it does not decide anything. A site nobody connected, a
 * homepage that times out, and a site with exactly one page are three different
 * facts; the first is a skip and the other two are a `note`, so a stage reading
 * this can tell "the site covers nothing" from "nobody looked".
 *
 * The links stage deliberately does not read this. It has its own discovery
 * through the sitemap and the WordPress index, because a link target has to be a
 * page that exists at the moment the link is placed, not one a crawl saw sixteen
 * stages earlier.
 */

import {
  readContentInventory,
  type ContentInventory,
  type InventoryPage,
} from "@/lib/article/artifacts";
import {
  assertLive,
  done,
  outOfTime,
  skipped,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { fetchPage, fetchPages, type FetchedPage } from "./fetchPage";
import { askJson } from "./router";

/** How many pages get fetched and read. Everything else is counted, not read. */
const MAX_PAGES = 14;

/** How many at a time. Each request carries its own timeout inside `fetchPage`. */
const BATCH = 5;

/** Below this there is boilerplate and nothing to compare a draft against. */
const MIN_TEXT = 250;

/** Files, feeds and endpoints. Not pages. */
const NOT_A_PAGE =
  /\.(jpe?g|png|gif|webp|svg|avif|ico|css|js|mjs|json|xml|rss|txt|pdf|docx?|xlsx?|zip|rar|gz|mp[34]|mov|woff2?|ttf|eot)$/i;

/** Paths every site has, and none of them says anything about what it covers. */
const SKIP_PATH =
  /^\/(wp-admin|wp-login\.php|wp-json|xmlrpc\.php|cart|checkout|basket|my-account|account|login|signin|sign-in|signup|register|password|search|feed|comments|tag|author|cdn-cgi)(\/|$)/i;

/** Link shapes worth reading first: this is where a site keeps its subjects. */
const LIKELY_CONTENT =
  /^\/(blog|news|articles?|posts?|guides?|resources?|insights|learn|knowledge|case-stud|services?|solutions?|products?|shop|what-we-do|projects?|portfolio|industries|sectors|faqs?|pricing|about)/i;

/** The site to crawl, in the same order of preference the business stage uses. */
function siteFor(ctx: StageContext): string {
  return (
    ctx.workspace.brand.website ||
    ctx.workspace.website ||
    ctx.brief.targetWebsite ||
    ""
  ).trim();
}

/**
 * One URL per page, so `/about`, `/about/` and `/about?utm_source=x` are counted
 * once. `discovered` is a claim about how many pages the site has; three spellings
 * of one page would inflate it.
 */
function normalize(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|mc_)/i.test(key) || /^(fbclid|gclid|msclkid|ref|source)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return "";
  }
}

/** Whether this URL is a page on the site being crawled, rather than an asset. */
function isPageUrl(raw: string, origin: string): boolean {
  try {
    const url = new URL(raw);
    if (url.origin !== origin) return false;
    if (NOT_A_PAGE.test(url.pathname)) return false;
    if (SKIP_PATH.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Read order: likely content first, then shallow paths, because depth is noise. */
function rank(raw: string): number {
  try {
    const path = new URL(raw).pathname;
    const depth = path.split("/").filter(Boolean).length;
    return (LIKELY_CONTENT.test(path) ? 0 : 20) + depth;
  } catch {
    return 99;
  }
}

/**
 * Words in the text that was fetched.
 *
 * `fetchPage` caps a page's text, so this is a count of what was read rather than
 * of what the page contains — which is the only count that can be checked. It
 * feeds the gap and overlap comparisons. No stage scores an article on it.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface Crawl {
  /** The origin actually reached, after redirects. */
  site: string;
  read: FetchedPage[];
  unreadable: { url: string; reason: string }[];
  /** Page-looking URLs seen, including the ones there was no budget for. */
  discovered: number;
  /** True when the request's own clock ended the crawl, not the site. */
  stoppedEarly: boolean;
}

/**
 * The homepage, then the pages it links to, then the pages those link to.
 *
 * Two levels rather than one because a site's subjects are usually one click past
 * the index: the nav gives `/blog`, and the posts are what the gap stage needs.
 * The queue is re-sorted each pass, so the deeper URLs a listing page adds compete
 * with the shallow ones already waiting instead of always losing to them.
 */
async function crawl(ctx: StageContext, site: string): Promise<Crawl> {
  const home = await fetchPage(site, { signal: ctx.signal });
  if (!home.ok) {
    return {
      site: home.url || site,
      read: [],
      unreadable: [{ url: home.url || site, reason: home.error || "The homepage could not be read." }],
      discovered: 0,
      stoppedEarly: false,
    };
  }

  const origin = new URL(home.url).origin;
  const seen = new Set<string>([normalize(home.url)]);
  const queue: string[] = [];
  const enqueue = (links: string[]) => {
    for (const link of links) {
      const url = normalize(link);
      if (!url || seen.has(url) || !isPageUrl(url, origin)) continue;
      seen.add(url);
      queue.push(url);
    }
  };
  enqueue(home.links);

  const read: FetchedPage[] = [home];
  const unreadable: { url: string; reason: string }[] = [];
  let stoppedEarly = false;

  while (queue.length > 0 && read.length < MAX_PAGES) {
    assertLive(ctx);
    // Enough left in the request to label what has been read and write the row.
    if (outOfTime(ctx, 45_000)) {
      stoppedEarly = true;
      break;
    }
    queue.sort((a, b) => rank(a) - rank(b));
    const batch = queue.splice(0, Math.min(BATCH, MAX_PAGES - read.length));
    const fetched = await fetchPages(batch, { signal: ctx.signal, limit: batch.length });
    for (const page of fetched) {
      if (!page.ok) {
        unreadable.push({ url: page.url, reason: page.error || `The page returned HTTP ${page.status}.` });
        continue;
      }
      if (page.text.length < MIN_TEXT) {
        unreadable.push({
          url: page.url,
          reason: `Only ${page.text.length} characters of readable text, so there is nothing on it to compare.`,
        });
        continue;
      }
      read.push(page);
      enqueue(page.links);
    }
  }

  return { site: origin, read, unreadable, discovered: seen.size, stoppedEarly };
}

const SYSTEM = `You label pages that were read from one company's website. You do not judge them.

For every page you are given, return:
- url: exactly the URL you were given. Never a URL you construct or tidy up.
- topic: what the page is about, in two to six words, as a subject and not as a headline. "Epoxy floor installation", not "The 7 best floors for warehouses".
- linkTarget: true when an article on this site could sensibly send a reader to this page for more on that subject. A cart, a legal notice, a contact form, a login, or a page that is mostly navigation is false.

Then, once for the whole site:
- topics: the subjects this site covers, de-duplicated across the pages, most central to the business first. Ten at most, and only subjects the pages you were given are actually about.

Rules you do not break:
- Judge only from the title and headings you were given. Where they say almost nothing, give the plainest topic the title supports.
- Never add a page that was not in the list, and never leave one out.
- No marketing language. A topic is a subject, not a pitch.

Return JSON only:
{"pages":[{"url":"...","topic":"...","linkTarget":true}],"topics":["..."]}`;

interface Labels {
  pages: { url: string; topic: string; linkTarget: boolean }[];
  topics: string[];
}

/** Guard for the labelling call. Two lists, and nothing derived from them. */
function readLabels(value: unknown): Labels | null {
  const raw = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!raw) return null;
  const pages = (Array.isArray(raw.pages) ? raw.pages : [])
    .map((row) => {
      const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        url: String(entry.url ?? "").trim(),
        topic: String(entry.topic ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        linkTarget: entry.linkTarget === true,
      };
    })
    .filter((row) => /^https?:\/\//i.test(row.url));
  const topics = Array.from(
    new Set(
      (Array.isArray(raw.topics) ? raw.topics : [])
        .map((item) => String(item ?? "").replace(/\s+/g, " ").trim())
        .filter((item) => item.length > 0 && item.length <= 80)
    )
  ).slice(0, 10);
  if (pages.length === 0 && topics.length === 0) return null;
  return { pages, topics };
}

/** The pages as the model sees them: their real titles and their real headings. */
function prompt(ctx: StageContext, read: FetchedPage[]): string {
  const pages = read
    .map(
      (page, index) =>
        `${index + 1}. ${page.url}\n   Title: ${page.title || "(none)"}\n   Headings: ${
          page.headings.slice(0, 10).join(" | ") || "(none)"
        }`
    )
    .join("\n");
  return [
    `The business: ${ctx.workspace.brand.brandName || ctx.workspace.name || "(not on file)"}`,
    `PAGES READ FROM THE SITE:\n${pages}`,
  ].join("\n\n");
}

export const runInventoryStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const site = siteFor(ctx);
  if (!site) {
    // Not a failure and not a finding: there is no site to take an inventory of.
    // Named as a skip so the progress list says so instead of showing a finished
    // stage with an empty table under it.
    return skipped(
      "No website is connected, so there are no existing pages to read. Connect the site in the Plugins tab and the next deep run will compare against its real pages."
    );
  }

  const crawled = await crawl(ctx, site);
  const notes: string[] = [];

  if (crawled.read.length === 0) {
    notes.push(
      `Nothing could be read from ${site}: ${crawled.unreadable[0]?.reason || "the homepage did not respond"}. No stage after this one has seen the site's own pages.`
    );
  } else if (crawled.read.length === 1) {
    notes.push(
      "Only the homepage could be read, so this run has no other page of the site to compare against."
    );
  }
  if (crawled.stoppedEarly) {
    notes.push(
      `The crawl stopped at ${crawled.read.length} pages to leave time in the request, so the site has more pages than are listed here.`
    );
  }

  // Titles, headings and counts are ours. Only the topic label and the
  // link-target judgement come from the model, and a failure here costs those two
  // fields rather than the crawl.
  let labels: Labels = { pages: [], topics: [] };
  if (crawled.read.length > 0) {
    try {
      labels = await askJson(
        "fast",
        "Content inventory",
        { system: SYSTEM, prompt: prompt(ctx, crawled.read), meter: ctx.meter, signal: ctx.signal },
        readLabels
      );
    } catch (error) {
      assertLive(ctx); // a stopped run stops here rather than recording a note
      notes.push(
        `The pages were read, but the labelling pass failed (${
          (error as Error)?.message || "unknown error"
        }), so each page is listed under its own title and none is offered as a link target.`
      );
    }
  }

  const labelled = new Map(labels.pages.map((row) => [normalize(row.url), row]));
  const pages: InventoryPage[] = crawled.read.map((page) => {
    const label = labelled.get(normalize(page.url));
    return {
      url: page.url,
      title: page.title,
      headings: page.headings.slice(0, 40),
      wordCount: countWords(page.text),
      // The page's own title when nothing labelled it, which is a fact about the
      // page. `linkTarget` stays false: an unjudged page is not offered up as a
      // destination on the strength of having been fetched.
      topic: label?.topic || page.title,
      linkTarget: label?.linkTarget === true,
    };
  });

  const artifact: ContentInventory = {
    site: crawled.site,
    pages,
    discovered: crawled.discovered,
    unreadable: crawled.unreadable,
    topics: labels.topics,
    note: notes.length ? notes.join(" ") : undefined,
  };

  // Back through the artifact's own guard, so the row stores exactly what every
  // later stage will parse out of it.
  const checked = readContentInventory(artifact) || artifact;
  return done(checked, {
    inventorySite: checked.site,
    inventoryRead: checked.pages.length,
    inventoryDiscovered: checked.discovered,
    inventoryUnreadable: checked.unreadable.length,
    inventoryTopics: checked.topics,
    inventoryLinkTargets: checked.pages.filter((page) => page.linkTarget).length,
    ...(checked.note ? { inventoryNote: checked.note } : {}),
  });
};
