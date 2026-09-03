/**
 * STAGE 19 — MEDIA
 *
 * A plan, not pictures. This stage decides what each image has to show, which
 * section it belongs beside, and what its alt text says; fetching or rendering it
 * happens elsewhere, with this plan as the brief.
 *
 * Two things it will not do.
 *
 * It will not put an image under every heading. The previous build did, which is
 * how a page ends up with six stock photographs of people shaking hands, and it is
 * why `noImage` is part of the artifact: a section left plain on purpose is a
 * decision worth recording rather than an omission to explain later.
 *
 * And it will not plan an image beside a heading the page does not have. Every
 * planned image is matched to a real H2 in the draft, and one that names a section
 * nobody wrote is dropped and counted — a plan whose placements do not exist would
 * be assembled into an article with the pictures in the wrong places.
 *
 * The count comes from the brief, capped, and the style hint is passed through as
 * the owner wrote it. Alt text is written for a reader who cannot see the image, so
 * the keyword is not in it unless the image genuinely shows the thing the keyword
 * names.
 */

import {
  readArticleDraft,
  readMediaPlan,
  type MediaPlan,
  type PlannedImage,
} from "@/lib/article/artifacts";
import {
  assertLive,
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

/** What the brief asks for when it says nothing, and the ceiling on what it can. */
const DEFAULT_IMAGES = 2;
const MAX_IMAGES = 6;
/** How much of the draft the plan is written from. Headings and their openings. */
const SECTION_CHARS = 600;
/** One call, with room to assemble the plan afterwards. */
const PLAN_BUDGET_MS = 35_000;

const SYSTEM = `You decide what images a page needs, and where a page is better without one.

You are given a page's sections and how many images the owner asked for. Plan at most that many, plus the hero.

For each image:
- role: "hero" for the one at the top, "section" for the rest.
- heading: the heading it goes beside, copied exactly from the list. Empty for the hero.
- purpose: what the reader understands with it that they would not without it. This is the test an image has to pass. "Breaks up the text" is not a purpose. "Shows the difference between the two joint types the section compares" is.
- alt: what a reader who cannot see the image needs told, in one sentence. Describe the image, not the page. No keyword stuffing: alt text is read aloud to someone, and a keyword in it helps nobody.
- searchTerms: two to four search terms for finding a real photograph of this. Concrete nouns.
- prompt: one sentence describing the image to render, if it has to be made rather than found. Say what is in frame.

Then:
- noImage: the headings that are better with no image, each with the reason after a dash. A section explaining a process step by step is usually better as text.
- video: only when the subject genuinely needs to be seen in motion — a technique, an installation, a physical comparison. Give purpose and searchTerms. Omit it entirely otherwise.

Rules you do not break:
- Only use headings from the list you were given.
- An image whose purpose you cannot state in concrete terms is not planned. Fewer, better.
- Do not plan a photograph of something that cannot be photographed. An abstract idea needs a diagram, and if it needs a diagram say so in the prompt.
- Never describe an image as showing this specific business's own work, team, or premises. Nobody has one of those to give you.
- Alt text is a description, not a caption and not a heading.

Return JSON only:
{"images":[{"role":"hero","heading":"","purpose":"...","alt":"...","searchTerms":["..."],"prompt":"..."}],"noImage":["Heading — why"],"video":{"purpose":"...","searchTerms":["..."]}}`;

/** What the brief asked for, capped. Never a model's idea of how many. */
function wantedImages(ctx: StageContext): number {
  const asked = ctx.brief.imageCount ?? DEFAULT_IMAGES;
  return Math.max(0, Math.min(MAX_IMAGES, Math.round(asked)));
}

export const runMediaStage: StageRunner = async (ctx: StageContext): Promise<StageResult> => {
  if (!ctx.brief.enableImages && !ctx.brief.enableYoutube) {
    return skipped("Images and video were both turned off for this article.");
  }

  const draft = readArtifact(ctx, "write", readArticleDraft);
  const blocks = draft?.html ? draftBlocks(draft.html) : [];
  const sections = blocks.filter((block) => block.heading);
  if (!draft || sections.length === 0) {
    // Without headings there is nowhere to place a section image, and a plan whose
    // placements do not exist is worse than no plan.
    return skipped(
      draft
        ? "The draft has no headings to place images beside, so no media was planned."
        : "There is no draft to plan media for, so nothing was planned. Images are placed against the finished sections, not before they exist."
    );
  }

  if (outOfTime(ctx, PLAN_BUDGET_MS)) {
    return skipped(
      "There was no time left in this request to plan the page's media, so none was planned. The page publishes without images rather than with images nobody chose."
    );
  }
  assertLive(ctx);

  const wanted = ctx.brief.enableImages ? wantedImages(ctx) : 0;
  const style = (ctx.brief.imageStyle || "").trim();
  const headings = sections.map((section) => section.heading);

  const plan = await askJson(
    "reasoning",
    "Media plan",
    {
      system: SYSTEM,
      prompt: [
        `THE PAGE: ${draft.title}`,
        `The query it answers: ${ctx.brief.keyword}`,
        ctx.brief.enableImages
          ? `HOW MANY IMAGES THE OWNER ASKED FOR: ${wanted} in the body${
              wanted === 0 ? " — plan the hero only" : ", plus the hero"
            }.${style ? ` The style they asked for: ${style}. Say it in each prompt.` : ""}`
          : "IMAGES ARE TURNED OFF for this article. Plan none, and return an empty images list.",
        ctx.brief.enableYoutube
          ? "VIDEO IS ALLOWED, if the subject needs to be seen in motion. It usually does not."
          : "VIDEO IS TURNED OFF for this article. Omit it.",
        `ITS SECTIONS — the only headings you may name:\n${sections
          .map(
            (section) =>
              `## ${section.heading}\n${section.text.slice(0, SECTION_CHARS)}${
                section.text.length > SECTION_CHARS ? "…" : ""
              }`
          )
          .join("\n\n")}`,
        "Return the JSON.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      meter: ctx.meter,
      signal: ctx.signal,
    },
    readMediaPlan
  );

  // Placements checked against the real headings. A hero has no heading; anything
  // else has to name a section that exists, or it cannot be placed at all.
  const real = new Set(headings);
  const notes: string[] = [];
  let misplaced = 0;
  let hero: PlannedImage | null = null;
  const body: PlannedImage[] = [];
  const usedHeadings = new Set<string>();

  for (const image of plan.images) {
    if (image.role === "hero") {
      // One hero. A second is a body image that lost its heading, so it is dropped
      // rather than promoted to a place the page has only one of.
      if (!hero) hero = { ...image, heading: "" };
      else misplaced += 1;
      continue;
    }
    if (!real.has(image.heading)) {
      misplaced += 1;
      continue;
    }
    // One image per section. Two under one heading is the pattern this stage exists
    // to prevent.
    if (usedHeadings.has(image.heading)) continue;
    usedHeadings.add(image.heading);
    body.push(image);
  }

  const images = ctx.brief.enableImages ? [...(hero ? [hero] : []), ...body.slice(0, wanted)] : [];
  const trimmed = ctx.brief.enableImages ? Math.max(0, body.length - wanted) : 0;

  if (misplaced) {
    notes.push(
      `${misplaced} planned image${misplaced === 1 ? "" : "s"} named a section this page does not have, so ${
        misplaced === 1 ? "it was" : "they were"
      } dropped.`
    );
  }
  if (trimmed) {
    notes.push(
      `${trimmed} more ${trimmed === 1 ? "image was" : "images were"} planned than the ${wanted} asked for, so the extra ${
        trimmed === 1 ? "one was" : "ones were"
      } left out.`
    );
  }
  if (ctx.brief.enableImages && !hero) {
    notes.push("No hero image was planned, so the page opens on its own words.");
  }
  if (!ctx.brief.enableImages) {
    notes.push("Images were turned off for this article, so only the video was considered.");
  }

  const artifact: MediaPlan = {
    images,
    // The brief decides, not the plan: a video on a page whose owner turned video
    // off is a setting being overruled by a model.
    video: ctx.brief.enableYoutube ? plan.video : undefined,
    // Only headings the page has. The reason is kept as the model wrote it, after
    // the dash it was asked for.
    noImage: plan.noImage.filter((row) => real.has(row.split("—")[0].trim()) || real.has(row.trim())),
    note: notes.length ? notes.join(" ") : plan.note,
  };
  const checked = readMediaPlan(artifact) || artifact;

  // What the guard threw out: an image with no alt text or no stated purpose is not
  // a plan, and the count of those is worth seeing rather than a silent shortfall.
  const unusable = images.length - checked.images.length;
  if (unusable > 0) {
    checked.note = `${checked.note ? `${checked.note} ` : ""}${unusable} planned image${
      unusable === 1 ? " had" : "s had"
    } no alt text or no stated purpose, so ${unusable === 1 ? "it was" : "they were"} dropped.`;
  }

  return done(checked, {
    imagesPlanned: checked.images.length,
    imageAltText: checked.images.map((image) => image.alt).slice(0, 8),
    imageSearchTerms: checked.images.flatMap((image) => image.searchTerms).slice(0, 12),
    heroPlanned: checked.images.some((image) => image.role === "hero"),
    sectionsLeftPlain: checked.noImage.length,
    videoPlanned: Boolean(checked.video),
    ...(checked.video ? { videoSearchTerms: checked.video.searchTerms.slice(0, 6) } : {}),
    ...(misplaced ? { mediaPlacementsDropped: misplaced } : {}),
    ...(checked.note ? { mediaNote: checked.note } : {}),
  });
};
