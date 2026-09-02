/**
 * TRACE SUITE — controller playbooks (procedural memory of tool sequences)
 *
 * WHY THIS EXISTS: when a turn finishes cleanly after chaining several tools,
 * the sequence that worked is captured and, next time a similar task arrives,
 * injected as a starting recipe. Two invariants matter most and are pinned
 * here: (1) only a genuine multi-tool procedure becomes a playbook — a single
 * tool, or a turn that only did memory bookkeeping, must NOT; and (2) the
 * prompt renderer returns "" when nothing parses, so the model is never told it
 * has a recipe it doesn't. The rest of the suite pins the extraction shape
 * (done-only, noise-dropped, consecutive-collapsed, length-capped) and the
 * store/parse round-trip.
 */
import { describe, it, expect } from "vitest";
import {
  extractSequence,
  distinctToolCount,
  isPlaybookWorthy,
  formatSequence,
  buildPlaybookContent,
  parsePlaybook,
  formatPlaybooksForPrompt,
  PLAYBOOK_CATEGORY,
  MIN_PLAYBOOK_TOOLS,
  MAX_PLAYBOOK_STEPS,
  type PlaybookToolRun,
} from "@/lib/agents/controller/playbooks";

function run(name: string, phase: string = "done"): PlaybookToolRun {
  return { name, phase };
}

describe("extractSequence", () => {
  it("keeps only successful runs, in order", () => {
    const seq = extractSequence([
      run("generate_image"),
      run("save_draft", "error"),
      run("publish_post"),
    ]);
    expect(seq).toEqual(["generate_image", "publish_post"]);
  });

  it("drops bookkeeping tools (remember/recall/list_memories/report_limitation)", () => {
    const seq = extractSequence([
      run("recall"),
      run("generate_image"),
      run("remember"),
      run("save_draft"),
      run("list_memories"),
      run("report_limitation"),
    ]);
    expect(seq).toEqual(["generate_image", "save_draft"]);
  });

  it("collapses consecutive repeats but keeps a genuine alternation", () => {
    const collapsed = extractSequence([
      run("generate_image"),
      run("generate_image"),
      run("generate_image"),
      run("save_draft"),
    ]);
    expect(collapsed).toEqual(["generate_image", "save_draft"]);

    const alternating = extractSequence([
      run("generate_image"),
      run("save_draft"),
      run("generate_image"),
      run("save_draft"),
    ]);
    expect(alternating).toEqual(["generate_image", "save_draft", "generate_image", "save_draft"]);
  });

  it("caps the sequence length", () => {
    const many = Array.from({ length: 30 }, (_, i) => run(`tool_${i}`));
    expect(extractSequence(many)).toHaveLength(MAX_PLAYBOOK_STEPS);
  });

  it("ignores cancelled and running rows", () => {
    const seq = extractSequence([
      run("generate_image", "cancelled"),
      run("save_draft", "running"),
      run("publish_post"),
    ]);
    expect(seq).toEqual(["publish_post"]);
  });

  it("tolerates an empty or missing list", () => {
    expect(extractSequence([])).toEqual([]);
    expect(extractSequence(undefined as any)).toEqual([]);
  });
});

describe("isPlaybookWorthy / distinctToolCount", () => {
  it("needs at least two distinct real tools", () => {
    expect(MIN_PLAYBOOK_TOOLS).toBe(2);
    expect(isPlaybookWorthy([run("generate_image"), run("save_draft")])).toBe(true);
  });

  it("rejects a single tool, however many times it ran", () => {
    expect(isPlaybookWorthy([run("generate_image"), run("generate_image")])).toBe(false);
  });

  it("rejects a turn that only did memory bookkeeping", () => {
    expect(isPlaybookWorthy([run("recall"), run("list_memories"), run("remember")])).toBe(false);
  });

  it("rejects a turn with no successful tools", () => {
    expect(isPlaybookWorthy([run("generate_image", "error"), run("save_draft", "cancelled")])).toBe(false);
  });

  it("counts distinct, not total", () => {
    expect(distinctToolCount(["a", "b", "a", "b"])).toBe(2);
  });
});

describe("buildPlaybookContent", () => {
  it("writes task first, then the proven steps", () => {
    const content = buildPlaybookContent("Make an IG post about our sale and publish it", [
      "generate_image",
      "save_draft",
      "publish_post",
    ]);
    expect(content).toBe(
      "Task: Make an IG post about our sale and publish it\nSteps: generate_image → save_draft → publish_post"
    );
  });

  it("collapses whitespace and caps the task length", () => {
    const long = "word ".repeat(80); // 400 chars of "word "
    const content = buildPlaybookContent(long, ["a", "b"]);
    const taskLine = content.split("\n")[0].slice("Task: ".length);
    expect(taskLine.length).toBeLessThanOrEqual(200);
    expect(taskLine).not.toContain("  ");
  });

  it("returns '' when the task is empty", () => {
    expect(buildPlaybookContent("   ", ["a", "b"])).toBe("");
  });

  it("returns '' when there are fewer than two distinct tools", () => {
    expect(buildPlaybookContent("do a thing", ["a", "a"])).toBe("");
    expect(buildPlaybookContent("do a thing", [])).toBe("");
  });
});

describe("parsePlaybook", () => {
  it("round-trips content built by buildPlaybookContent", () => {
    const content = buildPlaybookContent("Publish a LinkedIn post", ["generate_image", "publish_post"]);
    const parsed = parsePlaybook(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.task).toBe("Publish a LinkedIn post");
    expect(parsed!.steps).toEqual(["generate_image", "publish_post"]);
  });

  it("returns null for content that isn't a playbook", () => {
    expect(parsePlaybook("The user's brand tone is playful.")).toBeNull();
    expect(parsePlaybook("")).toBeNull();
    expect(parsePlaybook("Task: only a task, no steps")).toBeNull();
  });
});

describe("formatSequence", () => {
  it("joins with an arrow", () => {
    expect(formatSequence(["a", "b", "c"])).toBe("a → b → c");
  });
});

describe("formatPlaybooksForPrompt", () => {
  it("returns '' when there are no playbooks", () => {
    expect(formatPlaybooksForPrompt([])).toBe("");
  });

  it("returns '' when nothing parses (never announces an empty recipe)", () => {
    expect(formatPlaybooksForPrompt([{ content: "not a playbook" }, { content: "" }])).toBe("");
  });

  it("renders task and the proven step sequence for each parseable playbook", () => {
    const block = formatPlaybooksForPrompt([
      { content: buildPlaybookContent("Publish an IG reel", ["generate_video", "publish_post", "open_tab"]) },
      { content: "garbage that won't parse" },
      { content: buildPlaybookContent("Write and push a README", ["inspect_project", "github_push_files"]) },
    ]);
    expect(block).toContain("- Publish an IG reel");
    expect(block).toContain("Worked before: generate_video → publish_post → open_tab");
    expect(block).toContain("- Write and push a README");
    expect(block).not.toContain("garbage");
  });
});

describe("constants", () => {
  it("stores playbooks under their own category", () => {
    expect(PLAYBOOK_CATEGORY).toBe("playbook");
  });
});
