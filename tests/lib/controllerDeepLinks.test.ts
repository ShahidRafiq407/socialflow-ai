import { describe, it, expect } from "vitest";
import {
  DASHBOARD_TABS,
  buildDeepLink,
  deepLinkLabel,
  describeDashboardTabs,
  isDashboardTab,
  libraryLinkForPost,
  studioLinkForPost,
  type DashboardTab,
} from "@/lib/agents/controller/navigation";
import { artifactsFromToolResult, dedupeArtifacts, linkArtifact } from "@/lib/agents/controller/artifacts";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  chatModelLabel,
  getChatModel,
  isKnownChatModel,
} from "@/lib/agents/controller/models";
import { DEFAULT_CHAT_SETTINGS, normalizeChatSettings } from "@/lib/agents/controller/settingsShape";
import {
  parseControllerEvent,
  splitSseFrames,
  sseFrame,
  STOPPED_TURN_TEXT,
  type ControllerEvent,
  type ToolPhase,
} from "@/lib/agents/controller/types";
import {
  INTERRUPTED_TURN_NOTE,
  MAX_PARALLEL_TOOLS,
  SERIAL_TOOLS,
  batchCalls,
  closeDanglingRequests,
  envInt,
  envList,
  settleRuns,
  type SettleableRun,
} from "@/lib/agents/controller/turnFlow";
import {
  IMAGE_MODEL_ID,
  IMAGE_MODEL_LABEL,
  VIDEO_MODEL_ID,
  VIDEO_MODEL_LABEL,
  mediaModelLabel,
} from "@/lib/agents/mediaModels";

// ============================================================================
// The controller's promise to the user is "here is a link, click it and you land
// on that exact thing". These lock the link contract, the cards derived from
// tool results, and the settings coercion — the three pure layers the chat tab
// depends on.
// ============================================================================

describe("dashboard tab catalogue", () => {
  const keys = Object.keys(DASHBOARD_TABS) as DashboardTab[];

  it("keys the record by the spec's own tab id", () => {
    for (const key of keys) expect(DASHBOARD_TABS[key].tab).toBe(key);
  });

  it("routes every tab under /dashboard", () => {
    for (const key of keys) expect(DASHBOARD_TABS[key].path.startsWith("/dashboard")).toBe(true);
  });

  it("gives every tab a human label for the deep-link button", () => {
    for (const key of keys) {
      expect(DASHBOARD_TABS[key].label.length).toBeGreaterThan(0);
      expect(deepLinkLabel(key)).toBe(`Open in ${DASHBOARD_TABS[key].label}`);
    }
  });

  it("recognises real tab ids and rejects anything else", () => {
    for (const key of keys) expect(isDashboardTab(key)).toBe(true);
    for (const junk of ["", "nope", "Dashboard", null, undefined, 42, {}]) {
      expect(isDashboardTab(junk)).toBe(false);
    }
  });
});

describe("buildDeepLink", () => {
  it("returns the bare path when nothing is focused", () => {
    expect(buildDeepLink("dashboard")).toBe("/dashboard");
    expect(buildDeepLink("ai-studio")).toBe("/dashboard/ai-studio");
  });

  it("uses each tab's own focus param", () => {
    expect(buildDeepLink("ai-studio", "post_1")).toBe("/dashboard/ai-studio?postId=post_1");
    expect(buildDeepLink("content", "post_1")).toBe("/dashboard/content?focus=post_1");
    expect(buildDeepLink("goals", "plan")).toBe("/dashboard/goals?view=plan");
    expect(buildDeepLink("plugins", "github")).toBe("/dashboard/plugins?connector=github");
    expect(buildDeepLink("integrations", "instagram")).toBe("/dashboard/integrations?platform=instagram");
  });

  it("ignores a focus value on tabs that cannot focus one object", () => {
    for (const tab of ["dashboard", "brand", "analytics", "billing", "settings"] as DashboardTab[]) {
      expect(buildDeepLink(tab, "post_1")).toBe(DASHBOARD_TABS[tab].path);
    }
  });

  it("appends extras and drops empty ones", () => {
    const link = buildDeepLink("content", "post_1", { tab: "SCHEDULED", note: "", missing: undefined, gone: null });
    expect(link).toBe("/dashboard/content?focus=post_1&tab=SCHEDULED");
  });

  it("keeps falsy-but-real extras like 0 and false", () => {
    expect(buildDeepLink("analytics", null, { days: 0, compare: false })).toBe(
      "/dashboard/analytics?days=0&compare=false"
    );
  });

  it("encodes values so a link is always safe to click", () => {
    expect(buildDeepLink("content", "a b&c=d")).toBe("/dashboard/content?focus=a+b%26c%3Dd");
  });

  it("is the single source for the two canonical post links", () => {
    expect(studioLinkForPost("post_9")).toBe("/dashboard/ai-studio?postId=post_9");
    expect(libraryLinkForPost("post_9")).toBe("/dashboard/content?focus=post_9");
  });
});

describe("describeDashboardTabs", () => {
  const catalogue = describeDashboardTabs();

  it("tells the model about every tab, id and path", () => {
    for (const key of Object.keys(DASHBOARD_TABS) as DashboardTab[]) {
      expect(catalogue).toContain(`"${key}"`);
      expect(catalogue).toContain(DASHBOARD_TABS[key].path);
    }
  });

  it("documents the focus param for the tabs that have one", () => {
    expect(catalogue).toContain("?postId=<value>");
    expect(catalogue).toContain("?focus=<value>");
    expect(catalogue).toContain("?view=<value>");
    expect(catalogue).toContain("?connector=<value>");
    expect(catalogue).toContain("?platform=<value>");
  });

  // The goals shell only understands GoalTabKey; advertising a value it does not
  // have (it was once "strategy") sends the user to a tab that never opens.
  it("advertises goal views the goals shell actually has", () => {
    const goals = DASHBOARD_TABS.goals.focusDescription || "";
    for (const view of ["goal", "plan", "today", "history", "leads", "autopilot"]) {
      expect(goals).toContain(`"${view}"`);
    }
    expect(goals).not.toContain("strategy");
  });
});

describe("artifactsFromToolResult", () => {
  it("produces nothing for a failed or non-object result", () => {
    expect(artifactsFromToolResult("generate_image", { error: "quota exceeded" })).toEqual([]);
    expect(artifactsFromToolResult("generate_image", null)).toEqual([]);
    expect(artifactsFromToolResult("generate_image", "done")).toEqual([]);
    expect(artifactsFromToolResult("generate_image", [{ url: "x" }])).toEqual([]);
  });

  it("ignores tools whose output is only prose", () => {
    expect(artifactsFromToolResult("recall_memory", { hits: 3 })).toEqual([]);
  });

  it("links a generated image back to the studio when it was saved as a post", () => {
    const [card] = artifactsFromToolResult("generate_image", {
      url: "https://cdn.test/a.png",
      id: "post_1",
      platform: "Instagram",
      format: "Feed",
      aspectRatio: "1:1",
      savedToContentLibrary: true,
    });
    expect(card.kind).toBe("image");
    expect(card.url).toBe("https://cdn.test/a.png");
    expect(card.href).toBe("/dashboard/ai-studio?postId=post_1");
    expect(card.tab).toBe("ai-studio");
    expect(card.subtitle).toBe("Feed · 1:1");
  });

  it("leaves an unsaved image without a dead link", () => {
    const [card] = artifactsFromToolResult("generate_image", { url: "https://cdn.test/b.png" });
    expect(card.href).toBeUndefined();
    expect(card.tab).toBeUndefined();
  });

  it("shows a pending card while HeyGen is still rendering", () => {
    const [card] = artifactsFromToolResult("heygen_generate_video", {
      videoId: "hg_1",
      status: "processing",
    });
    expect(card.kind).toBe("video");
    expect(card.url).toBeUndefined();
    expect(card.href).toBeUndefined();
    expect(card.meta).toMatchObject({ "job id": "hg_1", status: "processing" });
  });

  it("prefers the finished video url once it exists", () => {
    const [card] = artifactsFromToolResult("generate_video", {
      videoUrl: "https://cdn.test/v.mp4",
      postId: "post_2",
      platform: "TikTok",
    });
    expect(card.url).toBe("https://cdn.test/v.mp4");
    expect(card.href).toBe("/dashboard/ai-studio?postId=post_2");
  });

  it("points a saved draft at the studio and an update at the same place", () => {
    const [saved] = artifactsFromToolResult("save_draft", {
      id: "post_3",
      platform: "LinkedIn",
      format: "Feed",
      status: "DRAFT",
    });
    expect(saved.title).toBe("LinkedIn saved");
    expect(saved.href).toBe("/dashboard/ai-studio?postId=post_3");

    const [updated] = artifactsFromToolResult("update_post", { id: "post_3", platform: "LinkedIn" });
    expect(updated.title).toBe("LinkedIn updated");
  });

  it("needs a post id before it will claim something was saved", () => {
    expect(artifactsFromToolResult("save_draft", { platform: "X" })).toEqual([]);
  });

  it("sends a publish card to the live post, not to a dashboard tab", () => {
    const [card] = artifactsFromToolResult("publish_post", {
      platform: "Instagram",
      liveUrl: "https://instagram.com/p/abc",
      publishedAt: "2026-09-02T10:00:00.000Z",
    });
    expect(card.kind).toBe("publish");
    expect(card.href).toBe("https://instagram.com/p/abc");
    expect(card.hrefLabel).toBe("View live post");
    expect(card.tab).toBeUndefined();
  });

  it("keeps an open_tab href but only trusts a known tab id", () => {
    const [known] = artifactsFromToolResult("open_tab", {
      href: "/dashboard/goals?view=today",
      tab: "goals",
      title: "Today's plan",
    });
    expect(known.tab).toBe("goals");

    const [unknown] = artifactsFromToolResult("open_tab", { href: "/dashboard/goals", tab: "not-a-tab" });
    expect(unknown.href).toBe("/dashboard/goals");
    expect(unknown.tab).toBeUndefined();
  });

  it("counts pushed files and falls back to the repo url", () => {
    const [card] = artifactsFromToolResult("github_push_files", {
      pushed: ["README.md", "docs/architecture.md"],
      repo: "acme/site",
      commitUrl: "https://github.com/acme/site/commit/abc",
    });
    expect(card.title).toBe("Pushed 2 files to GitHub");
    expect(card.href).toBe("https://github.com/acme/site/commit/abc");

    const [one] = artifactsFromToolResult("github_push_files", { count: 1, repo: "acme/site" });
    expect(one.title).toBe("Pushed 1 file to GitHub");
    expect(one.hrefLabel).toBeUndefined();
  });

  it("gives every card its own id", () => {
    const ids = new Set(
      ["post_a", "post_b", "post_c"].flatMap(
        (id) => artifactsFromToolResult("save_draft", { id, platform: "X" }).map((a) => a.id)
      )
    );
    expect(ids.size).toBe(3);
  });
});

describe("dedupeArtifacts", () => {
  it("collapses the same card produced twice by a repeated tool call", () => {
    const a = linkArtifact("content", "/dashboard/content?focus=post_1", "Saved post");
    const b = linkArtifact("content", "/dashboard/content?focus=post_1", "Saved post");
    const other = linkArtifact("content", "/dashboard/content?focus=post_2", "Saved post");
    const out = dedupeArtifacts([a, b, other]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(a.id);
  });

  it("keeps two cards that only share a title", () => {
    const image = artifactsFromToolResult("generate_image", { url: "https://cdn.test/1.png" })[0];
    const video = artifactsFromToolResult("generate_video", { url: "https://cdn.test/1.mp4" })[0];
    expect(dedupeArtifacts([image, video])).toHaveLength(2);
  });
});

describe("chat model registry", () => {
  // The user asked for this model by name; it is the only brain.
  it("defaults to Gemini 3.1 Pro Preview and lists it first", () => {
    expect(DEFAULT_CHAT_MODEL).toBe("gemini-3.1-pro-preview");
    expect(isKnownChatModel(DEFAULT_CHAT_MODEL)).toBe(true);
    expect(CHAT_MODELS[0].id).toBe(DEFAULT_CHAT_MODEL);
    expect(CHAT_MODELS[0].recommended).toBe(true);
    expect(DEFAULT_CHAT_SETTINGS.model).toBe(DEFAULT_CHAT_MODEL);
  });

  it("falls back to the default rather than throwing on an unknown id", () => {
    expect(getChatModel("gemini-does-not-exist").id).toBe(DEFAULT_CHAT_MODEL);
    expect(getChatModel(null).id).toBe(DEFAULT_CHAT_MODEL);
    expect(isKnownChatModel("gemini-does-not-exist")).toBe(false);
    expect(isKnownChatModel("")).toBe(false);
  });

  // One brain, not a menu: media has its own models behind generate_image /
  // generate_video, so a second chat model would only be a worse controller.
  it("offers exactly one model, and it can think and run tools", () => {
    expect(CHAT_MODELS).toHaveLength(1);
    const [model] = CHAT_MODELS;
    expect(model.supportsTools).toBe(true);
    expect(model.supportsThinking).toBe(true);
    expect(model.supportsVision).toBe(true);
    expect(model.label.length).toBeGreaterThan(0);
    expect(model.blurb.length).toBeGreaterThan(0);
  });

  // A fallback model answering must not be labelled as the model we advertise.
  it("shows the serving model honestly", () => {
    expect(chatModelLabel(DEFAULT_CHAT_MODEL)).toBe(CHAT_MODELS[0].label);
    expect(chatModelLabel("gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(chatModelLabel(null)).toBe(CHAT_MODELS[0].label);
  });
});

describe("normalizeChatSettings", () => {
  it("returns defaults for junk input", () => {
    expect(normalizeChatSettings(null)).toEqual(DEFAULT_CHAT_SETTINGS);
    expect(normalizeChatSettings("nope")).toEqual(DEFAULT_CHAT_SETTINGS);
    expect(normalizeChatSettings({})).toEqual(DEFAULT_CHAT_SETTINGS);
  });

  it("treats a patch as a patch, leaving the rest of the base alone", () => {
    const base = { ...DEFAULT_CHAT_SETTINGS, replyStyle: "detailed" as const, temperature: 0.9 };
    const next = normalizeChatSettings({ thinkingDisplay: "collapsed" }, base);
    expect(next.thinkingDisplay).toBe("collapsed");
    expect(next.replyStyle).toBe("detailed");
    expect(next.temperature).toBe(0.9);
  });

  it("clamps numbers instead of rejecting them", () => {
    expect(normalizeChatSettings({ temperature: 9 }).temperature).toBe(1.5);
    expect(normalizeChatSettings({ temperature: -3 }).temperature).toBe(0);
    expect(normalizeChatSettings({ temperature: "0.7" }).temperature).toBe(0.7);
    expect(normalizeChatSettings({ temperature: "hot" }).temperature).toBe(DEFAULT_CHAT_SETTINGS.temperature);
    expect(normalizeChatSettings({ maxToolLoops: 500 }).maxToolLoops).toBe(24);
    expect(normalizeChatSettings({ maxToolLoops: 0 }).maxToolLoops).toBe(1);
    expect(normalizeChatSettings({ maxToolLoops: 6.6 }).maxToolLoops).toBe(7);
    expect(normalizeChatSettings({ memoryRecallTopK: 99 }).memoryRecallTopK).toBe(30);
    expect(normalizeChatSettings({ memoryRecallTopK: -1 }).memoryRecallTopK).toBe(0);
  });

  it("keeps a stale client from selecting a model that no longer exists", () => {
    expect(normalizeChatSettings({ model: "gemini-1.0-ultra" }).model).toBe(DEFAULT_CHAT_MODEL);
    expect(normalizeChatSettings({ model: "gemini-2.5-pro" }).model).toBe(DEFAULT_CHAT_MODEL);
    expect(normalizeChatSettings({ model: DEFAULT_CHAT_MODEL }).model).toBe(DEFAULT_CHAT_MODEL);
  });

  it("falls back on unknown enum values", () => {
    expect(normalizeChatSettings({ thinkingLevel: "maximum" }).thinkingLevel).toBe("balanced");
    expect(normalizeChatSettings({ thinkingLevel: "deep" }).thinkingLevel).toBe("deep");
    expect(normalizeChatSettings({ autonomy: "yolo" }).autonomy).toBe("auto");
    expect(normalizeChatSettings({ toolVisibility: "everything" }).toolVisibility).toBe("all");
    expect(normalizeChatSettings({ replyLanguage: "roman-urdu" }).replyLanguage).toBe("roman-urdu");
  });

  it("lets a permission actually be turned off", () => {
    const off = normalizeChatSettings({
      allowPublishing: false,
      allowMediaGen: false,
      allowPlugins: false,
      memoryEnabled: false,
      streamTokens: false,
    });
    expect(off.allowPublishing).toBe(false);
    expect(off.allowMediaGen).toBe(false);
    expect(off.allowPlugins).toBe(false);
    expect(off.memoryEnabled).toBe(false);
    expect(off.streamTokens).toBe(false);
  });

  it("ignores a non-boolean where a boolean belongs", () => {
    expect(normalizeChatSettings({ allowPublishing: "false" }).allowPublishing).toBe(true);
  });

  it("caps custom instructions so one paste cannot blow up every prompt", () => {
    const long = normalizeChatSettings({ customInstructions: "x".repeat(9000) });
    expect(long.customInstructions).toHaveLength(4000);
  });
});

// ============================================================================
// The wire. Both halves of the stream live in one file for exactly this reason:
// if the reader does not undo what the writer did, every event is dropped and
// the chat answers nothing at all. These tests hold the two halves together.
// ============================================================================

describe("SSE frame round trip", () => {
  const events: ControllerEvent[] = [
    { type: "session", sessionId: "s_1", userMessageId: "m_1", title: "hi" },
    { type: "title", sessionId: "s_1", title: "Instagram launch plan" },
    { type: "status", step: "context", label: "Loading workspace context", state: "start" },
    { type: "memory", facts: [{ id: "f1", category: "brand", content: "Tone: warm", pinned: true }] },
    { type: "thought", delta: "The user wants a feed post…" },
    { type: "text", delta: "Here is the post: " },
    { type: "tool", run: { id: "t1", name: "generate_image", label: "Generating…", phase: "running" } },
    {
      type: "tool",
      run: {
        id: "t1",
        name: "generate_image",
        label: "Generating…",
        phase: "cancelled",
        summary: "Stopped before it finished",
        durationMs: 812,
      },
    },
    {
      type: "artifact",
      artifact: { id: "a1", kind: "image", title: "Instagram feed", url: "https://cdn.test/a.png" },
    },
    { type: "suggestions", items: ["Schedule it", "Make a variant"] },
    { type: "model", model: "gemini-3.1-pro-preview", fallback: false },
    { type: "notice", level: "warn", message: "GitHub is not connected." },
    { type: "done", messageId: "m_2", finishReason: "ok", durationMs: 1200, model: "x", toolCount: 3 },
    { type: "done", messageId: "m_3", finishReason: "cancelled", durationMs: 400, model: "x", toolCount: 1 },
    { type: "error", message: "Vertex AI Provider Agent: all candidates failed", code: "provider" },
  ];

  it("survives every event kind, prefix and all", () => {
    for (const event of events) {
      const { frames, rest } = splitSseFrames(sseFrame(event));
      expect(rest).toBe("");
      expect(frames).toHaveLength(1);
      expect(parseControllerEvent(frames[0])).toEqual(event);
    }
  });

  // The bug this replaces: the reader handed the whole frame to JSON.parse.
  it("strips the data: field the writer added", () => {
    const frame = sseFrame({ type: "text", delta: "hello" }).trimEnd();
    expect(() => JSON.parse(frame)).toThrow();
    expect(parseControllerEvent(frame)).toEqual({ type: "text", delta: "hello" });
  });

  it("keeps text deltas byte-exact, including spaces, colons and markdown", () => {
    for (const delta of ["  two spaces  ", "ratio 1:1", "line\nbreak", "**bold** `code`", "data: not a field"]) {
      const [frame] = splitSseFrames(sseFrame({ type: "text", delta })).frames;
      expect(parseControllerEvent(frame)).toEqual({ type: "text", delta });
    }
  });

  it("holds a half-received frame back until the rest arrives", () => {
    const wire = sseFrame({ type: "text", delta: "one" }) + sseFrame({ type: "text", delta: "two" });
    const cut = wire.length - 6;

    const first = splitSseFrames(wire.slice(0, cut));
    expect(first.frames).toHaveLength(1);
    expect(parseControllerEvent(first.frames[0])).toEqual({ type: "text", delta: "one" });

    const second = splitSseFrames(first.rest + wire.slice(cut));
    expect(second.frames).toHaveLength(1);
    expect(second.rest).toBe("");
    expect(parseControllerEvent(second.frames[0])).toEqual({ type: "text", delta: "two" });
  });

  it("reads a proxy's \\r\\n and ignores heartbeats and unknown fields", () => {
    const wire = 'data: {"type":"text","delta":"a"}\r\n\r\n: keep-alive\r\n\r\nevent: ping\r\ndata: {"type":"text","delta":"b"}\r\n\r\n';
    const { frames } = splitSseFrames(wire);
    const parsed = frames.map(parseControllerEvent).filter(Boolean);
    expect(parsed).toEqual([
      { type: "text", delta: "a" },
      { type: "text", delta: "b" },
    ]);
  });

  it("returns null for anything that is not an event", () => {
    for (const junk of ["", "   ", ": heartbeat", "data: ", "data: not json", '{"noType":true}', "event: ping"]) {
      expect(parseControllerEvent(junk)).toBeNull();
    }
  });
});

// ============================================================================
// Stop. Every rule below is the difference between the work ending and the work
// only looking like it ended: what a stopped turn leaves behind, what the next
// turn is told about it, and which tools may run beside each other at all.
// ============================================================================

describe("stopped turn markers", () => {
  it("carries a phase of its own, distinct from done and error", () => {
    const phases: ToolPhase[] = ["running", "done", "error", "cancelled"];
    expect(new Set(phases).size).toBe(phases.length);
    expect(phases).toContain("cancelled");
  });

  // The bug this replaces: a stopped turn saved empty text, the empty row was
  // filtered out of history, and the next message resumed the abandoned work.
  it("is non-empty, so a stopped turn still persists an assistant row", () => {
    expect(STOPPED_TURN_TEXT.trim().length).toBeGreaterThan(0);
    expect(STOPPED_TURN_TEXT.toLowerCase()).toContain("stopped");
  });

  it("tells the user the finished work was kept", () => {
    expect(STOPPED_TURN_TEXT.toLowerCase()).toContain("undone");
  });
});

describe("envInt", () => {
  it("falls back when the variable is missing, blank or not a number", () => {
    for (const raw of [undefined, "", "   ", "abc", "NaN"]) {
      expect(envInt("X", 4, 1, 8, { X: raw })).toBe(4);
    }
  });

  it("clamps into range instead of trusting the value", () => {
    expect(envInt("X", 4, 1, 8, { X: "99" })).toBe(8);
    expect(envInt("X", 4, 1, 8, { X: "0" })).toBe(1);
    expect(envInt("X", 4, 1, 8, { X: "-3" })).toBe(1);
  });

  it("reads a valid value and rounds a fractional one", () => {
    expect(envInt("X", 4, 1, 8, { X: "2" })).toBe(2);
    expect(envInt("X", 4, 1, 8, { X: "2.6" })).toBe(3);
  });

  it("clamps the fallback too, so a bad default cannot escape the range", () => {
    expect(envInt("X", 40, 1, 8, {})).toBe(8);
  });
});

describe("envList", () => {
  it("keeps the fallback when the variable is missing or holds no real entries", () => {
    expect(envList("X", ["a"], {})).toEqual(["a"]);
    expect(envList("X", ["a"], { X: "" })).toEqual(["a"]);
    expect(envList("X", ["a"], { X: " , , " })).toEqual(["a"]);
  });

  it("splits on commas and trims each entry", () => {
    expect(envList("X", ["a"], { X: "one, two ,three" })).toEqual(["one", "two", "three"]);
  });

  it("lets one entry replace the whole fallback", () => {
    expect(envList("X", ["a", "b"], { X: "only" })).toEqual(["only"]);
  });
});

describe("batchCalls", () => {
  const asIs = (name: string) => name;
  const call = (name: string) => ({ name });
  const names = (batches: { name: string }[][]) => batches.map((b) => b.map((c) => c.name));

  it("fills a batch to the cap and starts a new one after it", () => {
    const batches = batchCalls(["a", "b", "c", "d", "e"].map(call), asIs, {
      maxParallel: 2,
      serialTools: new Set(),
    });
    expect(names(batches)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  // The bug this replaces: four image renders in one batch tripped the media
  // model's per-minute quota, and all four then sat in a visible retry storm.
  it("gives a quota-bound tool a batch of its own", () => {
    const batches = batchCalls(["a", "generate_image", "generate_image", "b"].map(call), asIs, {
      maxParallel: 4,
      serialTools: new Set(["generate_image"]),
    });
    expect(names(batches)).toEqual([["a"], ["generate_image"], ["generate_image"], ["b"]]);
  });

  it("preserves the model's ordering, so a dependent chain still runs in sequence", () => {
    const flat = batchCalls(["a", "b", "generate_video", "c"].map(call), asIs, {
      maxParallel: 3,
      serialTools: new Set(["generate_video"]),
    }).flat();
    expect(flat.map((c) => c.name)).toEqual(["a", "b", "generate_video", "c"]);
  });

  it("resolves the alias first, so a renamed image tool is still serial", () => {
    const batches = batchCalls([call("img_1"), call("img_2")], () => "generate_image", {
      maxParallel: 4,
      serialTools: new Set(["generate_image"]),
    });
    expect(names(batches)).toEqual([["img_1"], ["img_2"]]);
  });

  it("returns nothing for no calls and never emits an empty batch", () => {
    expect(batchCalls([], asIs)).toEqual([]);
    const batches = batchCalls(["a", "b"].map(call), asIs, { maxParallel: 0, serialTools: new Set() });
    expect(batches.every((b) => b.length >= 1)).toBe(true);
  });

  it("ships with the media tools serial and a cap the runtime can hold", () => {
    expect(SERIAL_TOOLS.has("generate_image")).toBe(true);
    expect(SERIAL_TOOLS.has("generate_video")).toBe(true);
    expect(MAX_PARALLEL_TOOLS).toBeGreaterThanOrEqual(1);
    expect(MAX_PARALLEL_TOOLS).toBeLessThanOrEqual(8);
  });
});

describe("closeDanglingRequests", () => {
  const user = (content: string) => ({ role: "user" as const, content });
  const assistant = (content: string) => ({ role: "assistant" as const, content });

  it("leaves a complete conversation exactly as it was", () => {
    const all = [user("hi"), assistant("hello"), user("again"), assistant("sure")];
    expect(closeDanglingRequests(all)).toEqual(all);
  });

  // The bug this replaces: Stop on a media job, then "hi", and the controller
  // went back to generating images because the media request was still the
  // newest thing it could see.
  it("closes a request that was stopped before any answer was saved", () => {
    const out = closeDanglingRequests([user("generate 4 instagram images"), user("hi")]);
    expect(out).toEqual([
      user("generate 4 instagram images"),
      assistant(INTERRUPTED_TURN_NOTE),
      user("hi"),
      assistant(INTERRUPTED_TURN_NOTE),
    ]);
  });

  it("closes a trailing user row, so history never ends on an open request", () => {
    const out = closeDanglingRequests([user("hi"), assistant("hello"), user("render a video")]);
    expect(out[out.length - 1]).toEqual(assistant(INTERRUPTED_TURN_NOTE));
  });

  it("never leaves two user rows side by side", () => {
    const out = closeDanglingRequests([user("a"), user("b"), user("c")]);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].role === "user" && out[i].role === "user").toBe(false);
    }
  });

  it("does not touch the input array", () => {
    const all = [user("a"), user("b")];
    closeDanglingRequests(all);
    expect(all).toHaveLength(2);
  });

  it("handles an empty history and one that opens with an assistant row", () => {
    expect(closeDanglingRequests([])).toEqual([]);
    const all = [assistant("summary of earlier turns"), user("hi"), assistant("hello")];
    expect(closeDanglingRequests(all)).toEqual(all);
  });

  it("tells the model to abandon the work rather than resume it", () => {
    expect(INTERRUPTED_TURN_NOTE.toLowerCase()).toContain("interrupted");
    expect(INTERRUPTED_TURN_NOTE.toLowerCase()).toContain("do not resume");
  });
});

describe("settleRuns", () => {
  const run = (phase: string, extra: Partial<SettleableRun> = {}): SettleableRun => ({
    phase,
    progress: "Generating image via the image model…",
    ...extra,
  });

  // The bug this replaces: a row left on "running" spun forever after Stop, and
  // was saved that way too, so it spun again on every reload of that message.
  it("moves a running row to cancelled and clears its progress line", () => {
    const runs = [run("running")];
    const changed = settleRuns(runs, "cancelled", "Stopped before it finished");
    expect(runs[0].phase).toBe("cancelled");
    expect(runs[0].progress).toBeUndefined();
    expect(runs[0].summary).toBe("Stopped before it finished");
    expect(changed).toEqual([runs[0]]);
  });

  it("leaves rows that already finished alone", () => {
    const runs = [run("done", { summary: "Rendered" }), run("error", { error: "429" }), run("cancelled")];
    expect(settleRuns(runs, "cancelled", "Stopped")).toEqual([]);
    expect(runs.map((r) => r.phase)).toEqual(["done", "error", "cancelled"]);
    expect(runs[0].summary).toBe("Rendered");
    expect(runs[1].error).toBe("429");
  });

  it("writes the note to error rather than summary when the turn failed", () => {
    const runs = [run("running")];
    settleRuns(runs, "error", "provider unavailable");
    expect(runs[0].error).toBe("provider unavailable");
    expect(runs[0].summary).toBeUndefined();
  });

  it("returns only the rows it changed, so the caller emits exactly those", () => {
    const runs = [run("done"), run("running"), run("running"), run("error")];
    const changed = settleRuns(runs, "cancelled", "Stopped");
    expect(changed).toHaveLength(2);
    expect(changed.every((r) => r.phase === "cancelled")).toBe(true);
  });

  it("fills a duration from the turn start, and keeps one it already had", () => {
    const runs = [run("running"), run("running", { durationMs: 500 })];
    settleRuns(runs, "cancelled", "Stopped", Date.now() - 1000);
    expect(runs[0].durationMs).toBeGreaterThanOrEqual(900);
    expect(runs[1].durationMs).toBe(500);
  });

  it("leaves the duration unset when the caller has no start time", () => {
    const runs = [run("running")];
    settleRuns(runs, "cancelled", "Stopped");
    expect(runs[0].durationMs).toBeUndefined();
  });
});

// ============================================================================
// Media models. The controller never draws or films anything itself, so the ids
// live in one client-safe module that both the server and every picker read. If
// a component hardcodes a model string again, the UI and the backend drift.
// ============================================================================

describe("media model registry", () => {
  it("resolves an image and a video model id", () => {
    for (const id of [IMAGE_MODEL_ID, VIDEO_MODEL_ID]) {
      expect(typeof id).toBe("string");
      expect(id.trim()).toBe(id);
      expect(id.length).toBeGreaterThan(0);
    }
    expect(IMAGE_MODEL_ID).not.toBe(VIDEO_MODEL_ID);
  });

  it("labels the models it ships with", () => {
    expect(mediaModelLabel("gemini-3-pro-image")).toBe("Nano Banana Pro");
    expect(mediaModelLabel("gemini-2.5-flash-image")).toBe("Nano Banana");
    expect(mediaModelLabel("gemini-omni-flash-preview")).toBe("Omni Flash Video");
  });

  it("shows an unknown id as-is instead of inventing a name", () => {
    expect(mediaModelLabel("some-future-model")).toBe("some-future-model");
    expect(mediaModelLabel("")).toBe("");
  });

  it("keeps the exported labels in step with the exported ids", () => {
    expect(IMAGE_MODEL_LABEL).toBe(mediaModelLabel(IMAGE_MODEL_ID));
    expect(VIDEO_MODEL_LABEL).toBe(mediaModelLabel(VIDEO_MODEL_ID));
  });
});
