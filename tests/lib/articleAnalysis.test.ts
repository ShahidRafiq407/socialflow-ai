/**
 * AN EMPTY PANEL HAS SEVEN MEANINGS, AND ONLY ONE IS A BUG
 *
 * The two analysis panels are the only place the app answers "what did this run
 * actually look at". Both of them are frequently empty — a quick run has no site
 * crawl and no research at all — so the whole value of them rests on the two pure
 * functions tested here being exact about *why* they are empty.
 *
 *   `stageStatusIn` — the difference between a stage this pipeline will never run
 *   and one it has not reached yet. Told wrong, the screen promises a quick run a
 *   site crawl that is never coming.
 *
 *   `analysisFromRun` — the join that is deliberately independent of the article
 *   HTML. `articleFromRun` returns null the moment no stage has written a page,
 *   which is right for the editor and would be wrong here: the business profile is
 *   stage one, so a run blocked at the evidence gate has it and must still show it.
 */
import { describe, expect, it } from "vitest";

import { analysisFromRun } from "@/components/dashboard/article-writer/runArticle";
import type { ArticleStageKey } from "@/lib/article/stages";
import {
  stageStatusIn,
  type ArticleRunView,
  type ArticleStageStatus,
} from "@/lib/article/types";

/** A run view with only the fields these two functions read. */
function runView(
  mode: "quick" | "deep",
  stages: { stage: ArticleStageKey; status: ArticleStageStatus; error?: string }[] = []
): ArticleRunView {
  return {
    id: "run_1",
    mode,
    status: "running",
    currentStage: "business",
    position: 1,
    total: mode === "quick" ? 12 : 23,
    stages: stages.map((row, index) => ({
      stage: row.stage,
      order: index + 1,
      status: row.status,
      hasArtifact: row.status === "done",
      error: row.error,
      modelCalls: 0,
    })),
  };
}

describe("which stage a panel is waiting on", () => {
  it("calls a stage this mode never runs unavailable, not pending", () => {
    // The site crawl is stage two and deep only. "Pending" would be a promise
    // nothing in a quick run intends to keep.
    expect(stageStatusIn(runView("quick"), "inventory")).toBe("unavailable");
    expect(stageStatusIn(runView("quick"), "research")).toBe("unavailable");
    expect(stageStatusIn(runView("quick"), "evidence_gate")).toBe("unavailable");

    // The business profile runs in both, so it is never unavailable — a quick run
    // that has not got there yet is pending, which is a different sentence.
    expect(stageStatusIn(runView("quick"), "business")).toBe("pending");
    expect(stageStatusIn(runView("deep"), "inventory")).toBe("pending");
  });

  it("returns the row's own status once there is a row", () => {
    const statuses: ArticleStageStatus[] = [
      "running",
      "done",
      "blocked",
      "failed",
      "skipped",
      "pending",
    ];
    for (const status of statuses) {
      const run = runView("deep", [{ stage: "research", status }]);
      expect(stageStatusIn(run, "research")).toBe(status);
    }
  });

  it("does not let a row for a stage outside the mode override unavailable", () => {
    // A row can exist for a stage this mode does not run — the mode is fixed on
    // the run row, but a row written by an earlier build, or a stage list that
    // changed under a stored run, must not turn quick mode into deep mode.
    const run = runView("quick", [{ stage: "inventory", status: "done" }]);
    expect(stageStatusIn(run, "inventory")).toBe("unavailable");
  });
});

describe("what the run learned, joined without the page", () => {
  it("reads both stages from a run that never wrote an article", () => {
    // No `write` artifact anywhere in here. That is the point: this join must not
    // share `articleFromRun`'s early return on a blank page.
    const analysis = analysisFromRun({
      business: {
        summary: "A two-joiner shop fitting stairs and internal doors in Leeds.",
        services: ["staircase fitting", "internal doors", "architrave"],
        audience: "Homeowners mid-renovation",
        proofPoints: ["Twelve years of listed-building work", "Named on the Leeds Civic Trust list"],
        unverified: ["the number of staircases fitted", "any accreditation"],
        sourceUrls: ["https://example.com/about", "not-a-url"],
      },
      inventory: {
        site: "https://example.com",
        // `discovered` is understated on purpose: the guard recomputes it as at
        // least the number of pages actually read.
        discovered: 1,
        pages: [
          {
            url: "https://example.com/stairs",
            title: "Staircases",
            headings: ["Types", "Costs"],
            wordCount: 820,
            topic: "staircases",
            linkTarget: true,
          },
          {
            url: "https://example.com/doors",
            title: "Doors",
            headings: ["Fitting"],
            wordCount: 410,
            topic: "internal doors",
            linkTarget: false,
          },
          { url: "/relative/path", title: "Dropped", headings: [], wordCount: 9, topic: "" },
        ],
        unreadable: [{ url: "https://example.com/gallery", reason: "the page timed out" }],
        topics: ["staircases", "internal doors"],
      },
    });

    expect(analysis.business?.services).toHaveLength(3);
    expect(analysis.business?.unverified).toEqual([
      "the number of staircases fitted",
      "any accreditation",
    ]);
    // A source list is a list of pages somebody can open. A bare string is not one.
    expect(analysis.business?.sourceUrls).toEqual(["https://example.com/about"]);

    expect(analysis.inventory?.pages).toHaveLength(2);
    expect(analysis.inventory?.discovered).toBe(2);
    expect(analysis.inventory?.unreadable).toHaveLength(1);
  });

  it("leaves a stage out rather than showing a card full of nothing", () => {
    // A profile with no summary is not a profile. Absent, so the panel says which
    // stage has not run instead of drawing four empty rows and a zero.
    const analysis = analysisFromRun({
      business: { summary: "   ", services: ["one"], proofPoints: ["two"] },
      inventory: "not an object",
    });
    expect(analysis.business).toBeUndefined();
    expect(analysis.inventory).toBeUndefined();

    const empty = analysisFromRun({});
    expect(empty.business).toBeUndefined();
    expect(empty.inventory).toBeUndefined();
  });
});
