/**
 * STAGE 21 — THE EDIT PASS IS SURGERY, NOT A REWRITE
 *
 * WHY THIS EXISTS: this is the last stage allowed to change the body, and everything
 * downstream of it has already been decided against the page as it stands. Stage 19
 * planned each image against a real H2. Stage 20 built the JSON-LD from those same
 * headings. Stage 18 reported the exact anchors it placed, and a report naming a link
 * the page no longer contains is worse than no report. The takeaways, the contents
 * list and the answers are assembled from data by code, and the schema stage parses
 * two of them back out of the HTML by their classes.
 *
 * So a pass that "improved the article" by handing the whole page to a model would
 * quietly invalidate four earlier stages. These tests lock the properties that stop
 * that, on a page built by the same helpers the write stage builds one with:
 *
 *   - a section nothing was said about comes back byte for byte,
 *   - the H2 is re-attached from the page, never taken from the model,
 *   - the assembled blocks are never sent to a model and never come back changed,
 *   - a link that was in a section is still in it, or the section reverts,
 *   - a section that comes back a third of its length was rewritten, so it reverts,
 *   - `html` is absent unless something really changed, because `finalHtml` prefers
 *     this stage's HTML over every other stage's,
 *   - one bad call costs one section, not the stage — except a stop, which is the run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The model, scripted. `vi.hoisted` because the mock factory runs when `editor.ts` is
 * imported, which is before any plain `const` in this file exists.
 *
 * It stands in for the router rather than for a provider, and it does what the router
 * does: count the call on the meter, run the stage's own guard over the payload, and
 * throw when that guard refuses it. So the guard is under test here too.
 */
const scripted = vi.hoisted(() => ({
  answers: new Map<string, unknown>(),
  prompts: [] as string[],
  fail: new Set<string>(),
  headingOf: (prompt: string): string =>
    /THE SECTION YOU ARE EDITING: (.*)/.exec(prompt)?.[1]?.trim() ?? "",
}));

vi.mock("@/lib/agents/article/router", () => ({
  askJson: async (
    _capability: string,
    _stage: string,
    options: { prompt: string; meter?: { calls: number; models: string[] } },
    parse: (value: unknown) => unknown
  ): Promise<unknown> => {
    scripted.prompts.push(options.prompt);
    if (options.meter) {
      options.meter.calls += 1;
      options.meter.models.push("test-model");
    }
    const heading = scripted.headingOf(options.prompt);
    if (scripted.fail.has(heading)) throw new Error("the model was unavailable");
    const answer = scripted.answers.get(heading);
    if (answer === undefined) throw new Error(`nothing scripted for “${heading}”`);
    const parsed = parse(answer);
    if (parsed === null || parsed === undefined) {
      throw new Error("Edit pass: the payload did not pass the stage's guard");
    }
    return parsed;
  },
}));

import { runEditorStage } from "@/lib/agents/article/editor";
import type { StageContext, StageResult } from "@/lib/agents/article/contract";
import {
  buildFaqSection,
  buildKeyTakeaways,
  buildTableOfContents,
  injectHeadingIds,
} from "@/lib/agents/workers/articleAssembly";
import { readEditPassReport, type EditPassReport } from "@/lib/article/artifacts";
import { readBriefRow } from "@/lib/article/brief";
import type { ArticleStageKey } from "@/lib/article/stages";
import { buildBrandProfile } from "@/lib/brand/profile";

// ---------------------------------------------------------------------------
// A PAGE, BUILT THE WAY THE WRITE STAGE BUILDS ONE
// ---------------------------------------------------------------------------

const COSTS = "What fitting a mitred architrave costs";
const CHOOSING = "Choosing between a mitre and a butt joint";
const YOURSELF = "Cutting the mitres yourself";

const PROSE: Record<string, string> = {
  [COSTS]:
    "<p>Fitting a mitred architrave around a standard doorway takes an afternoon once the walls are square, and most joiners quote by the opening rather than by the metre. The price moves with the timber, the number of returns, and whether the old trim has to come off first. Ask what the quote assumes about the plaster behind it, because that is where an afternoon becomes two days.</p>",
  [CHOOSING]:
    '<p>A mitre reads as one continuous line of timber and a butt joint reads as two pieces meeting, which is most of the decision on a painted frame. Mitres open up as the timber dries, so a butt joint holds its line for longer in a room that swings between damp and dry. <a href="https://example.org/timber-movement" target="_blank" rel="noopener">Timber movement</a> is measured across the grain rather than along it, so the wider the section the more it matters.</p>',
  [YOURSELF]:
    "<p>Cutting your own mitres needs a saw that holds forty five degrees under load and a way of clamping the piece so it cannot creep as the blade goes through. A mitre box and a sharp tenon saw will do a softwood architrave without complaint. The joint is glued and pinned rather than only pinned, or it opens the first time the door slams.</p>",
};

interface Page {
  html: string;
  takeaways: string;
  toc: string;
  faq: string;
}

/** The write stage's own composition: takeaways, contents list, body, answers. */
function buildPage(headings: string[], prose: Record<string, string> = PROSE): Page {
  const body = headings.map((heading) => `<h2>${heading}</h2>\n${prose[heading]}`).join("\n\n");
  const withIds = injectHeadingIds(body);
  const takeaways = buildKeyTakeaways(
    ["A mitre is one line of timber, a butt joint is two.", "Glue and pin every joint."],
    "Key takeaways"
  );
  const toc = buildTableOfContents(withIds.toc, "On this page");
  const faq = buildFaqSection(
    [
      {
        question: "How many coats does a softwood architrave need?",
        answer: "A painted softwood architrave usually needs two coats of primer before the topcoat.",
      },
    ],
    "Frequently asked questions"
  );
  return {
    html: [takeaways, toc, withIds.html, faq].filter(Boolean).join("\n\n"),
    takeaways,
    toc,
    faq,
  };
}

/** The run as the stage receives it. Only the artifacts differ between tests. */
function contextFor(
  artifacts: Partial<Record<ArticleStageKey, unknown>>,
  overrides: Partial<StageContext> = {}
): StageContext {
  return {
    runId: "run_editor_test",
    mode: "deep",
    workspace: {
      workspaceId: "ws_editor_test",
      name: "Northwest Joinery",
      website: "https://northwest-joinery.test",
      brand: buildBrandProfile(null),
    },
    brief: readBriefRow({ keyword: "mitred architrave", humanize: false }),
    state: {},
    artifacts,
    meter: { calls: 0, models: [] },
    deadline: Date.now() + 240_000,
    ...overrides,
  };
}

/** A page and the write artifact that carries it. */
function withDraft(page: Page, artifacts: Partial<Record<ArticleStageKey, unknown>> = {}) {
  return { write: { title: "Mitred architraves, fitted", html: page.html }, ...artifacts };
}

/** The stage's own guard over its own artifact, so the shape is asserted as well. */
function reportOf(result: StageResult): {
  report: EditPassReport;
  state: Record<string, unknown>;
} {
  expect(result.kind).toBe("done");
  if (result.kind !== "done") throw new Error("the stage did not finish");
  const report = readEditPassReport(result.artifact);
  if (!report) throw new Error("the artifact did not pass its own guard");
  return { report, state: result.statePatch ?? {} };
}

/** What a model returns for a section, in the shape the stage's guard expects. */
function answer(html: string, note = "Cut the claim nothing supports."): unknown {
  return { html, changes: [{ kind: "claim", note }], leftAlone: [] };
}

const UNSUPPORTED = {
  entries: [
    {
      claim: "Mitres open up as the timber dries",
      verdict: "unsupported",
      note: "No source in this run establishes it as a general rule.",
      location: CHOOSING,
    },
  ],
};

beforeEach(() => {
  scripted.answers.clear();
  scripted.prompts.length = 0;
  scripted.fail.clear();
});

describe("edit pass — a page nothing was said about", () => {
  it("blocks when no stage before it produced a body", async () => {
    const result = await runEditorStage(contextFor({}));
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("expected a block");
    expect(result.reason).toContain("no stage before this one produced a body");
  });

  it("changes nothing, calls no model, and stores no HTML", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    const { report, state } = reportOf(await runEditorStage(contextFor(withDraft(page))));

    expect(scripted.prompts).toHaveLength(0);
    // `finalHtml` prefers this stage's HTML over every other stage's, so an
    // unchanged copy here would make the edit pass the source of a page it did not
    // edit — and every later reader would attribute the writer's work to it.
    expect(report.html).toBeUndefined();
    expect(report.changes).toHaveLength(0);
    expect(state.editSectionsChanged).toBe(0);
    expect(state.editNote).toContain("no earlier check reported a problem");
    expect(report.wordCountBefore).toBe(report.wordCountAfter);
  });
});

describe("edit pass — one reported section", () => {
  it("edits only that section and leaves every other byte alone", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    scripted.answers.set(
      CHOOSING,
      answer(
        '<p>A mitre reads as one continuous line of timber and a butt joint reads as two pieces meeting, which is most of the decision on a painted frame. Mitres typically open up as the timber dries, which is why a butt joint holds its line for longer in a room that swings between damp and dry. <a href="https://example.org/timber-movement" target="_blank" rel="noopener">Timber movement</a> is measured across the grain rather than along it, so the wider the section the more it matters.</p>'
      )
    );

    const { report, state } = reportOf(
      await runEditorStage(contextFor(withDraft(page, { factcheck: UNSUPPORTED })))
    );

    expect(scripted.prompts).toHaveLength(1);
    expect(state.editSectionsChanged).toBe(1);
    expect(report.html).toBeTruthy();
    const html = report.html ?? "";

    // The two sections nobody complained about, and the three blocks this app
    // assembles, are in the output exactly as they went in.
    expect(html).toContain(PROSE[COSTS]);
    expect(html).toContain(PROSE[YOURSELF]);
    expect(html).toContain(page.takeaways);
    expect(html).toContain(page.toc);
    expect(html).toContain(page.faq);

    expect(html).toContain("Mitres typically open up");
    expect(html).not.toContain(PROSE[CHOOSING]);
    expect(report.changes).toHaveLength(1);
    expect(report.changes[0].location).toBe(CHOOSING);
    expect(report.changes[0].kind).toBe("claim");
    expect(state.editKinds).toEqual(["claim"]);
  });

  it("re-attaches the page's own H2 and drops the one the model returned", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    scripted.answers.set(
      CHOOSING,
      answer(
        '<h2>Mitre or butt joint: which to pick</h2><p>A mitre reads as one line of timber and a butt joint reads as two pieces meeting. Mitres typically open up as the timber dries, so a butt joint holds its line for longer in a room that swings between damp and dry. <a href="https://example.org/timber-movement" target="_blank" rel="noopener">Timber movement</a> is measured across the grain rather than along it, so the wider the section the more it matters in a tall opening.</p>'
      )
    );

    const { report } = reportOf(
      await runEditorStage(contextFor(withDraft(page, { factcheck: UNSUPPORTED })))
    );
    const html = report.html ?? "";

    // Stage 19 planned its images against these headings and stage 20 built the
    // structured data from them. A renamed one leaves both describing a page that no
    // longer exists, so the heading is not the model's to change.
    expect(html).not.toContain("Mitre or butt joint: which to pick");
    // The writer's own sections carry the ids `injectHeadingIds` gave them; the
    // headings on the assembled blocks have none. Three sections in, three out.
    expect(html.match(/<h2 id=/g) ?? []).toHaveLength(3);
    expect(html).toContain(CHOOSING);
  });
});

describe("edit pass — the links stage's report stays true", () => {
  it("puts a dropped link back where its words survived", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    scripted.answers.set(
      CHOOSING,
      answer(
        "<p>A mitre reads as one continuous line of timber and a butt joint reads as two pieces meeting, which is most of the decision on a painted frame. Mitres typically open up as the timber dries, so a butt joint holds its line for longer in a damp room. Timber movement is measured across the grain rather than along it, so the wider the section the more it matters.</p>"
      )
    );

    const { report, state } = reportOf(
      await runEditorStage(contextFor(withDraft(page, { factcheck: UNSUPPORTED })))
    );
    const html = report.html ?? "";

    expect(state.editSectionsChanged).toBe(1);
    expect(html).toContain('href="https://example.org/timber-movement"');
    // Back the way it was placed, not as an internal link in the same tab.
    expect(html).toContain('target="_blank"');
  });

  it("reverts the section when the link and its words are both gone", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    scripted.answers.set(
      CHOOSING,
      answer(
        "<p>A mitre reads as one continuous line of timber and a butt joint reads as two pieces meeting, which is most of the decision on a painted frame. Mitres typically open up as the timber dries, so a butt joint holds its line for longer in a room that swings between damp and dry, and the wider the section the more that matters.</p>"
      )
    );

    const { report, state } = reportOf(
      await runEditorStage(contextFor(withDraft(page, { factcheck: UNSUPPORTED })))
    );

    expect(state.editSectionsChanged).toBe(0);
    expect(report.html).toBeUndefined();
    expect(report.changes).toHaveLength(0);
    expect(report.leftAlone.join(" ")).toContain("https://example.org/timber-movement");
    expect(report.leftAlone.join(" ")).toContain("the original stands");
  });
});

describe("edit pass — the blocks this app assembles", () => {
  it("never sends one to a model", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    scripted.answers.set(
      CHOOSING,
      answer(
        '<p>A mitre reads as one continuous line of timber and a butt joint reads as two pieces meeting on a painted frame. Mitres typically open up as the timber dries, so a butt joint holds its line for longer in a room that swings between damp and dry. <a href="https://example.org/timber-movement" target="_blank" rel="noopener">Timber movement</a> is measured across the grain rather than along it.</p>'
      )
    );

    await runEditorStage(contextFor(withDraft(page, { factcheck: UNSUPPORTED })));

    expect(scripted.prompts).toHaveLength(1);
    const prompt = scripted.prompts[0];
    for (const marker of ["key-takeaways", "article-toc", "toc-title", "article-faq", "faq-item"]) {
      expect(prompt).not.toContain(marker);
    }
    // Nor the token they were lifted out as: a model shown a comment it was not told
    // about drops it, and the block would go with it.
    expect(prompt).not.toContain("POSTLOOM_KEEP");
    // And the headings it is told the rest of the page covers are the writer's own,
    // not the labels on the assembled blocks.
    expect(prompt).toContain(COSTS);
    expect(prompt).not.toContain("Key takeaways");
    expect(prompt).not.toContain("Frequently asked questions");
  });

  it("says where a finding is when it is inside one, rather than 'not found'", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    const inTheAnswers = {
      entries: [
        {
          claim: "two coats of primer before the topcoat",
          verdict: "unsupported",
          note: "Nothing in this run establishes the number of coats.",
          location: "Frequently asked questions",
        },
      ],
    };

    const { report, state } = reportOf(
      await runEditorStage(contextFor(withDraft(page, { factcheck: inTheAnswers })))
    );

    expect(scripted.prompts).toHaveLength(0);
    expect(report.html).toBeUndefined();
    expect(report.leftAlone.join(" ")).toContain("the answers");
    expect(state.editNote).toContain("could not be acted on section by section");
  });
});

describe("edit pass — what it works from", () => {
  const SHARED = "A mitred joint on a painted frame hides the end grain completely.";
  const REPEATED: Record<string, string> = {
    [COSTS]: `<p>${SHARED} Fitting a mitred architrave around a standard doorway takes an afternoon once the walls are square, and most joiners quote by the opening rather than by the metre. Ask what the quote assumes about the plaster behind it, because that is where an afternoon becomes two days.</p>`,
    [CHOOSING]: PROSE[CHOOSING],
    [YOURSELF]: `<p>${SHARED} Cutting your own mitres needs a saw that holds forty five degrees under load and a way of clamping the piece so it cannot creep as the blade goes through. The joint is glued and pinned rather than only pinned, or it opens the first time the door slams.</p>`,
  };

  it("finds a repeated sentence itself, with no check having reported one", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF], REPEATED);
    scripted.answers.set(
      YOURSELF,
      answer(
        "<p>Cutting your own mitres needs a saw that holds forty five degrees under load and a way of clamping the piece so it cannot creep as the blade goes through. The joint is glued and pinned rather than only pinned, or it opens the first time the door slams.</p>",
        "Cut the sentence the costs section already makes."
      )
    );

    const { report, state } = reportOf(await runEditorStage(contextFor(withDraft(page))));

    // A model asked "is anything repeated" answers with an impression. A string that
    // occurs twice is a fact, so it is found here and the later section is the one
    // sent — the first time a point is made is usually the right place for it.
    expect(scripted.prompts).toHaveLength(1);
    expect(scripted.headingOf(scripted.prompts[0])).toBe(YOURSELF);
    expect(scripted.prompts[0]).toContain("word for word");
    expect(scripted.prompts[0]).toContain("hides the end grain completely");
    expect(report.html).toBeTruthy();
    expect(state.editNote).toContain("the repeated sentences found in the page");
  });

  it("loses one section to a bad call, not the stage", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    const overlap = {
      distinctiveness: 60,
      comparedAgainst: 3,
      overlaps: [
        {
          passage: "most joiners quote by the opening rather than by the metre",
          url: "https://competitor.test/architraves",
          theirs: "Every fitter prices by the door, not the metre.",
          kind: "point",
        },
      ],
    };
    scripted.fail.add(CHOOSING);
    scripted.answers.set(
      COSTS,
      answer(
        "<p>Fitting a mitred architrave around a standard doorway takes an afternoon once the walls are square. What moves the price on our own jobs is the number of returns and whether the old trim has to come off first, which is why the quote should say what it assumes about the plaster behind it.</p>",
        "Replaced the pricing line the competitor already makes."
      )
    );

    const { report, state } = reportOf(
      await runEditorStage(
        contextFor(withDraft(page, { factcheck: UNSUPPORTED, originality: overlap }))
      )
    );

    expect(scripted.prompts).toHaveLength(2);
    expect(state.editSectionsChanged).toBe(1);
    expect(report.changes).toHaveLength(1);
    expect(report.changes[0].location).toBe(COSTS);
    expect(report.leftAlone.join(" ")).toContain("did not come back in a usable shape");
    expect(report.html).toContain(PROSE[CHOOSING]);
  });

  it("stops on the request's own deadline with the page as it was", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    const { report } = reportOf(
      await runEditorStage(
        contextFor(withDraft(page, { factcheck: UNSUPPORTED }), { deadline: Date.now() + 1_000 })
      )
    );

    expect(scripted.prompts).toHaveLength(0);
    expect(report.html).toBeUndefined();
    expect(report.leftAlone.join(" ")).toContain("no time left in this request");
  });

  it("stops the run rather than the section when the user pressed Stop", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    await expect(
      runEditorStage(
        contextFor(withDraft(page, { factcheck: UNSUPPORTED }), { signal: AbortSignal.abort() })
      )
    ).rejects.toThrow("The run was stopped.");
    expect(scripted.prompts).toHaveLength(0);
  });
});

describe("edit pass — a rewrite is not an edit", () => {
  it("refuses a section that came back a fraction of its length", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    scripted.answers.set(
      CHOOSING,
      answer("<p>A mitre reads as one line of timber and a butt joint reads as two.</p>")
    );

    const { report, state } = reportOf(
      await runEditorStage(contextFor(withDraft(page, { factcheck: UNSUPPORTED })))
    );

    // The stages before this one read, checked and scored these words. A model that
    // returns a third of them has replaced the section rather than fixed the claim in
    // it, so the original stands and the refusal says so with both counts.
    expect(state.editSectionsChanged).toBe(0);
    expect(report.html).toBeUndefined();
    expect(report.leftAlone.join(" ")).toContain("rewrite rather than an edit");
    expect(report.wordCountBefore).toBe(report.wordCountAfter);
  });

  it("records nothing for a section that came back identical", async () => {
    const page = buildPage([COSTS, CHOOSING, YOURSELF]);
    scripted.answers.set(CHOOSING, answer(PROSE[CHOOSING]));

    const { report, state } = reportOf(
      await runEditorStage(contextFor(withDraft(page, { factcheck: UNSUPPORTED })))
    );

    // A change list against identical HTML is a claim, not an edit — and this report
    // is what the user reads to see what the pass did.
    expect(scripted.prompts).toHaveLength(1);
    expect(report.changes).toHaveLength(0);
    expect(state.editSectionsChanged).toBe(0);
    expect(report.leftAlone.join(" ")).toContain("came back unchanged");
  });
});
