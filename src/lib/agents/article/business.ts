/**
 * STAGE 1 — BUSINESS FACTS
 *
 * Everything downstream depends on this stage being honest. The angle, the proof
 * points, the trust signals and the business relevance score are all built on
 * what this stage establishes, so an invented client name or a made-up credential
 * does not stay contained: it ends up in a published page as a claim about a real
 * company.
 *
 * So the stage does two things and reports both. It reads what is actually on
 * file — the Brand DNA the owner filled in — and it reads the site, if there is
 * one. Then it lists what it could not prove. That list is the point: a later
 * stage that wants one of those facts has to ask for it rather than fill it in.
 *
 * It blocks only in one case: nothing on file and nothing readable. There is no
 * business to write about then, and a generic article about the industry is what
 * the plan exists to prevent.
 */

import { readBusinessProfile, type BusinessProfile } from "@/lib/article/artifacts";
import {
  blocked,
  businessLines,
  done,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { fetchPage, fetchPages, type FetchedPage } from "./fetchPage";
import { askJson } from "./router";

/** Paths worth trying on a site that gave us nothing to follow. */
const COMMON_PATHS = ["/about", "/about-us", "/services", "/what-we-do"];

/** Link text that means "this page explains the business". */
const ABOUT_PATTERN = /about|services|what-we-do|solutions|products|company|team|pricing/i;

function siteFor(ctx: StageContext): string {
  return (
    ctx.workspace.brand.website ||
    ctx.workspace.website ||
    ctx.brief.targetWebsite ||
    ""
  ).trim();
}
/**
 * The homepage, plus up to three pages it links to that look like they explain
 * the business.
 *
 * Following the site's own links is better than guessing paths, because a site
 * that calls its services page `/leistungen` still links to it from the nav. The
 * common paths are only tried when the homepage offered nothing.
 */
async function readSite(
  site: string,
  signal?: AbortSignal
): Promise<{ pages: FetchedPage[]; failures: string[] }> {
  const home = await fetchPage(site, { signal, maxChars: 12_000 });
  if (!home.ok) {
    return { pages: [], failures: [`${home.url || site} — ${home.error}`] };
  }

  const candidates = home.links.filter((url) => ABOUT_PATTERN.test(url)).slice(0, 3);
  const fallback = candidates.length
    ? []
    : COMMON_PATHS.map((path) => {
        try {
          return new URL(path, home.url).toString();
        } catch {
          return "";
        }
      }).filter(Boolean);

  const rest = await fetchPages(candidates.length ? candidates : fallback, {
    signal,
    limit: 3,
    maxChars: 8_000,
  });

  const pages = [home, ...rest.filter((page) => page.ok && page.text.length > 200)];
  const failures = rest
    .filter((page) => !page.ok)
    .map((page) => `${page.url} — ${page.error}`);
  return { pages, failures };
}
const SYSTEM = `You establish what a business actually does, for a writer who will publish a page in that business's name.

Rules you do not break:
- Use only the material given to you. If the material does not say it, it does not go in the summary.
- Anything the writer will probably need but the material does not establish goes in "unverified", phrased as the missing fact: "how many years it has been trading", "whether it is certified", "the name of a client willing to be quoted".
- Never invent a client name, a statistic, an award, a certification, a founding year or a review.
- "proofPoints" are only things the material demonstrates. A slogan is not a proof point.
- Write plainly. No marketing language of your own.

Return JSON only:
{"summary":"one paragraph on what this business does and for whom","services":["..."],"audience":"who it serves","proofPoints":["..."],"unverified":["..."],"sourceUrls":["the pages you used"]}`;

function prompt(ctx: StageContext, pages: FetchedPage[], failures: string[]): string {
  const parts: string[] = [];
  const onFile = businessLines(ctx.workspace);
  parts.push(
    onFile.length
      ? `WHAT THE OWNER HAS FILLED IN (treat as stated by the business itself):\n${onFile.join("\n")}`
      : "WHAT THE OWNER HAS FILLED IN: nothing. The Brand DNA is empty."
  );

  if (pages.length) {
    parts.push(
      `PAGES READ FROM THE SITE:\n${pages
        .map(
          (page) =>
            `--- ${page.url}\nTitle: ${page.title}\nHeadings: ${page.headings.slice(0, 12).join(" | ")}\n${page.text.slice(0, 6_000)}`
        )
        .join("\n\n")}`
    );
  } else {
    parts.push("PAGES READ FROM THE SITE: none.");
  }

  if (failures.length) {
    parts.push(`PAGES THAT COULD NOT BE READ (do not guess what is on them):\n${failures.join("\n")}`);
  }

  parts.push(`The article this feeds will be about: ${ctx.brief.keyword}`);
  return parts.join("\n\n");
}
export const runBusinessStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const site = siteFor(ctx);
  const onFile = businessLines(ctx.workspace);

  const { pages, failures } = site
    ? await readSite(site, ctx.signal)
    : { pages: [] as FetchedPage[], failures: [] as string[] };

  // Nothing on file and nothing readable. There is no business to be specific
  // about, and an article written from here would be about the industry.
  if (pages.length === 0 && onFile.length === 0) {
    return blocked(
      site
        ? `The site at ${site} could not be read (${failures[0] || "no readable page"}), and the Brand DNA is empty, so there are no business facts to write from. Fill in Brand DNA under Settings, or connect a site that can be reached, then run this again.`
        : "No website is connected and the Brand DNA is empty, so there are no business facts to write from. Connect a site in the Plugins tab or fill in Brand DNA under Settings, then run this again."
    );
  }

  const profile: BusinessProfile = await askJson(
    "reasoning",
    "Business facts",
    {
      system: SYSTEM,
      prompt: prompt(ctx, pages, failures),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readBusinessProfile
  );

  // The URLs we actually fetched, not the ones the model listed. A model that
  // "read" a page it was never given is the exact failure this replaces.
  const read = pages.map((page) => page.url);
  const artifact: BusinessProfile = {
    ...profile,
    sourceUrls: read,
    unverified: profile.unverified.length
      ? profile.unverified
      : read.length === 0
        ? ["nothing could be read from the website, so every fact here comes from the Brand DNA only"]
        : [],
  };

  return done(artifact, {
    businessSummary: artifact.summary,
    businessUnverified: artifact.unverified,
    siteRead: read.length,
    siteFailures: failures,
  });
};

