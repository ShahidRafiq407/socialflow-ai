/**
 * STAGE 3 — PAGE TYPE
 *
 * The one stage allowed to conclude that the right move is not a new article.
 *
 * A query is not always asking for an explanation. Sometimes it is someone ready
 * to hire, and what the site is missing is a page that sells the work rather than
 * a guide about it. Sometimes the site already has the page, and publishing a
 * second one splits the two against each other — which is a decision that has to
 * be made here, before nine stages of work go into the wrong format.
 *
 * `update_existing` is the choice this stage guards hardest. Its URL has to be one
 * of the pages the inventory crawl actually read: a model that picks a plausible
 * `/blog/what-epoxy-costs` on the customer's own domain has invented the page it
 * is recommending they improve, and the recommendation would be to go and edit a
 * 404. So the guard checks membership, and a run with no inventory simply cannot
 * reach that choice.
 *
 * It does not stop the run either way. The choice, the reason and the page it
 * names are recorded on the run, the outline plans against `requiredElements`, and
 * the person who asked for the article is the one who decides what to do about
 * being told they already have it.
 *
 * One case skips the judgement entirely: a run carrying `brief.updateUrl` was
 * started from an optimisation proposal a person approved against a page this
 * workspace published. There the decision is an input, so this stage records it and
 * spends nothing.
 */

import {
  readBusinessProfile,
  readContentInventory,
  readPageTypeDecision,
  type BusinessProfile,
  type ContentInventory,
  type PageTypeDecision,
} from "@/lib/article/artifacts";
import {
  businessLines,
  done,
  readArtifact,
  type StageContext,
  type StageResult,
  type StageRunner,
} from "./contract";
import { askJson } from "./router";

/** How many of the site's pages the decision is shown. Enough to recognise one. */
const SHOW_PAGES = 40;

/**
 * One key per page, so a trailing slash or a capitalised host does not turn a real
 * page into an unknown one. Only used for matching — the URL that gets stored is
 * the crawl's own.
 */
function key(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

const SYSTEM = `You decide what kind of page answers a query for one specific business. You do not write it.

Choose exactly one:
- article — the query wants something explained, and no page on this site answers it.
- service_page — the query is somebody looking to hire or buy, and what is missing is a page that sells the work rather than one that explains it.
- comparison — the query is choosing between named options, and the page's job is to compare them honestly, including saying when the business's own option is the wrong one.
- update_existing — a page on this site already covers this query, and publishing a second one would split them against each other. The right move is to improve the page that exists.

Then give:
- reason: why this format, for this query, in one or two sentences. Name what the reader is trying to do.
- existingUrl: required for update_existing, and it must be one of the URLs you were given, character for character. Omit it for every other choice.
- requiredElements: what this format has to contain to answer this query — the parts a reader would notice were missing. Three to eight. The outline is planned against this list, so each one must name something that appears on the page: "what it costs per square metre, with what changes the figure", not "be helpful".

Rules you do not break:
- Never name a URL that is not in the list of pages read from the site. If nothing in the list covers the query, do not choose update_existing.
- Do not choose update_existing because a page is merely related. The test is whether a reader with this query would be satisfied by that page once it had been improved.
- Judge from what you were given. Never assume a page exists because a site of this kind usually has one.
- No marketing language, and no advice about keywords.

Return JSON only:
{"choice":"article","reason":"...","existingUrl":"","requiredElements":["..."]}`;

/**
 * The decision, refused when it names a page nobody read.
 *
 * `readPageTypeDecision` already requires an absolute URL for `update_existing`;
 * this adds the part the guard cannot know — that the URL has to be one of the
 * pages this run's crawl actually fetched. A URL that only looks right is how a
 * recommendation to improve an existing page becomes a recommendation to edit
 * something that was never there. `known` maps the match key to the crawl's own
 * spelling of the URL, so what gets stored is the URL that was read.
 */
function decisionFrom(known: Map<string, string>) {
  return (value: unknown): PageTypeDecision | null => {
    const decision = readPageTypeDecision(value);
    if (!decision) return null;
    if (decision.choice !== "update_existing") {
      // A URL offered alongside any other choice is noise: nothing downstream
      // would know what to do with a page the run is not updating.
      return { ...decision, existingUrl: undefined };
    }
    const canonical = known.get(key(decision.existingUrl || ""));
    if (!canonical) return null;
    return { ...decision, existingUrl: canonical };
  };
}

function prompt(
  ctx: StageContext,
  business: BusinessProfile | null,
  inventory: ContentInventory | null
): string {
  const parts: string[] = [`Query: ${ctx.brief.keyword}`];
  if (ctx.brief.title) parts.push(`Working title the user typed: ${ctx.brief.title}`);
  if (ctx.brief.targetCountry) parts.push(`Read by people in: ${ctx.brief.targetCountry}`);

  if (business) {
    parts.push(
      `WHAT THIS BUSINESS DOES:\n${business.summary}${
        business.services.length ? `\nServices: ${business.services.join(", ")}` : ""
      }${business.audience ? `\nWho it serves: ${business.audience}` : ""}`
    );
  } else {
    const onFile = businessLines(ctx.workspace);
    parts.push(
      onFile.length
        ? `WHAT THE OWNER HAS FILLED IN:\n${onFile.join("\n")}`
        : "BUSINESS FACTS: none established on this run."
    );
  }

  const pages = inventory?.pages ?? [];
  if (pages.length) {
    parts.push(
      `PAGES READ FROM THIS SITE (the only pages you may name):\n${pages
        .slice(0, SHOW_PAGES)
        .map((page) => `${page.url} — ${page.title || "(no title)"}${page.topic ? ` — about: ${page.topic}` : ""}`)
        .join("\n")}`
    );
    if (inventory?.note) {
      parts.push(`ABOUT THAT CRAWL: ${inventory.note}`);
    }
  } else {
    parts.push(
      `PAGES READ FROM THIS SITE: none${
        inventory?.note ? ` — ${inventory.note}` : " were read on this run"
      }. "update_existing" is not available: there is no page you could name.`
    );
  }
  return parts.join("\n\n");
}

export const runContentTypeStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  const business = readArtifact(ctx, "business", readBusinessProfile);
  const inventory = readArtifact(ctx, "inventory", readContentInventory);

  // A run started from an approved optimisation proposal already knows the answer:
  // the page is one this workspace published, and a person read the proposal and
  // approved it against that page. Asking a model to re-derive that from a crawl
  // would let it overturn a decision that has already been made — and a crawl that
  // happened not to reach the page would overturn it by accident. No model call.
  if (ctx.brief.updateUrl) {
    const stated: PageTypeDecision = {
      choice: "update_existing",
      reason: `This run updates ${ctx.brief.updateUrl}, the page an approved optimisation proposal was raised against. The page and the points below came from that proposal, not from this stage.`,
      existingUrl: ctx.brief.updateUrl,
      requiredElements: (ctx.brief.mustCover ?? []).slice(0, 16),
    };
    const decision = readPageTypeDecision(stated) ?? stated;
    return done(decision, {
      pageType: decision.choice,
      pageTypeReason: decision.reason,
      requiredElements: decision.requiredElements,
      updateExistingUrl: decision.existingUrl,
      // Stated, not chosen — the run's log should not imply pages were weighed.
      pageTypeSource: "approved_proposal",
    });
  }

  const known = new Map<string, string>();
  for (const page of inventory?.pages ?? []) {
    const match = key(page.url);
    if (match) known.set(match, page.url);
  }

  const decision: PageTypeDecision = await askJson(
    "reasoning",
    "Page type",
    {
      system: SYSTEM,
      prompt: prompt(ctx, business, inventory),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    decisionFrom(known)
  );

  return done(decision, {
    pageType: decision.choice,
    pageTypeReason: decision.reason,
    // Read by the outline, which plans a section against each of these.
    requiredElements: decision.requiredElements,
    // Present only when the page it names was really read from the site.
    ...(decision.existingUrl ? { updateExistingUrl: decision.existingUrl } : {}),
    pagesConsidered: known.size,
  });
};
