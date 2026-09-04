/**
 * QUICK VS DEEP, AS DATA
 *
 * `stages.ts` says which stages each mode runs. This file says what that means for
 * the person filling in the brief: which of their choices the chosen mode will act
 * on, and what the shorter pipeline does not produce.
 *
 * It exists because that answer was previously nowhere on the screen. The brief drew
 * nine toggles and a quick run quietly ignored four of them — the images it was told
 * to place never appeared, the sources it was told to cite were never fetched — and
 * the only explanation arrived in the quality score's commentary, after the article
 * was written. A control that cannot affect the run has to say so before the run.
 *
 * Everything here is derived from one fact per control: the stage that produces what
 * the control asks for, and whether that stage is in this mode's list. Flip `quick`
 * on a stage in `stages.ts` and every note below follows it. Nothing is stated twice,
 * so nothing can drift.
 *
 * No imports beyond `./stages`, which has none of its own. This is read by a client
 * component and must stay free of Prisma, model SDKs and anything that reaches a
 * network.
 */

import {
  ARTICLE_STAGES,
  stageSpec,
  stagesFor,
  type ArticleRunMode,
  type ArticleStageKey,
  type ArticleStageSpec,
} from "./stages";

/** The brief's on/off choices, under the names the API reads them by. */
export type ArticleBriefControl =
  | "enableToc"
  | "enableFaq"
  | "enableTakeaways"
  | "enableSources"
  | "enableInternalLinks"
  | "enableExternalLinks"
  | "enableImages"
  | "enableYoutube"
  | "humanize";

/**
 * The stage that has to run for a control to change the article.
 *
 * Attribution is to the stage that produces the material, not to the one that reads
 * the flag. `enableExternalLinks` is read by the links stage, which a quick run does
 * reach — but the only outbound links it can place are to sources the research stage
 * fetched, and a quick run has none. Crediting it to `links` would leave an enabled
 * toggle that does nothing, which is the exact bug this file exists to prevent.
 */
export const CONTROL_STAGE: Record<ArticleBriefControl, ArticleStageKey> = {
  enableToc: "write",
  enableFaq: "outline",
  enableTakeaways: "write",
  enableSources: "research",
  enableInternalLinks: "links",
  enableExternalLinks: "research",
  enableYoutube: "media",
  humanize: "write",
  enableImages: "media",
};

/**
 * The words the brief puts on each control.
 *
 * Here rather than in the JSX so the guide's "in both modes" list and the toggle it
 * is describing cannot end up calling the same thing two different names.
 */
export const CONTROL_LABEL: Record<ArticleBriefControl, string> = {
  enableToc: "Table of contents",
  enableFaq: "FAQ section",
  enableTakeaways: "Key takeaways",
  enableSources: "Cited sources",
  enableInternalLinks: "Internal links",
  enableExternalLinks: "External citations",
  enableYoutube: "Embed a relevant video",
  humanize: "Humanising pass",
  enableImages: "Place images automatically",
};

/** Every control, in the order the brief draws them. */
export const BRIEF_CONTROLS = Object.keys(CONTROL_STAGE) as ArticleBriefControl[];

/** Does this mode reach the stage that acts on this control? */
export function controlRunsIn(control: ArticleBriefControl, mode: ArticleRunMode): boolean {
  const key = CONTROL_STAGE[control];
  return stagesFor(mode).some((stage) => stage.key === key);
}

/** The controls this mode will actually act on. */
export function controlsIn(mode: ArticleRunMode): ArticleBriefControl[] {
  return BRIEF_CONTROLS.filter((control) => controlRunsIn(control, mode));
}

/**
 * What happens instead, for a control the mode cannot honour.
 *
 * One line each, and each names the missing stage rather than the plan: what limits
 * this is the pipeline, and Deep is simply the pipeline that has it. A control whose
 * stage runs in both modes has no entry here and needs none.
 */
const INSTEAD: Partial<Record<ArticleBriefControl, string>> = {
  enableSources: "Deep only — a reference list can only name sources the research stage fetched.",
  enableExternalLinks: "Deep only — nothing was fetched, so there is nothing to link out to.",
  enableImages: "Deep only — none are placed for you. Add your own in the media studio below.",
  enableYoutube: "Deep only — the media stage is what finds and places the video.",
};

/**
 * The note to put under a control, or null when this mode will honour it.
 *
 * Null is the common case: five of the nine controls are the same in both modes,
 * which is the reassurance the screen needs as much as the warning.
 */
export function controlNote(
  control: ArticleBriefControl,
  mode: ArticleRunMode
): string | null {
  if (controlRunsIn(control, mode)) return null;
  const stated = INSTEAD[control];
  if (stated) return stated;
  return `Deep only — needs the ${stageSpec(CONTROL_STAGE[control]).label.toLowerCase()} stage.`;
}

/** The stages a quick run does not include, in pipeline order. */
export function deepOnlyStages(): ArticleStageSpec[] {
  return ARTICLE_STAGES.filter((stage) => !stage.quick);
}

export interface ModeSummary {
  mode: ArticleRunMode;
  /** What the button says. */
  name: string;
  /** One line: what this pipeline is. */
  line: string;
  /** One line: when to choose it. The answer to "which one is better". */
  bestFor: string;
}

/**
 * The two sentences a buyer needs, and no more.
 *
 * Deliberately short. Everything specific — the stage names, what each stage does,
 * the credit price, the monthly allowance — is already written down elsewhere and is
 * rendered from there, so this stays two lines per mode and cannot go stale.
 */
export const MODE_SUMMARY: Record<ArticleRunMode, ModeSummary> = {
  quick: {
    mode: "quick",
    name: "Quick",
    line: "A finished, publishable draft written against what already ranks.",
    bestFor: "Volume, and topics you already know well. The cheaper run, by a factor of two.",
  },
  deep: {
    mode: "deep",
    name: "Deep research",
    line: "Everything Quick does, then sources fetched and read, every claim checked against one, images planned, and the whole draft edited again.",
    bestFor: "Pages that have to hold up — money pages, anything with numbers in it, anything a reader will go and check.",
  },
};
