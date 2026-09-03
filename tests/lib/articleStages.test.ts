/**
 * THE PIPELINE IS COMPLETE, OR THE DOOR IS SHUT
 *
 * WHY THIS EXISTS: `stages.ts` says what the pipeline is and `articleGraph.ts` says who
 * runs each step, and nothing but a lookup joins them. A stage added to the list with no
 * runner behind it does not fail to compile — the map is `Partial` on purpose — it fails
 * at whatever hour somebody first starts a run that reaches it.
 *
 * So two facts are asserted here rather than assumed:
 *
 *   - every stage of both pipelines has an agent, which is what makes deep mode
 *     startable at all, and
 *   - when one does not, the door is shut at the start of the run and the message names
 *     the stages, because a deep run that stopped at stage two has already been paid for.
 */
import { describe, it, expect } from "vitest";

import {
  modeUnavailableReason,
  stageRunner,
  unimplementedStages,
} from "@/lib/agents/article/articleGraph";
import {
  ARTICLE_STAGES,
  stageCount,
  stagesFor,
  type ArticleRunMode,
} from "@/lib/article/stages";

const MODES: ArticleRunMode[] = ["quick", "deep"];

describe("the article pipeline", () => {
  it("has an agent behind every stage of both modes", () => {
    for (const mode of MODES) {
      // Named, not counted: a failure here should say which stage went unwired.
      expect(unimplementedStages(mode)).toEqual([]);
      expect(modeUnavailableReason(mode)).toBeNull();
    }
  });

  it("resolves a runner for every stage in the list", () => {
    for (const spec of ARTICLE_STAGES) {
      expect(typeof stageRunner(spec.key)).toBe("function");
    }
  });

  it("runs quick as the stages marked quick, in the deep pipeline's own order", () => {
    const quick = stagesFor("quick").map((spec) => spec.key);
    const deep = stagesFor("deep").map((spec) => spec.key);

    // Quick is not a different pipeline. It is the same one with the optional stages
    // left out, so a quick run and a deep run do the shared stages in the same order.
    expect(deep).toEqual(ARTICLE_STAGES.map((spec) => spec.key));
    expect(quick).toEqual(ARTICLE_STAGES.filter((spec) => spec.quick).map((spec) => spec.key));
    expect(quick.filter((key) => !deep.includes(key))).toEqual([]);
    expect(deep.filter((key) => deep.indexOf(key) !== deep.lastIndexOf(key))).toEqual([]);
    expect(stageCount("quick")).toBe(quick.length);
    expect(stageCount("deep")).toBe(deep.length);
    expect(quick.length).toBeLessThan(deep.length);
  });
});
