/**
 * A CONTROL THE RUN WILL IGNORE HAS TO SAY SO
 *
 * WHY THIS EXISTS: the brief draws nine toggles and a quick run only reaches the stages
 * that act on five of them. Which five is not a matter of taste — it is which agent reads
 * which brief field, and `modes.ts` is where that mapping is written down for the screen.
 *
 * The mapping is the kind of fact that rots silently. Move a stage's `quick` flag, or make
 * the media stage part of the quick pipeline, and the notes under the toggles are wrong in
 * a direction nobody notices: the screen promises images the run never places. So the four
 * deep-only controls are pinned by name here, against what the agents actually read:
 *
 *   enableImages, enableYoutube   only `agents/article/media.ts` reads them, stage 19, deep
 *   enableSources                 the reference list is built from fetched sources, stage 10
 *   enableExternalLinks           `links.ts` reads it, but only cites what stage 10 fetched
 *
 * If this test fails, the fix is to check the agents first and the expectation second.
 */
import { describe, it, expect } from "vitest";

import {
  CONTROL_STAGE,
  MODE_SUMMARY,
  controlNote,
  controlRunsIn,
  deepOnlyStages,
  type ArticleBriefControl,
} from "@/lib/article/modes";
import { stageSpec, stagesFor, type ArticleRunMode } from "@/lib/article/stages";

const CONTROLS = Object.keys(CONTROL_STAGE) as ArticleBriefControl[];
const MODES: ArticleRunMode[] = ["quick", "deep"];

/** The four the quick pipeline cannot honour, in the order the brief draws them. */
const DEEP_ONLY_CONTROLS: ArticleBriefControl[] = [
  "enableSources",
  "enableExternalLinks",
  "enableImages",
  "enableYoutube",
];

describe("what each mode does with the brief", () => {
  it("points every control at a stage that exists", () => {
    for (const control of CONTROLS) {
      const spec = stageSpec(CONTROL_STAGE[control]);
      expect(spec, `${control} names a stage that is not in the pipeline`).toBeTruthy();
      expect(spec.key).toBe(CONTROL_STAGE[control]);
    }
  });

  it("names exactly the four controls a quick run cannot honour", () => {
    const unhonoured = CONTROLS.filter((control) => !controlRunsIn(control, "quick"));
    expect(unhonoured.sort()).toEqual([...DEEP_ONLY_CONTROLS].sort());
  });

  it("honours every control in deep mode, because deep runs every stage", () => {
    for (const control of CONTROLS) {
      expect(controlRunsIn(control, "deep")).toBe(true);
      expect(controlNote(control, "deep")).toBeNull();
    }
  });

  it("gives a note only where there is something to warn about", () => {
    for (const control of CONTROLS) {
      const note = controlNote(control, "quick");
      if (DEEP_ONLY_CONTROLS.includes(control)) {
        // Every note starts the same way so the screen can render them uniformly,
        // and every note says what happens instead rather than only "unavailable".
        expect(note, `${control} needs a note`).toBeTruthy();
        expect(note).toMatch(/^Deep only — /);
        expect((note as string).length).toBeGreaterThan(24);
      } else {
        expect(note, `${control} runs in quick and must not be warned about`).toBeNull();
      }
    }
  });

  it("lists the stages quick leaves out, and none it runs", () => {
    const extra = deepOnlyStages();
    const quick = stagesFor("quick").map((spec) => spec.key);
    const deep = stagesFor("deep").map((spec) => spec.key);

    expect(extra.length).toBe(deep.length - quick.length);
    for (const spec of extra) {
      expect(quick).not.toContain(spec.key);
      expect(deep).toContain(spec.key);
      // The guide renders these straight from the pipeline, so both fields must be
      // there — an empty detail would draw a blank row.
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.detail.length).toBeGreaterThan(0);
    }
    // In pipeline order, so the guide reads as a sequence rather than a set.
    expect(extra.map((spec) => spec.order)).toEqual(
      [...extra.map((spec) => spec.order)].sort((a, b) => a - b)
    );
  });

  it("has a summary for both modes", () => {
    for (const mode of MODES) {
      const summary = MODE_SUMMARY[mode];
      expect(summary.mode).toBe(mode);
      expect(summary.name.length).toBeGreaterThan(0);
      expect(summary.line.length).toBeGreaterThan(20);
      expect(summary.bestFor.length).toBeGreaterThan(20);
    }
  });
});
