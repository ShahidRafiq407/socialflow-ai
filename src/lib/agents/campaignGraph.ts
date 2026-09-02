import prisma from "@/lib/db";
import { vertexProvider, MODELS } from "@/lib/agents/llm";
import {
  generateMediaAsset,
  clampDeckSlides,
  MIN_DECK_SLIDES,
  DEFAULT_DECK_SLIDES,
  MediaAssetOutput,
} from "@/lib/agents/mediaGenerator";
import {
  computeFormatFamilies,
  describeMembers,
  countVisualTargets,
  memberKey,
  retagAssetForMember,
  dedupeAttachments,
  type FormatFamily,
  type FamilyMember,
} from "@/lib/agents/formatFamilies";
import { createThoughtEmitter } from "@/lib/agents/thoughtStream";
import { createLimiter, envConcurrency, envInt } from "@/lib/agents/concurrency";
import type { RunControls } from "@/lib/agents/runControls";
import {
  runDeterministicChecks,
  groupIssuesByPost,
  summarizeReport,
  limitsFor,
  AI_CLICHE_PHRASES,
  type QualityIssue,
  type QualityReport,
} from "@/lib/agents/qualityChecks";

export interface AgentEventCallback {
  (event: {
    type:
      | "workflow_started"
      | "phase_started"
      | "phase_completed"
      | "agent_started"
      | "agent_progress"
      | "agent_action"
      /** A real thought summary streamed from the model that is doing the work. */
      | "agent_thought"
      /**
       * One parallel unit of work (a format family) finished. Several families run
       * under a single agentId, so without this the console cannot tell a family that
       * succeeded from one still in flight — and a sibling's failure used to red-mark
       * both.
       */
      | "agent_scope_completed"
      | "web_search"
      | "source_found"
      | "output_ready"
      | "agent_completed"
      | "agent_error"
      | "workflow_completed"
      | "workflow_cancelled";
    agentId: string;
    data?: any;
  }): void;
}

export interface CampaignGraphInput {
  userId: string;
  workspaceId: string;
  platforms: string[];
  contentTypes: Record<string, string[]>;
  topic?: string;
  signal?: AbortSignal;
  workspaceData?: any;
  resumeState?: Partial<CampaignState>;
  resumeFromAgent?: string;
  /**
   * Live user steering. Lets a stuck render be abandoned without losing the run — see
   * `RunControls`. Optional so every existing caller (and every test) keeps working.
   */
  controls?: RunControls;
}

export interface GroundingSource {
  title: string;
  url: string;
  snippet: string;
}

export interface TrendInsight {
  insight: string;
  evidence: string;
  contentAngle: string;
  confidence: "high" | "medium" | "low";
}

export interface ContentOutputItem {
  platform: string;
  contentType: string;
  caption: string;
  hashtags: string[];
  hook: string;
  hookVariations: string[];
  slides?: string[];
  visualRequired: boolean;
  visualType: "image" | "video" | "text_only" | "multi_image";
  visualPrompt: string;
  visualPrompts?: string[];
  overlayText?: { step: number; title: string; body: string; theme: string }[];
  title?: string;
  aspectRatio: string;
  wordCount: number;
  readingTimeSeconds: number;
  /** Why the target audience stops for this post (from the copy agent). */
  userIntent?: string;
  /** Suggested posting time; surfaced by the AI Studio editor. */
  bestTime?: string;
  /** Which production family produced this post — every member shares one creative. */
  familyKey?: string;
  /** The single narrative all members of the campaign share. */
  coreIdea?: string;
}

export interface CampaignState {
  userId: string;
  workspaceId: string;
  platforms: string[];
  contentTypes: Record<string, string[]>;
  topic: string;
  brandData?: any;
  trendResearch?: {
    searchQueries: string[];
    sources: GroundingSource[];
    findings: string[];
    rawText: string;
    insights?: TrendInsight[];
    audiencePains?: string[];
    formatSignals?: string[];
    timelyHooks?: string[];
  };
  competitorAnalysis?: {
    positioning: string;
    contentPatterns: string[];
    hooks: string[];
    offers: string[];
    weaknesses: string[];
    differentiation: string[];
    topCompetitors?: string[];
    winningAngle?: string;
    /** Competitor names that were actually corroborated by the live search results. */
    verifiedCompetitors?: string[];
    unverifiedCompetitors?: string[];
  };
  generatedContent?: {
    platforms: Record<string, Record<string, ContentOutputItem>>;
  };
  generatedAssets?: MediaAssetOutput[];
  auditResult?: {
    passed: boolean;
    score: number;
    notes: string;
    issues: string[];
    /** How many revision rounds the CEO actually ran. */
    revisionRounds?: number;
    /** True when the subjective LLM review could not be obtained. */
    judgementUnavailable?: boolean;
    /**
     * Posts that ship without their media because every render attempt (the
     * visualizer's, then the CEO's recovery pass) failed or was skipped. The campaign
     * is still delivered: the user finishes these in the content editor. Present so the
     * UI can name them instead of the run dying with one generic error.
     */
    mediaGaps?: { platform: string; contentType: string; format: string; reason: string }[];
  };
  errors?: string[];
}

/** One creative core, shared by every member of a format family. */
interface FamilyCreative {
  coreIdea: string;
  hook: string;
  hookVariations: string[];
  visualPrompts: string[];
  slideTexts: { step: number; title: string; body: string; theme: string }[];
  videoStoryboard?: string;
  posts: Record<
    string,
    {
      title: string;
      caption: string;
      hashtags: string[];
      userIntent?: string;
      bestTime?: string;
    }
  >;
}

/**
 * Pulls the first JSON object out of a model response that may be wrapped in prose
 * or a fenced block. Grounded calls cannot use `responseMimeType: application/json`
 * (the Search tool and the JSON mode are mutually exclusive), so the JSON arrives
 * embedded in text and has to be sliced out.
 */
function extractJsonBlock(text: string): any | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // fall through to the next candidate
    }
  }
  return null;
}

/** Real sentences out of model prose — used when a model answers in text, not JSON. */
function sentencesFrom(text: string, min = 25, max = 6): string[] {
  return (text || "")
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) =>
      s
        .replace(/^[\s\-*•–]+/, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/[*_`#]+/g, "")
        .trim()
    )
    .filter((s) => s.length >= min)
    .slice(0, max);
}

const asStringArray = (value: any, max = 12): string[] =>
  Array.isArray(value)
    ? value
        .map((v) => (typeof v === "string" ? v : v?.toString?.() || ""))
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

/**
 * Text-rich formats (carousel / idea pin / document / multi-image) publish a DECK:
 * every slide is rendered as a designed infographic with its own headline + insight
 * typeset onto the graphic. That only works if the storyboard text array and the
 * background art-direction array line up 1:1, so this normalises whatever the copy
 * model returned into two equal-length arrays.
 */
function normalizeDeck(
  visualPrompts: string[],
  slideTexts: { step: number; title: string; body: string; theme: string }[],
  fallback: { hook: string; caption: string; brandName: string; topic: string }
): {
  visualPrompts: string[];
  slideTexts: { step: number; title: string; body: string; theme: string }[];
} {
  const themeFor = (idx: number) => (idx % 2 === 0 ? "gradient-purple" : "gradient-blue");

  // Real copy the model wrote (a title alone is enough — the body can be empty).
  const texts = slideTexts.filter((s) => (s.title || "").trim() || (s.body || "").trim());

  // Too thin to fill a deck: mine the hook + caption for real sentences so the slides
  // still teach something instead of repeating one headline on every slide.
  if (texts.length < MIN_DECK_SLIDES) {
    const sentences = (fallback.caption || "")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.replace(/#[\w-]+/g, "").trim())
      .filter((s) => s.length > 12);

    if (texts.length === 0) {
      texts.push({
        step: 1,
        title: fallback.hook || fallback.topic,
        body: sentences.shift() || "",
        theme: themeFor(0),
      });
    }
    while (texts.length < 4 && sentences.length > 0) {
      const s = sentences.shift() as string;
      const split = s.indexOf(":");
      const hasLabel = split > 8 && split < 60;
      texts.push({
        step: texts.length + 1,
        title: hasLabel ? s.slice(0, split).trim() : `Key insight ${texts.length}`,
        body: hasLabel ? s.slice(split + 1).trim() : s,
        theme: themeFor(texts.length),
      });
    }
    texts.push({
      step: texts.length + 1,
      title: "Your next step",
      body: `Follow ${fallback.brandName} for more on ${fallback.topic}.`,
      theme: themeFor(texts.length),
    });
  }

  // The storyboard length decides the deck size. Padding it out to match a longer
  // background-prompt array would publish the same headline on two slides.
  const deckSize = clampDeckSlides(texts.length, DEFAULT_DECK_SLIDES);

  const outTexts = Array.from({ length: deckSize }, (_, idx) => {
    const src = texts[idx] || texts[texts.length - 1];
    return {
      step: idx + 1,
      title: (src?.title || "").trim() || `Slide ${idx + 1}`,
      body: (src?.body || "").trim(),
      theme: themeFor(idx),
    };
  });

  const outPrompts = Array.from(
    { length: deckSize },
    (_, idx) => visualPrompts[idx] || visualPrompts[visualPrompts.length - 1] || ""
  );

  return { visualPrompts: outPrompts, slideTexts: outTexts };
}

export async function runCampaignGraph(
  input: CampaignGraphInput,
  onEvent: AgentEventCallback
): Promise<CampaignState> {
  const { userId, workspaceId, platforms, contentTypes, signal } = input;
  const controls = input.controls;

  /**
   * How long one family may hold the pipeline before it is abandoned automatically.
   *
   * This is a backstop, not a leash. A single image can legitimately need a couple of
   * minutes, and a deck renders its slides one after another, so the ceiling is
   * generous. It exists because a hung provider call used to hold the whole campaign
   * until the serverless function itself was killed — at which point the stream simply
   * stopped and the user was left watching a spinner with no error and no result.
   */
  const familyDeadlineMs = envInt("CAMPAIGN_FAMILY_DEADLINE_MS", 300000, {
    min: 60000,
    max: 900000,
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentDateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const checkCancelled = () => {
    if (signal?.aborted) {
      const err = new Error("Workflow cancelled by user");
      (err as any).isCancelled = true;
      throw err;
    }
  };

  // Every event carries a monotonically increasing sequence number. The modal used to
  // build its dedup key from the payload contents, so two genuinely different steps
  // that happened to produce the same label were collapsed into one — real progress
  // vanished from the console. `seq` makes every emitted step unique by construction.
  let seq = 0;
  const emit: AgentEventCallback = (event) => {
    seq += 1;
    onEvent({
      ...event,
      data: { ...(event.data || {}), seq, ts: Date.now() },
    });
  };

  const state: CampaignState = {
    userId,
    workspaceId,
    platforms,
    contentTypes,
    // The topic is the campaign's subject. Falling back to a hardcoded marketing
    // phrase produced generic posts, so an empty topic instead resolves from the
    // brand itself once brand DNA has loaded (see `resolvedTopic` below).
    topic: (input.topic || "").trim(),
    brandData: input.resumeState?.brandData,
    trendResearch: input.resumeState?.trendResearch,
    competitorAnalysis: input.resumeState?.competitorAnalysis,
    generatedContent: input.resumeState?.generatedContent,
    generatedAssets: input.resumeState?.generatedAssets || [],
    errors: [],
  };

  emit({
    type: "workflow_started",
    agentId: "system",
    data: { message: "Starting Multi-Agent Campaign Engine" },
  });

  // Real, verifiable execution progress derived from work that actually completed
  // (loaded records, drafted posts, rendered assets, audit results).
  const emitProgress = (
    agentId: string,
    progress: number,
    stage: string,
    safe_summary: string,
    status: "running" | "completed" = "running"
  ) => {
    emit({
      type: "agent_progress",
      agentId,
      data: {
        agent: agentId,
        status,
        stage,
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        safe_summary,
      },
    });
  };

  /**
   * Live reasoning. Gemini returns thought summaries on the SAME request as the
   * answer when `thinkingConfig.includeThoughts` is set, so this is the model's real
   * reasoning about THIS campaign — not a scripted string — at no extra latency.
   * `scope` labels which parallel unit of work a thought belongs to, because several
   * agents stream at once.
   */
  const makeThoughts = (agentId: string, scope: string | undefined, maxLines: number) =>
    createThoughtEmitter({
      maxLines,
      emit: (line, index) =>
        emit({ type: "agent_thought", agentId, data: { line, index, scope } }),
    });

  /**
   * Closes one parallel unit of work. The console keeps a unit's latest line marked
   * in-flight until it hears this, which is what lets it show a family that finished
   * as finished while its siblings are still running.
   */
  const completeScope = (agentId: string, scope: string) =>
    emit({ type: "agent_scope_completed", agentId, data: { scope } });

  /**
   * Opens a phase and says how its agents relate to each other.
   *
   * `"sequential"` — one agent, or several that strictly follow one another.
   * `"parallel"`   — independent agents genuinely running side by side (research:
   *                  the trend researcher and the competitor analyst never wait for
   *                  each other and could finish in either order).
   * `"pipeline"`   — both agents are live at once, but one FEEDS the other. Content
   *                  production is this: the visualizer cannot render a family until
   *                  the content creator has written that family's brief. It overlaps
   *                  because family B's copy is written while family A renders — not
   *                  because the two agents are independent. Calling that "parallel"
   *                  overstated it, and the console showed the visualizer as running
   *                  while it was in fact waiting for its first prompt.
   *
   * `parallel` stays on the wire beside `mode` for any client that only knows the flag.
   */
  const startPhase = (
    phase: string,
    label: string,
    agents: string[],
    mode: "sequential" | "parallel" | "pipeline"
  ) =>
    emit({
      type: "phase_started",
      agentId: "system",
      data: { phase, label, agents, mode, parallel: mode !== "sequential" },
    });
  const completePhase = (phase: string) =>
    emit({ type: "phase_completed", agentId: "system", data: { phase } });

  // =========================================================================
  // PHASE 1 — BRAND ANALYST (workspace database)
  // =========================================================================
  checkCancelled();
  startPhase("foundation", "Brand foundation", ["brand_analyst"], "sequential");

  const shouldRunBrand = !state.brandData || input.resumeFromAgent === "brand_analyst";

  if (!shouldRunBrand && state.brandData) {
    emit({ type: "agent_started", agentId: "brand_analyst" });
    emit({
      type: "agent_action",
      agentId: "brand_analyst",
      data: { label: `Loaded Brand: ${state.brandData.name} (${state.brandData.industry})` },
    });
    emitProgress("brand_analyst", 100, "loaded", "Brand DNA loaded", "completed");
    emit({ type: "output_ready", agentId: "brand_analyst", data: state.brandData });
    emit({ type: "agent_completed", agentId: "brand_analyst" });
  } else {
    const brandStartTime = Date.now();
    emit({ type: "agent_started", agentId: "brand_analyst" });
    emit({
      type: "agent_action",
      agentId: "brand_analyst",
      data: { label: "Loading brand DNA...", detail: "Querying workspace database" },
    });
    emitProgress("brand_analyst", 15, "loading_brand", "Loading brand DNA from database");

    try {
      let workspace = input.workspaceData;
      if (!workspace) {
        workspace = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          include: { brandDNA: true, competitors: true },
        });
      }

      const dna = workspace?.brandDNA;
      const hasCustomDNA = Boolean(dna && (dna.tone || dna.missionVision || dna.targetAudience));

      state.brandData = {
        name: workspace?.name || "Brand",
        industry: workspace?.industry || "Technology & Automation",
        website: workspace?.website || "",
        tone: dna?.tone || "Professional, Authoritative, Conversational",
        missionVision: dna?.missionVision || "Drive growth through smart digital solutions",
        targetAudience: dna?.targetAudience || "Modern Business Decision Makers",
        writingStyle: dna?.writingStyle || "Direct, engaging, value-driven",
        // Drives the palette of text-rich carousel / document slides (slideDesigner).
        primaryColors: Array.isArray(dna?.primaryColors) ? dna.primaryColors.filter(Boolean) : [],
        // Stored per workspace but never consulted before: these words are now banned
        // in the copy prompt AND enforced by the deterministic CEO check.
        forbiddenWords: Array.isArray(dna?.forbiddenWords)
          ? dna.forbiddenWords.map((w: any) => (w || "").toString().trim()).filter(Boolean)
          : [],
        hasCustomDNA,
      };

      const brandElapsed = Date.now() - brandStartTime;
      emit({
        type: "agent_action",
        agentId: "brand_analyst",
        data: { label: `Loaded Brand: ${state.brandData.name} (${state.brandData.industry})` },
      });
      if (state.brandData.forbiddenWords.length > 0) {
        emit({
          type: "agent_action",
          agentId: "brand_analyst",
          data: {
            label: `Enforcing ${state.brandData.forbiddenWords.length} brand-forbidden word(s) across all copy`,
            detail: state.brandData.forbiddenWords.join(", "),
          },
        });
      }
      emitProgress("brand_analyst", 100, "loaded", "Brand DNA loaded", "completed");
      emit({
        type: "output_ready",
        agentId: "brand_analyst",
        data: { ...state.brandData, elapsedMs: brandElapsed },
      });
      emit({ type: "agent_completed", agentId: "brand_analyst" });
    } catch (err: any) {
      console.error("Brand Analyst error:", err);
      emit({
        type: "agent_error",
        agentId: "brand_analyst",
        data: { message: err.message || "Failed to load brand DNA" },
      });
      throw err; // HALT WORKFLOW IMMEDIATELY ON ERROR
    }
  }

  completePhase("foundation");

  // The campaign subject: whatever the user typed, else the brand's own positioning.
  const topic =
    state.topic ||
    `${state.brandData.industry} growth for ${state.brandData.targetAudience}`;
  state.topic = topic;

  const brandForbidden: string[] = state.brandData.forbiddenWords || [];
  const bannedList = [...brandForbidden, ...AI_CLICHE_PHRASES];

  // =========================================================================
  // PHASE 2 — TREND RESEARCHER ∥ COMPETITOR ANALYST
  // Both depend only on brand DNA, never on each other, so they run concurrently:
  // the phase costs max(trend, competitor) instead of the sum.
  // =========================================================================
  checkCancelled();
  startPhase("research", "Market research", ["trend_researcher", "competitor_analyst"], "parallel");

  // Halt propagation: when one research agent fails (or the run is cancelled), the
  // sibling stops at its next checkpoint instead of continuing orphaned Vertex/DB
  // work on an already-failed workflow.
  let researchHalted = false;
  const checkResearchRunnable = () => {
    checkCancelled();
    if (researchHalted) {
      const err = new Error("Research phase halted (sibling agent failed)");
      (err as any).isSilentHalt = true;
      throw err;
    }
  };

  const runTrendResearcher = async () => {
    const shouldRunTrend =
      !state.trendResearch ||
      input.resumeFromAgent === "brand_analyst" ||
      input.resumeFromAgent === "trend_researcher";

    if (!shouldRunTrend && state.trendResearch) {
      emit({ type: "agent_started", agentId: "trend_researcher" });
      if (state.trendResearch.sources?.length) {
        emit({
          type: "source_found",
          agentId: "trend_researcher",
          data: { count: state.trendResearch.sources.length, sources: state.trendResearch.sources },
        });
      }
      emit({ type: "output_ready", agentId: "trend_researcher", data: state.trendResearch });
      emitProgress("trend_researcher", 100, "completed", "Trend research restored", "completed");
      emit({ type: "agent_completed", agentId: "trend_researcher" });
      return;
    }

    emit({ type: "agent_started", agentId: "trend_researcher" });
    emit({
      type: "agent_action",
      agentId: "trend_researcher",
      data: {
        label: `Researching live signals for ${state.brandData.industry}`,
        detail: `Audience: ${state.brandData.targetAudience}`,
      },
    });

    checkResearchRunnable();

    // Four distinct research angles instead of one broad query. A single "latest
    // trends in X" search returns evergreen filler; asking separately for recent
    // events, audience questions, format performance and dated opportunities is what
    // makes the findings specific enough to write a campaign from.
    const platformList = platforms.map((p) => p.toUpperCase()).join(", ");
    const angles = [
      `${state.brandData.industry} news, launches and notable changes in the last 90 days (as of ${currentDateStr})`,
      `What ${state.brandData.targetAudience} are asking about and complaining about in ${state.brandData.industry} right now`,
      `Which social content formats and hooks are over-performing for ${state.brandData.industry} on ${platformList} in ${currentYear}`,
      `Dated opportunities in the next 30 days for ${state.brandData.industry}: events, seasons, deadlines, reports`,
    ];

    for (const angle of angles) {
      emit({ type: "web_search", agentId: "trend_researcher", data: { query: angle, searchDate: currentDateStr } });
    }
    emitProgress("trend_researcher", 20, "searching", `Running ${angles.length} live search angles`);

    try {
      const thoughts = makeThoughts("trend_researcher", "trend research", 12);

      const trendPrompt = `You are a senior trend researcher briefing a campaign team. Today is ${currentDateStr}.

Use live web search to investigate ALL FOUR angles below for ${state.brandData.name} (${state.brandData.industry}), whose audience is ${state.brandData.targetAudience}:
${angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}

EVIDENCE RULES — these decide whether your output is usable:
- Every insight must come from something you actually found. If you could not verify it, leave it out. A short list of verified insights beats a long list of guesses.
- Prefer specifics: names, numbers, dates, percentages, product names, policy changes.
- Reject evergreen platitudes. "Short-form video performs well" is worthless; "X changed its recommendation weighting on <date>, so <consequence>" is usable.
- State your confidence honestly. "low" is a valid answer.
- Topic focus for this campaign: "${topic}".

Answer with a single JSON object inside a \`\`\`json fenced block, and nothing else:
{
  "insights": [
    { "insight": "what is happening", "evidence": "the specific fact/number/date you found", "contentAngle": "how a post should use this", "confidence": "high | medium | low" }
  ],
  "audiencePains": ["a real question or complaint this audience is voicing right now"],
  "formatSignals": ["a format/hook that is measurably working on these platforms right now"],
  "timelyHooks": ["a dated opportunity in the next 30 days"]
}`;

      const grounded = await vertexProvider.generateGroundedWithThoughts(
        trendPrompt,
        { modelName: MODELS.TREND_RESEARCHER, temperature: 0.3, signal },
        { onThought: (chunk) => thoughts.push(chunk) }
      );
      thoughts.flush();

      checkResearchRunnable();
      emitProgress("trend_researcher", 65, "reviewing_sources", "Reviewing what the sources actually say");

      const rawText = grounded.text || "";
      let parsed = extractJsonBlock(rawText);

      // The grounded call answers in prose sometimes (Search grounding and JSON mode
      // cannot both be enabled). One cheap structuring pass over text we already have
      // is far better than inventing findings.
      if (!parsed?.insights && rawText.trim()) {
        emit({
          type: "agent_action",
          agentId: "trend_researcher",
          data: { label: "Structuring the research notes into campaign-ready insights" },
        });
        try {
          const repair = await vertexProvider.generateJSONWithThoughts(
            [
              {
                role: "user",
                content: `Convert these research notes into the exact JSON schema below. Use ONLY facts present in the notes — do not add anything.

NOTES:
"""
${rawText.slice(0, 6000)}
"""

Schema:
{"insights":[{"insight":"","evidence":"","contentAngle":"","confidence":"high|medium|low"}],"audiencePains":[],"formatSignals":[],"timelyHooks":[]}`,
              },
            ],
            { modelName: MODELS.TREND_RESEARCHER, temperature: 0.1, signal },
            { onThought: (chunk) => thoughts.push(chunk) }
          );
          parsed = repair.data;
        } catch (repairErr: any) {
          console.warn("[Trend Researcher] Structuring pass failed:", repairErr?.message || repairErr);
        }
      }

      const insights: TrendInsight[] = Array.isArray(parsed?.insights)
        ? parsed.insights
            .map((i: any) => ({
              insight: (i?.insight || "").toString().trim(),
              evidence: (i?.evidence || "").toString().trim(),
              contentAngle: (i?.contentAngle || "").toString().trim(),
              confidence: ["high", "medium", "low"].includes((i?.confidence || "").toString())
                ? i.confidence
                : "medium",
            }))
            .filter((i: TrendInsight) => i.insight.length > 8)
            .slice(0, 6)
        : [];

      // Findings are what the copy agent reads. They are built from the model's own
      // words — never from a canned list, so an empty research result stays visibly
      // empty instead of masquerading as insight.
      const findings =
        insights.length > 0
          ? insights.map((i) =>
              i.evidence ? `${i.insight} (evidence: ${i.evidence})` : i.insight
            )
          : sentencesFrom(rawText, 30, 5);

      if (findings.length === 0) {
        throw new Error(
          "Trend research returned no verifiable findings. Check Google Search grounding availability for the configured model."
        );
      }

      const sources: GroundingSource[] = grounded.sources?.length
        ? grounded.sources
        : // No grounding chunks came back: record that honestly rather than fabricating
          // a citation list. The console shows 0 sources so the user can judge it.
          [];

      state.trendResearch = {
        searchQueries: grounded.searchQueries?.length ? grounded.searchQueries : angles,
        sources,
        findings,
        rawText,
        insights,
        audiencePains: asStringArray(parsed?.audiencePains, 6),
        formatSignals: asStringArray(parsed?.formatSignals, 6),
        timelyHooks: asStringArray(parsed?.timelyHooks, 6),
      };

      emit({
        type: "agent_action",
        agentId: "trend_researcher",
        data: {
          label: `${sources.length} live source(s) → ${findings.length} actionable insight(s)`,
          detail: insights.length
            ? `Confidence: ${insights.map((i) => i.confidence).join(", ")}`
            : "Derived from grounded research notes",
        },
      });
      if (sources.length > 0) {
        emit({ type: "source_found", agentId: "trend_researcher", data: { count: sources.length, sources } });
      }
      emitProgress("trend_researcher", 100, "completed", "Trend research complete", "completed");
      emit({ type: "output_ready", agentId: "trend_researcher", data: state.trendResearch });
      emit({ type: "agent_completed", agentId: "trend_researcher" });
    } catch (err: any) {
      if (err?.isSilentHalt) throw err;
      if (err?.isCancelled) throw err;
      researchHalted = true;
      console.error("Trend Researcher error:", err);
      emit({
        type: "agent_error",
        agentId: "trend_researcher",
        data: { message: err.message || "Trend research failed" },
      });
      throw err; // HALT WORKFLOW IMMEDIATELY ON ERROR
    }
  };

  const runCompetitorAnalyst = async () => {
    const shouldRunComp =
      !state.competitorAnalysis ||
      input.resumeFromAgent === "brand_analyst" ||
      input.resumeFromAgent === "trend_researcher" ||
      input.resumeFromAgent === "competitor_analyst";

    if (!shouldRunComp && state.competitorAnalysis) {
      emit({ type: "agent_started", agentId: "competitor_analyst" });
      emitProgress("competitor_analyst", 100, "completed", "Competitor analysis restored", "completed");
      emit({ type: "output_ready", agentId: "competitor_analyst", data: state.competitorAnalysis });
      emit({ type: "agent_completed", agentId: "competitor_analyst" });
      return;
    }

    emit({ type: "agent_started", agentId: "competitor_analyst" });
    emitProgress("competitor_analyst", 12, "scanning_market", `Scanning ${state.brandData.industry} competitors`);

    checkResearchRunnable();

    // Named competitors from the workspace make the search concrete; without them the
    // model has to guess who the competition even is.
    const dbCompetitors = await prisma.competitor.findMany({
      where: { workspaceId },
      take: 6,
    });
    const namedCompetitors = dbCompetitors.map((c) => c.name).filter(Boolean);

    emit({
      type: "agent_action",
      agentId: "competitor_analyst",
      data: {
        label: namedCompetitors.length
          ? `Analysing ${namedCompetitors.length} tracked competitor(s): ${namedCompetitors.join(", ")}`
          : `No tracked competitors on file — identifying the real market leaders first`,
      },
    });

    const compAngles = namedCompetitors.length
      ? [
          `Recent social media content, offers and messaging from ${namedCompetitors.join(", ")} (${currentYear})`,
          `What ${namedCompetitors.join(", ")} are criticised for by their own customers`,
          `Content gaps and unanswered audience questions in ${state.brandData.industry}`,
        ]
      : [
          `Who are the leading brands in ${state.brandData.industry} serving ${state.brandData.targetAudience} in ${currentYear}`,
          `Which social posts and hooks are performing best for ${state.brandData.industry} brands in ${currentYear}`,
          `Common complaints and unmet needs of ${state.brandData.targetAudience} in ${state.brandData.industry}`,
        ];

    for (const angle of compAngles) {
      emit({ type: "web_search", agentId: "competitor_analyst", data: { query: angle } });
    }

    try {
      const thoughts = makeThoughts("competitor_analyst", "competitor analysis", 12);

      const searchPrompt = `You are a competitive intelligence analyst. Today is ${currentDateStr}.
Use live web search to investigate the following for the ${state.brandData.industry} market (audience: ${state.brandData.targetAudience}):
${compAngles.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Report what you actually found: brand names, the kind of posts they publish, the hooks and offers they use, and where customers say they fall short. Name your sources inline. If something is not verifiable, say so instead of filling the gap.`;

      let searchText = "";
      let compSources: GroundingSource[] = [];
      try {
        const groundedComp = await vertexProvider.generateGroundedWithThoughts(
          searchPrompt,
          { modelName: MODELS.COMPETITOR_ANALYST, temperature: 0.3, signal },
          { onThought: (chunk) => thoughts.push(chunk) }
        );
        searchText = groundedComp.text || "";
        compSources = groundedComp.sources || [];
      } catch (groundErr: any) {
        if (groundErr?.isCancelled) throw groundErr;
        // Grounding is an enhancement here, not a requirement: the synthesis below can
        // still run from the tracked competitor list. The console says so explicitly
        // instead of pretending the market was searched.
        console.warn("[Competitor Analyst] Live search unavailable:", groundErr?.message || groundErr);
        emit({
          type: "agent_action",
          agentId: "competitor_analyst",
          data: { label: "Live search unavailable — analysing from tracked competitors only" },
        });
      }

      if (compSources.length > 0) {
        emit({
          type: "source_found",
          agentId: "competitor_analyst",
          data: { count: compSources.length, sources: compSources },
        });
      }

      checkResearchRunnable();
      emitProgress("competitor_analyst", 60, "synthesizing", "Turning findings into a winning angle");

      const compPrompt = `You are an elite competitive strategist. Today is ${currentDateStr}.

BRAND
- Name: ${state.brandData.name}
- Industry: ${state.brandData.industry}
- Audience: ${state.brandData.targetAudience}
- Tone: ${state.brandData.tone}
- Mission: ${state.brandData.missionVision}
- Campaign topic: "${topic}"

TRACKED COMPETITORS (from the client's own workspace): ${namedCompetitors.join(", ") || "none on file"}

LIVE MARKET RESEARCH${compSources.length ? ` (${compSources.length} sources)` : " (unavailable — rely on the tracked list only)"}:
"""
${searchText.slice(0, 6000) || "No live search results were returned."}
"""

RULES
- Only name a competitor you can support from the research above or the tracked list. Do not invent brands.
- Every contentPattern, hook and weakness must be something the research shows, not a generic marketing truism.
- If a field cannot be filled honestly, return an empty array for it. An empty array is a valid, useful answer.
- The winningAngle must be a specific, defensible position ${state.brandData.name} can hold — not "be more authentic".

Return strictly JSON:
{
  "topCompetitors": ["real brand names"],
  "positioning": "how the competition currently positions itself, in 2-3 sentences",
  "contentPatterns": ["post pattern that is actually working for them"],
  "hooks": ["hook they actually use"],
  "offers": ["offer/CTA they actually run"],
  "weaknesses": ["specific, evidenced weakness or gap"],
  "winningAngle": "the specific angle this brand should own",
  "differentiation": ["concrete differentiation move"]
}`;

      const compRes = await vertexProvider.generateJSONWithThoughts(
        [{ role: "user", content: compPrompt }],
        { modelName: MODELS.COMPETITOR_ANALYST, temperature: 0.2, signal },
        { onThought: (chunk) => thoughts.push(chunk) }
      );
      thoughts.flush();

      const data = compRes.data || {};
      const claimed = asStringArray(data.topCompetitors, 6);

      // Cross-check claimed competitors against evidence actually in hand. A name the
      // model produced but nothing corroborates is reported as unverified rather than
      // silently presented as market intelligence.
      const evidenceBlob = `${searchText}\n${compSources.map((s) => `${s.title} ${s.snippet}`).join("\n")}\n${namedCompetitors.join("\n")}`.toLowerCase();
      const verified = claimed.filter((name) => evidenceBlob.includes(name.toLowerCase()));
      const unverified = claimed.filter((name) => !verified.includes(name));

      state.competitorAnalysis = {
        positioning: (data.positioning || "").toString().trim(),
        contentPatterns: asStringArray(data.contentPatterns, 6),
        hooks: asStringArray(data.hooks, 6),
        offers: asStringArray(data.offers, 6),
        weaknesses: asStringArray(data.weaknesses, 6),
        differentiation: asStringArray(data.differentiation, 6),
        topCompetitors: claimed,
        winningAngle: (data.winningAngle || "").toString().trim(),
        verifiedCompetitors: verified,
        unverifiedCompetitors: unverified,
      };

      if (!state.competitorAnalysis.positioning && !state.competitorAnalysis.differentiation.length) {
        throw new Error(
          "Competitor analysis produced no usable positioning or differentiation. Re-run once the market data is available."
        );
      }

      if (claimed.length > 0) {
        emit({
          type: "agent_action",
          agentId: "competitor_analyst",
          data: {
            label: `Competitors analysed: ${claimed.slice(0, 4).join(", ")}`,
            detail: unverified.length
              ? `${verified.length} corroborated by sources, ${unverified.length} unverified (${unverified.join(", ")})`
              : `All ${verified.length} corroborated by the research`,
          },
        });
      }
      if (state.competitorAnalysis.winningAngle) {
        emit({
          type: "agent_action",
          agentId: "competitor_analyst",
          data: { label: `Winning angle: ${state.competitorAnalysis.winningAngle}` },
        });
      }

      emitProgress("competitor_analyst", 100, "completed", "Competitor analysis complete", "completed");
      emit({ type: "output_ready", agentId: "competitor_analyst", data: state.competitorAnalysis });
      emit({ type: "agent_completed", agentId: "competitor_analyst" });
    } catch (err: any) {
      if (err?.isSilentHalt) throw err;
      if (err?.isCancelled) throw err;
      researchHalted = true;
      console.error("Competitor Analyst error:", err);
      emit({
        type: "agent_error",
        agentId: "competitor_analyst",
        data: { message: err.message || "Competitor analysis failed" },
      });
      throw err; // HALT WORKFLOW IMMEDIATELY ON ERROR
    }
  };

  await Promise.all([runTrendResearcher(), runCompetitorAnalyst()]);
  completePhase("research");

  // =========================================================================
  // PHASE 3 — CONTENT CREATOR: one shared creative per format family
  //
  // Families are the unit of work: every (platform, format) target that needs the
  // same artefact shares ONE creative and ONE render.
  //
  // This used to be a single "Content production" phase with the content creator and
  // the visualizer listed as parallel agents, pipelined so a family's render began the
  // moment its copy landed. That reads as parallelism but misdescribes the graph: the
  // visualizer cannot touch a family until the content creator has handed it that
  // family's visual prompt, so the dependency is real and one-directional. The two are
  // now separate stages — all copy, then all renders — and each stage runs at the width
  // its provider can take: several families written at once, then one family rendered at
  // a time (the image model's per-minute quota cannot take more).
  // =========================================================================
  checkCancelled();
  startPhase("copy", "Content writing", ["content_creator"], "parallel");

  const families = computeFormatFamilies(platforms, contentTypes, { deckSlides: DEFAULT_DECK_SLIDES });
  const visualFamilies = families.filter((f) => f.visualRequired);
  const visualTargets = countVisualTargets(families);

  if (families.length === 0) {
    const err = new Error("No platform/format targets were requested for this campaign.");
    emit({ type: "agent_error", agentId: "content_creator", data: { message: err.message } });
    throw err;
  }

  const contentRestored =
    Boolean(state.generatedContent) &&
    !["brand_analyst", "trend_researcher", "competitor_analyst", "content_creator"].includes(
      input.resumeFromAgent || ""
    );

  /**
   * A retry that starts at the audit keeps the media the previous attempt produced.
   *
   * Re-rendering it would spend the image quota — the actual bottleneck of this pipeline —
   * on work that is already done. It is also how the user skips a media step that keeps
   * failing: resume at the audit, keep whatever rendered, and let the campaign finish with
   * the still-missing formats reported as gaps to fill in the content editor.
   */
  const mediaRestored =
    input.resumeFromAgent === "ceo_auditor" && (state.generatedAssets?.length ?? 0) > 0;

  emit({ type: "agent_started", agentId: "content_creator" });

  const totalTargets = families.reduce((acc, f) => acc + f.members.length, 0);
  emit({
    type: "agent_action",
    agentId: "content_creator",
    data: {
      label: `${totalTargets} post(s) across ${platforms.length} platform(s) grouped into ${families.length} production famil${families.length === 1 ? "y" : "ies"}`,
      detail: families.map((f) => `${f.label}: ${describeMembers(f)}`).join(" • "),
    },
  });

  state.generatedContent = state.generatedContent || { platforms: {} };
  // Only a run that is going to render clears the asset list; a resume at the audit is
  // carrying last attempt's media and must not throw it away.
  state.generatedAssets = mediaRestored ? state.generatedAssets || [] : [];

  // Parallelism is applied only where the work genuinely runs on different resources.
  //
  // Copy families DO overlap: several text families at once are different prompts on the
  // text model, whose per-minute allowance comfortably covers a handful of requests.
  //
  // Media families render ONE AT A TIME by default, and that is deliberate. On the
  // image quotas these projects actually have (a few requests per minute) the model is
  // also slow — 30-120s per render — so its own render time already paces it well under
  // the wall. Firing several families at once buys no real speed there (the quota, not
  // the CPU, is the limit) and instead slams the per-minute window: the pacer then has
  // to stall everyone 60s at a time and the console fills with "resuming in 60s". Going
  // one family after another keeps the request rate naturally below the quota, so the
  // 429s — and the retries that chase them — mostly stop happening. Raise
  // CAMPAIGN_MEDIA_CONCURRENCY only on a project with a genuinely lifted image quota.
  const copyConcurrency = envConcurrency("CAMPAIGN_COPY_CONCURRENCY", 3);
  const mediaConcurrency = envConcurrency("CAMPAIGN_MEDIA_CONCURRENCY", 1);
  const copyLimiter = createLimiter(copyConcurrency);
  const mediaLimiter = createLimiter(mediaConcurrency);

  let productionHalted = false;
  const checkProductionRunnable = () => {
    checkCancelled();
    if (productionHalted) {
      const err = new Error("Production phase halted (a sibling family failed)");
      (err as any).isSilentHalt = true;
      throw err;
    }
  };

  const trend = state.trendResearch;
  const comp = state.competitorAnalysis;
  const sharedIntel = `TREND SIGNALS (verified this run):
${(trend?.findings || []).map((f) => `- ${f}`).join("\n") || "- none available"}
AUDIENCE PAIN POINTS: ${JSON.stringify(trend?.audiencePains || [])}
FORMAT SIGNALS: ${JSON.stringify(trend?.formatSignals || [])}
TIMELY HOOKS: ${JSON.stringify(trend?.timelyHooks || [])}

COMPETITIVE POSITION
- Competitors: ${(comp?.verifiedCompetitors?.length ? comp.verifiedCompetitors : comp?.topCompetitors || []).join(", ") || "not identified"}
- How they position: ${comp?.positioning || "unknown"}
- Their weaknesses: ${JSON.stringify(comp?.weaknesses || [])}
- Our winning angle: ${comp?.winningAngle || (comp?.differentiation || [])[0] || "differentiate on specificity and proof"}
- Differentiation moves: ${JSON.stringify(comp?.differentiation || [])}`;

  const bannedClause = `BANNED LANGUAGE — using any of these is an automatic rejection:
${bannedList.map((w) => `"${w}"`).join(", ")}
${brandForbidden.length ? `The first ${brandForbidden.length} are words this brand has explicitly forbidden.` : ""}`;

  let copiesDone = 0;
  let rendersDone = 0;
  let contentCompleted = false;

  const markCopyDone = (family: FormatFamily) => {
    copiesDone += 1;
    emitProgress(
      "content_creator",
      Math.round((copiesDone / families.length) * 100),
      copiesDone === families.length ? "completed" : "drafting",
      `Copy written for ${describeMembers(family)}`,
      copiesDone === families.length ? "completed" : "running"
    );
    if (copiesDone === families.length && !contentCompleted) {
      contentCompleted = true;
      emit({ type: "output_ready", agentId: "content_creator", data: state.generatedContent });
      emit({ type: "agent_completed", agentId: "content_creator" });
    }
  };

  const markRenderDone = (label: string) => {
    rendersDone += 1;
    emitProgress(
      "visualizer",
      visualFamilies.length === 0 ? 100 : Math.round((rendersDone / visualFamilies.length) * 100),
      rendersDone === visualFamilies.length ? "completed" : "generating",
      label
    );
  };

  /** Builds the one creative brief a whole family shares. */
  const writeFamilyCopy = async (family: FormatFamily, index: number): Promise<FamilyCreative> => {
    checkProductionRunnable();

    const scope = family.label;
    const thoughts = makeThoughts("content_creator", scope, 8);

    emit({
      type: "agent_action",
      agentId: "content_creator",
      data: {
        label: `Writing the ${family.label} creative for ${describeMembers(family)}`,
        detail: `One shared hook, storyboard and art direction; per-platform captions`,
        scope,
      },
    });

    const memberSpecs = family.members
      .map(
        (m) =>
          `- ${m.platform} / ${m.contentType} → ${m.description}. Native ratio ${m.aspectRatio}. Caption limit ${limitsFor(m.platform).captionMax} chars, max ${limitsFor(m.platform).hashtagMax} hashtags.`
      )
      .join("\n");

    const deckClause =
      family.kind === "multi_image"
        ? `THIS FAMILY PUBLISHES A SLIDE DECK (${family.plannedSlides} slides target, ${MIN_DECK_SLIDES} minimum).
Each slide is rendered as a designed infographic with its headline and insight TYPESET ONTO the graphic, so:
- "slideTexts" and "visualPrompts" must have the SAME length, one entry per slide.
- "slideTexts[i].title" is the words printed largest on slide i (max 60 chars). "body" is the readable insight beneath it (max 200 chars).
- "visualPrompts[i]" describes ONLY the background / supporting graphic for slide i (abstract shapes, illustration, iconography, low-contrast imagery, data-visual accents). Never describe the text — the design engine typesets it. Keep the area behind text calm and low-contrast.
- Storyboard arc: slide 1 hooks, middle slides carry the problem, the framework and the proof (concrete numbers, steps or benchmarks), final slide is the takeaway + CTA.`
        : family.kind === "video"
          ? `THIS FAMILY PUBLISHES ONE VERTICAL-OR-LANDSCAPE VIDEO (${family.renderAspectRatio}).
- "visualPrompts" holds exactly ONE prompt: the full shot description for the generated video.
- "videoStoryboard" is a beat-by-beat shot list (0-3s hook, 3-8s payoff, 8-15s CTA) in plain sentences.
- "slideTexts" must be an empty array.`
          : family.kind === "text_only"
            ? `THIS FAMILY PUBLISHES TEXT ONLY — no media will be generated.
- "visualPrompts" must be an empty array and "slideTexts" an empty array.
- The caption carries the entire post, so it must stand alone.`
            : `THIS FAMILY PUBLISHES ONE STILL IMAGE (${family.renderAspectRatio}).
- "visualPrompts" holds exactly ONE production-grade image prompt: subject, composition, lighting, mood, colour.
- "slideTexts" must be an empty array.`;

    const prompt = `You are an elite creative copywriter and social growth strategist writing for ${state.brandData.name}.

BRAND
- Industry: ${state.brandData.industry}
- Tone: ${state.brandData.tone}
- Writing style: ${state.brandData.writingStyle}
- Audience: ${state.brandData.targetAudience}
- Mission: ${state.brandData.missionVision}
- Campaign topic: "${topic}"

${sharedIntel}

THIS IS FAMILY ${index + 1} OF ${families.length}: ${family.label}
Every post below is produced from ONE shared creative. They share the same core idea, the same hook and the same visual, and differ ONLY in caption length, phrasing and hashtags to suit each platform. Do not invent a different topic per platform.
${memberSpecs}

${deckClause}

CRAFT REQUIREMENTS
1. Open on the audience's actual pain or a genuine curiosity gap — the first line has to survive a 1-second scroll.
2. Write like a human expert talking to a peer: varied sentence length, plain words, a specific detail or number instead of a claim.
3. Use the trend evidence above where it genuinely fits. Never reference a trend you were not given.
4. End with a CTA that suits the platform (save/share on Instagram, comment on LinkedIn, follow on TikTok...).
5. Respect every caption and hashtag limit listed above — going over is a hard failure.

${bannedClause}

Return strictly JSON:
{
  "coreIdea": "the single narrative all these posts express, one sentence",
  "hook": "the shared 1-2 second hook",
  "hookVariations": ["alternative hook A", "alternative hook B", "alternative hook C"],
  "visualPrompts": ${family.kind === "multi_image" ? `["background art direction slide 1", "...slide 2", "...slide 3"]` : family.kind === "text_only" ? "[]" : `["the single visual prompt"]`},
  "slideTexts": ${family.kind === "multi_image" ? `[{"title": "slide 1 headline (the hook)", "body": "slide 1 insight"}, {"title": "slide 2 headline", "body": "slide 2 insight"}]` : "[]"},
  ${family.kind === "video" ? `"videoStoryboard": "beat-by-beat shot list",` : ""}
  "posts": [
${family.members
  .map(
    (m) =>
      `    {"platform": "${m.platform}", "contentType": "${m.contentType}", "title": "short punchy title", "caption": "the full ${m.platform}-native caption", "hashtags": ["tag"], "userIntent": "why this audience engages", "bestTime": "suggested posting window"}`
  )
  .join(",\n")}
  ]
}`;

    const res = await vertexProvider.generateJSONWithThoughts(
      [{ role: "user", content: prompt }],
      { modelName: MODELS.CONTENT_CREATOR, temperature: 0.7, signal },
      { onThought: (chunk) => thoughts.push(chunk) }
    );
    thoughts.flush();

    const data = res.data || {};
    const posts: FamilyCreative["posts"] = {};

    for (const m of family.members) {
      const raw =
        (Array.isArray(data.posts) ? data.posts : []).find(
          (p: any) =>
            (p?.platform || "").toString().toLowerCase().trim() === m.platform &&
            (p?.contentType || "").toString().toLowerCase().trim() === m.contentType
        ) ||
        // The model occasionally keys posts by platform only when a platform has a
        // single format in the family — accept that rather than losing the copy.
        (Array.isArray(data.posts) ? data.posts : []).find(
          (p: any) => (p?.platform || "").toString().toLowerCase().trim() === m.platform
        );

      posts[memberKey(m.platform, m.contentType)] = {
        title: (raw?.title || "").toString().trim(),
        caption: (raw?.caption || "").toString().trim(),
        hashtags: asStringArray(raw?.hashtags, limitsFor(m.platform).hashtagMax),
        userIntent: (raw?.userIntent || "").toString().trim() || undefined,
        bestTime: (raw?.bestTime || "").toString().trim() || undefined,
      };
    }

    return {
      coreIdea: (data.coreIdea || "").toString().trim(),
      hook: (data.hook || "").toString().trim(),
      hookVariations: asStringArray(data.hookVariations, 4),
      visualPrompts: asStringArray(data.visualPrompts, 10),
      slideTexts: (Array.isArray(data.slideTexts) ? data.slideTexts : []).map((s: any, idx: number) => ({
        step: idx + 1,
        title: (s?.title || "").toString().trim(),
        body: (s?.body || "").toString().trim(),
        theme: idx % 2 === 0 ? "gradient-purple" : "gradient-blue",
      })),
      videoStoryboard: (data.videoStoryboard || "").toString().trim() || undefined,
      posts,
    };
  };

  /**
   * Repairs a family creative BEFORE anything is rendered.
   *
   * Deck text is typeset into the pixels, so it must be correct before the render —
   * fixing slide copy afterwards would leave the caption saying one thing and the
   * image showing another. This is the revision that has to happen early; the CEO's
   * later pass only touches text that lives outside the image.
   */
  const repairFamilyCreative = async (
    family: FormatFamily,
    creative: FamilyCreative
  ): Promise<FamilyCreative> => {
    const problems: string[] = [];

    if (!creative.hook) problems.push("The shared hook is missing.");
    if (family.kind !== "text_only" && creative.visualPrompts.length === 0) {
      problems.push("visualPrompts is empty, so there is no art direction to render from.");
    }
    if (family.kind === "multi_image") {
      const usable = creative.slideTexts.filter((s) => s.title || s.body);
      if (usable.length < MIN_DECK_SLIDES) {
        problems.push(
          `Only ${usable.length} slide(s) have real text; a deck needs at least ${MIN_DECK_SLIDES} with a headline AND an insight.`
        );
      }
      if (creative.visualPrompts.length !== creative.slideTexts.length) {
        problems.push(
          `visualPrompts (${creative.visualPrompts.length}) and slideTexts (${creative.slideTexts.length}) must be the same length.`
        );
      }
    }

    for (const m of family.members) {
      const post = creative.posts[memberKey(m.platform, m.contentType)];
      const limits = limitsFor(m.platform);
      if (!post?.caption) {
        problems.push(`${m.platform}/${m.contentType} has no caption.`);
      } else if (post.caption.length > limits.captionMax) {
        problems.push(
          `${m.platform}/${m.contentType} caption is ${post.caption.length} chars; the limit is ${limits.captionMax}.`
        );
      }
    }

    if (problems.length === 0) return creative;

    emit({
      type: "agent_action",
      agentId: "content_creator",
      data: {
        label: `Repairing the ${family.label} draft before it is rendered (${problems.length} issue(s))`,
        detail: problems.join(" | "),
        scope: family.label,
      },
    });

    const thoughts = makeThoughts("content_creator", `${family.label} repair`, 5);
    try {
      const res = await vertexProvider.generateJSONWithThoughts(
        [
          {
            role: "user",
            content: `You wrote this campaign family and it failed validation. Fix ONLY the listed problems and return the complete corrected object in the same shape.

PROBLEMS
${problems.map((p) => `- ${p}`).join("\n")}

CURRENT DRAFT
${JSON.stringify({
  coreIdea: creative.coreIdea,
  hook: creative.hook,
  hookVariations: creative.hookVariations,
  visualPrompts: creative.visualPrompts,
  slideTexts: creative.slideTexts.map((s) => ({ title: s.title, body: s.body })),
  videoStoryboard: creative.videoStoryboard,
  posts: family.members.map((m) => ({
    platform: m.platform,
    contentType: m.contentType,
    ...creative.posts[memberKey(m.platform, m.contentType)],
  })),
})}

CONSTRAINTS
- Keep everything that was already correct, word for word.
- Caption limits: ${family.members.map((m) => `${m.platform} ${limitsFor(m.platform).captionMax}`).join(", ")}.
${family.kind === "multi_image" ? `- slideTexts and visualPrompts must both have the same length, at least ${MIN_DECK_SLIDES}, each slide with a headline and a 1-2 sentence insight.` : ""}
${bannedClause}

Return the same JSON shape with keys: coreIdea, hook, hookVariations, visualPrompts, slideTexts, ${family.kind === "video" ? "videoStoryboard, " : ""}posts (array with platform + contentType + title + caption + hashtags).`,
          },
        ],
        { modelName: MODELS.CONTENT_CREATOR, temperature: 0.4, signal },
        { onThought: (chunk) => thoughts.push(chunk) }
      );
      thoughts.flush();

      const data = res.data || {};
      const merged: FamilyCreative = {
        coreIdea: (data.coreIdea || "").toString().trim() || creative.coreIdea,
        hook: (data.hook || "").toString().trim() || creative.hook,
        hookVariations: asStringArray(data.hookVariations, 4).length
          ? asStringArray(data.hookVariations, 4)
          : creative.hookVariations,
        visualPrompts: asStringArray(data.visualPrompts, 10).length
          ? asStringArray(data.visualPrompts, 10)
          : creative.visualPrompts,
        slideTexts: Array.isArray(data.slideTexts) && data.slideTexts.length
          ? data.slideTexts.map((s: any, idx: number) => ({
              step: idx + 1,
              title: (s?.title || "").toString().trim(),
              body: (s?.body || "").toString().trim(),
              theme: idx % 2 === 0 ? "gradient-purple" : "gradient-blue",
            }))
          : creative.slideTexts,
        videoStoryboard:
          (data.videoStoryboard || "").toString().trim() || creative.videoStoryboard,
        posts: { ...creative.posts },
      };

      for (const raw of Array.isArray(data.posts) ? data.posts : []) {
        const plt = (raw?.platform || "").toString().toLowerCase().trim();
        const fmt = (raw?.contentType || "").toString().toLowerCase().trim();
        const key = memberKey(plt, fmt);
        if (!merged.posts[key]) continue;
        const limits = limitsFor(plt);
        merged.posts[key] = {
          title: (raw?.title || "").toString().trim() || merged.posts[key].title,
          caption: (raw?.caption || "").toString().trim() || merged.posts[key].caption,
          hashtags: asStringArray(raw?.hashtags, limits.hashtagMax).length
            ? asStringArray(raw?.hashtags, limits.hashtagMax)
            : merged.posts[key].hashtags,
          userIntent: (raw?.userIntent || "").toString().trim() || merged.posts[key].userIntent,
          bestTime: (raw?.bestTime || "").toString().trim() || merged.posts[key].bestTime,
        };
      }

      emit({
        type: "agent_action",
        agentId: "content_creator",
        data: { label: `${family.label} draft repaired`, scope: family.label },
      });
      return merged;
    } catch (repairErr: any) {
      if (repairErr?.isCancelled) throw repairErr;
      // A failed repair is not fatal: normalizeDeck below still guarantees a coherent
      // deck from whatever real copy exists. Say so instead of hiding it.
      console.warn(`[Content Creator] Repair pass failed for ${family.key}:`, repairErr?.message || repairErr);
      emit({
        type: "agent_action",
        agentId: "content_creator",
        data: {
          label: `${family.label} repair pass unavailable — continuing with the validated draft`,
          scope: family.label,
        },
      });
      return creative;
    }
  };

  /** Writes the family creative into every member's content item. */
  const applyCreative = (family: FormatFamily, creative: FamilyCreative) => {
    let deckPrompts = creative.visualPrompts;
    let overlay = creative.slideTexts;

    if (family.kind === "multi_image") {
      const firstMember = family.members[0];
      const firstPost = creative.posts[memberKey(firstMember.platform, firstMember.contentType)];
      const deck = normalizeDeck(creative.visualPrompts, creative.slideTexts, {
        hook: creative.hook,
        caption: firstPost?.caption || "",
        brandName: state.brandData.name,
        topic,
      });
      deckPrompts = deck.visualPrompts;
      overlay = deck.slideTexts;
      // Every member of this family now shares byte-identical deck text, which is what
      // lets a single render serve all of them.
      family.plannedSlides = overlay.length;
      for (const m of family.members) m.requiredAssets = overlay.length;
    }

    const singlePrompt =
      family.kind === "video" && creative.videoStoryboard
        ? `${deckPrompts[0] || ""}${deckPrompts[0] ? ". " : ""}Shot sequence: ${creative.videoStoryboard}`
        : deckPrompts[0] || "";

    for (const m of family.members) {
      const post = creative.posts[memberKey(m.platform, m.contentType)] || {
        title: "",
        caption: "",
        hashtags: [],
      };
      const caption = post.caption;
      const wordCount = caption.split(/\s+/).filter(Boolean).length;

      state.generatedContent!.platforms[m.platform] =
        state.generatedContent!.platforms[m.platform] || {};

      const existing = state.generatedContent!.platforms[m.platform][m.contentType] as any;

      state.generatedContent!.platforms[m.platform][m.contentType] = {
        // Preserve media already attached on a resume so a copy-only re-run does not
        // discard renders the user already paid for.
        ...(existing
          ? {
              imageUrl: existing.imageUrl,
              videoUrl: existing.videoUrl,
              slideUrls: existing.slideUrls,
            }
          : {}),
        platform: m.platform,
        contentType: m.contentType,
        title: post.title || `${state.brandData.name} — ${topic}`,
        caption,
        hashtags: post.hashtags,
        hook: creative.hook,
        hookVariations: creative.hookVariations,
        visualRequired: m.visualRequired,
        visualType: m.mediaType,
        visualPrompt: family.kind === "multi_image" ? deckPrompts.join(" | Slide Next: ") : singlePrompt,
        visualPrompts: family.kind === "multi_image" ? deckPrompts : singlePrompt ? [singlePrompt] : [],
        overlayText: family.kind === "multi_image" ? overlay : undefined,
        aspectRatio: m.aspectRatio,
        wordCount,
        readingTimeSeconds: Math.max(5, Math.ceil((wordCount / 200) * 60)),
        userIntent: post.userIntent,
        bestTime: post.bestTime,
        familyKey: family.key,
        coreIdea: creative.coreIdea,
      } as ContentOutputItem;

      emit({
        type: "agent_action",
        agentId: "content_creator",
        data: {
          label: `${m.platform.toUpperCase()} ${m.contentType}: ${caption.length} char caption, ${post.hashtags.length} hashtag(s)`,
          detail: creative.hook ? `Hook: "${creative.hook.slice(0, 70)}"` : undefined,
          scope: family.label,
        },
      });
    }
  };

  /** One render for the whole family, then attached to every member. */
  /**
   * Every asset row already recorded, as platform|format|slide|url. Members of a family
   * share ONE render, so the same url is legitimately attached to several platforms —
   * but the same url must never be attached to the same target twice. Without this, a
   * resumed run or a retried family would stack a second copy of every slide and the
   * studio would show the deck twice.
   */
  const attachedAssetKeys = new Set<string>();

  /**
   * Raised when a family is abandoned on purpose — the user pressed Skip, or the family
   * blew its deadline. Never fatal: the campaign carries on and the post ships without
   * its media for the user to finish in the content editor.
   */
  const skipError = (scope: string, reason: string) => {
    const err: any = new Error(reason);
    err.isSkipped = true;
    err.scope = scope;
    return err;
  };

  /** Families abandoned rather than failed, so the summary can tell the two apart. */
  const skippedFamilies: { label: string; reason: string }[] = [];

  const renderFamilyMedia = async (
    family: FormatFamily,
    familyIndex: number,
    familyTotal: number,
    /**
     * The CEO's recovery pass re-renders a family the visualizer could not finish. It is
     * the same render, so it reuses this function — only the agent the console attributes
     * it to, and the wording, differ.
     */
    options?: { agentId?: "visualizer" | "ceo_auditor"; positionLabel?: string }
  ) => {
    checkProductionRunnable();

    const agentId = options?.agentId ?? "visualizer";
    const primary = family.members[0];
    const item = state.generatedContent!.platforms[primary.platform][primary.contentType] as any;
    const shared = family.members.length > 1;
    // Families render strictly one at a time, so a running position ("Format 2/3") makes
    // the sequential flow legible in the thinking panel: each family announces itself,
    // renders, then reports complete before the next one starts.
    const position = options?.positionLabel ?? `Format ${familyIndex + 1}/${familyTotal}`;

    // One controller per family, chained to the run's. Aborting it abandons THIS family
    // only; aborting the run's still cancels everything. That distinction is the whole
    // reason Skip can exist alongside Cancel.
    const familyAbort = new AbortController();
    const abandon = () => familyAbort.abort();
    const onRunAbort = () => familyAbort.abort();
    signal?.addEventListener("abort", onRunAbort, { once: true });
    controls?.bindScope(family.label, abandon);
    let deadlineHit = false;
    const deadline = setTimeout(() => {
      deadlineHit = true;
      abandon();
    }, familyDeadlineMs);

    const releaseScope = () => {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", onRunAbort);
      controls?.releaseScope(family.label);
    };

    /**
     * Turns an aborted render into the right kind of failure. Order matters: a run-level
     * cancel must win, or pressing Cancel would look like a skip and the campaign would
     * carry on after the user asked it to stop.
     */
    const classifyAbort = (err: any) => {
      if (signal?.aborted) {
        const cancelled: any = new Error("Workflow cancelled by user");
        cancelled.isCancelled = true;
        return cancelled;
      }
      if (deadlineHit) {
        return skipError(
          family.label,
          `no media after ${Math.round(familyDeadlineMs / 60000)} min — skipped automatically so the rest of the campaign could finish`
        );
      }
      if (controls?.isSkipRequested(family.label) || familyAbort.signal.aborted) {
        return skipError(family.label, "skipped by you");
      }
      return err;
    };

    if (controls?.isSkipRequested(family.label)) {
      releaseScope();
      throw skipError(family.label, "skipped by you");
    }

    emit({
      type: "agent_action",
      agentId,
      data: {
        label:
          `${position} — ` +
          (shared
            ? `now rendering ${family.label} for ${describeMembers(family)} (one render covers all ${family.members.length}, no duplicate)`
            : `now rendering ${family.label} for ${primary.platform} ${primary.contentType}`),
        scope: family.label,
      },
    });

    try {
      return await renderFamilyBody(family, familyIndex, {
        agentId,
        position,
        item,
        primary,
        shared,
        familySignal: familyAbort.signal,
      });
    } catch (err: any) {
      throw classifyAbort(err);
    } finally {
      releaseScope();
    }
  };

  /**
   * The render itself. Split out from `renderFamilyMedia` so the skip/deadline wiring
   * above stays readable and applies identically to the CEO's recovery pass.
   */
  const renderFamilyBody = async (
    family: FormatFamily,
    familyIndex: number,
    ctx: {
      agentId: "visualizer" | "ceo_auditor";
      position: string;
      item: any;
      primary: FamilyMember;
      shared: boolean;
      familySignal: AbortSignal;
    }
  ) => {
    const { agentId, position, item, primary, shared, familySignal } = ctx;

    const assets = await generateMediaAsset({
      platform: primary.platform,
      contentType: primary.contentType,
      mediaType: family.kind === "multi_image" ? "multi_image" : (family.kind as "image" | "video"),
      prompt: item.visualPrompt,
      visualPrompts: item.visualPrompts,
      // The render uses the family's shared ratio; each member keeps its own native
      // ratio on the content item for the editor.
      aspectRatio: family.renderAspectRatio,
      caption: item.caption,
      topic,
      slideTexts: item.overlayText,
      slideCount: family.kind === "multi_image" ? (item.overlayText || []).length : 1,
      totalSlides: family.kind === "multi_image" ? (item.overlayText || []).length : 1,
      brandName: state.brandData?.name,
      brandColors: state.brandData?.primaryColors,
      industry: state.brandData?.industry,
      // The family's signal, not the run's: a skip must cut this render and only this
      // render, so the very next family still gets a live request.
      signal: familySignal,
      onProgress: (msg) =>
        emit({ type: "agent_action", agentId, data: { label: msg, scope: family.label } }),
    });

    if (assets.length === 0) {
      throw new Error(`No media was produced for the ${family.label} family.`);
    }

    for (const m of family.members) {
      checkCancelled();
      const retagged = assets.map((a) => retagAssetForMember(a, m));

      const target = state.generatedContent!.platforms[m.platform]?.[m.contentType] as any;
      if (target) {
        if (retagged[0].type === "video") {
          target.videoUrl = retagged[0].url;
        } else {
          target.imageUrl = retagged[0].url;
          if (retagged.length > 1) target.slideUrls = retagged.map((a) => a.url);
        }
      }
      state.generatedAssets!.push(...dedupeAttachments(retagged, attachedAssetKeys));

      emit({
        type: "agent_action",
        agentId,
        data: {
          label: `${m.platform.toUpperCase()} ${m.contentType} media attached${shared ? " (shared render — no extra generation)" : ""}`,
          scope: family.label,
        },
      });
    }

    const doneLabel =
      `${position} complete — ` +
      (shared
        ? `${family.label} rendered once for ${family.members.length} formats`
        : `${family.label} rendered for ${primary.platform} ${primary.contentType}`);

    // Only the visualizer owns the render progress bar. The CEO's recovery pass reports
    // through its own progress, so it must not push the visualizer past 100%.
    if (agentId === "visualizer") markRenderDone(doneLabel);
    else emit({ type: "agent_action", agentId, data: { label: doneLabel, scope: family.label } });
    completeScope(agentId, family.label);
  };

  /**
   * Turns one stage's settled outcomes into the reporting the single pipelined pass
   * used to do inline: a cancellation wins outright, a silent halt (raised only because
   * a sibling family had already failed) is never reported as the cause, and the real
   * failure carries the family that caused it so the console reds out that unit of work
   * instead of every line the agent had open.
   */
  const reportStageFailure = (
    outcomes: PromiseSettledResult<unknown>[],
    stageAgentId: "content_creator" | "visualizer"
  ) => {
    const failures = outcomes
      .filter((o): o is PromiseRejectedResult => o.status === "rejected")
      .map((o) => o.reason);

    const cancellation = failures.find((f) => f?.isCancelled);
    if (cancellation) throw cancellation;

    const realFailure = failures.find((f) => !f?.isSilentHalt);
    if (!realFailure) return;

    const agentId = realFailure.agentId === "content_creator" ? "content_creator" : stageAgentId;
    const errorCode =
      realFailure.code ||
      (agentId === "visualizer" ? "VISUALIZER_PROVIDER_ERROR" : "CONTENT_GENERATION_FAILED");
    const message = realFailure.message || "Production failed";

    state.errors?.push(`[${errorCode}] ${message}`);
    console.error(`[${agentId}] Production failure:`, realFailure);

    emit({
      type: "agent_error",
      agentId,
      data: {
        agent: agentId,
        status: "failed",
        errorCode,
        message,
        // The failing family, so the console reds out that unit of work only.
        scope: realFailure.scope,
        provider: "google_vertex",
        model: agentId === "visualizer" ? MODELS.VISUALIZER : MODELS.CONTENT_CREATOR,
        retryable: true,
      },
    });
    throw realFailure;
  };

  const copyOutcomes = await Promise.allSettled(
    families.map(async (family, index) => {
      try {
        if (contentRestored) {
          // Resuming into the visualizer: the copy already exists, so only the render
          // is repeated. Members still share one asset.
          const primary = family.members[0];
          if (!state.generatedContent?.platforms?.[primary.platform]?.[primary.contentType]) {
            throw Object.assign(
              new Error(`Restored campaign is missing ${primary.platform} ${primary.contentType}.`),
              { agentId: "content_creator" }
            );
          }
          markCopyDone(family);
          completeScope("content_creator", family.label);
        } else {
          let creative: FamilyCreative;
          try {
            creative = await copyLimiter(() => writeFamilyCopy(family, index));
            creative = await repairFamilyCreative(family, creative);
          } catch (copyErr: any) {
            if (!copyErr?.isSilentHalt && !copyErr?.isCancelled) copyErr.agentId = "content_creator";
            throw copyErr;
          }
          applyCreative(family, creative);
          markCopyDone(family);
          completeScope("content_creator", family.label);
        }
      } catch (err: any) {
        if (!err?.isSilentHalt) productionHalted = true;
        // Record WHICH family failed. Without it the console marked every in-flight line
        // of that agent as failed, so a family that had already rendered successfully was
        // shown with a red cross next to its finished step.
        if (!err?.scope) err.scope = family.label;
        throw err;
      }
    })
  );

  reportStageFailure(copyOutcomes, "content_creator");

  if (!contentCompleted) {
    contentCompleted = true;
    emit({ type: "output_ready", agentId: "content_creator", data: state.generatedContent });
    emit({ type: "agent_completed", agentId: "content_creator" });
  }
  completePhase("copy");

  // =========================================================================
  // PHASE 3b — VISUALIZER: one format family's media at a time
  //
  // This is the stage multi-format campaigns used to die in. ONE platform with ONE
  // format worked because there was a single render to make. Ask for several formats
  // and the renders raced each other into the image model's per-minute window; the
  // first 429 failed its family, that failure set `productionHalted`, and the halt
  // cancelled every sibling and threw the whole campaign away. Multi-format was not
  // "slower" — it was structurally unable to finish.
  //
  // Two things change that:
  //   1. Families render one at a time (`mediaConcurrency` defaults to 1) and every
  //      request is paced against ONE shared per-minute window per model (the rate
  //      pacer in mediaGenerator), so they queue politely instead of manufacturing the
  //      429 they then have to absorb.
  //   2. A render failure is LOCAL to its family. That family publishes as text-only
  //      and every other family keeps its media, because a missing image is a degraded
  //      post, not a dead campaign.
  //
  // Families are also why nothing is rendered twice: `computeFormatFamilies` maps each
  // (platform, format) target to exactly one family, and one render is retagged for
  // every member of it — so a 9:16 video covers the Reel, the TikTok and the Short
  // from a single generation, and the members stay in sync by construction.
  // =========================================================================
  checkCancelled();
  // Media renders one family at a time (mediaConcurrency defaults to 1), so this phase
  // is genuinely sequential — no PARALLEL badge. The old "parallel" label was left over
  // from when families fanned out at once; that tripped the image model's per-minute
  // quota, which is exactly why rendering was made one-at-a-time.
  startPhase("render", "Media production", ["visualizer"], "sequential");
  emit({ type: "agent_started", agentId: "visualizer" });
  emit({
    type: "agent_action",
    agentId: "visualizer",
    data: {
      label: mediaRestored
        ? `Keeping the ${state.generatedAssets?.length || 0} asset(s) already rendered — this retry starts at the review, so nothing is generated twice`
        : visualFamilies.length === 0
          ? "No media required — every requested format publishes as text only"
          : `${visualFamilies.length} shared render(s) will cover ${visualTargets} post(s)` +
            (visualTargets > visualFamilies.length
              ? ` — ${visualTargets - visualFamilies.length} duplicate generation(s) avoided`
              : "") +
            (Math.min(mediaConcurrency, visualFamilies.length) <= 1
              ? `, one at a time (paced to the image quota)`
              : `, up to ${Math.min(mediaConcurrency, visualFamilies.length)} at a time`),
      detail: visualFamilies.map((f) => `${f.label} → ${describeMembers(f)}`).join(" • "),
    },
  });

  // Text-only families are closed out up front rather than inside the fan-out: there
  // is nothing to render, nothing to wait for and nothing that can fail.
  for (const family of families.filter((f) => !f.visualRequired)) {
    emit({
      type: "agent_action",
      agentId: "visualizer",
      data: {
        label: `Skipped ${describeMembers(family)} — text-only format, no media to generate`,
        scope: family.label,
      },
    });
    completeScope("visualizer", family.label);
  }

  /** Families whose render failed, so the summary can name the posts going out bare. */
  const renderFailures: { label: string; message: string }[] = [];

  if (mediaRestored) {
    // Nothing to render: this run resumed at the audit with the previous attempt's media
    // in hand. Each family still gets a line, because "kept" and "still missing" are the
    // two facts the user needs before the CEO decides what to re-render.
    for (const family of visualFamilies) {
      const hasMedia = family.members.some((m) => {
        const target = state.generatedContent?.platforms?.[m.platform]?.[m.contentType] as any;
        return Boolean(target?.imageUrl || target?.videoUrl || target?.slideUrls?.length);
      });
      emit({
        type: "agent_action",
        agentId: "visualizer",
        data: {
          label: hasMedia
            ? `${describeMembers(family)} — media kept from the previous attempt, not re-rendered`
            : `${describeMembers(family)} — still has no media; the CEO will try it during review`,
          scope: family.label,
          ...(hasMedia ? {} : { severity: "warning" as const }),
        },
      });
      completeScope("visualizer", family.label);
    }
  } else {
    const renderOutcomes = await Promise.allSettled(
      visualFamilies.map((family, familyIndex) =>
        mediaLimiter(() => renderFamilyMedia(family, familyIndex, visualFamilies.length)).catch((mediaErr: any) => {
          if (mediaErr?.isCancelled) throw mediaErr;

          // A skip is a decision, not a fault. It gets its own wording and stays out of
          // `renderFailures`, so the run is never reported as broken because the user chose
          // to move on — and the CEO's recovery pass will not fight that choice by
          // re-rendering what was deliberately abandoned.
          if (mediaErr?.isSkipped) {
            const reason = mediaErr?.message || "skipped";
            skippedFamilies.push({ label: family.label, reason });
            emit({
              type: "agent_action",
              agentId: "visualizer",
              data: {
                label: `${describeMembers(family)} — ${reason}. Moving on to the next format; add this media later in the content editor.`,
                scope: family.label,
                severity: "warning",
              },
            });
            completeScope("visualizer", family.label);
            return;
          }

          // Deliberately not re-thrown, and deliberately NOT setting productionHalted:
          // one family hitting a quota wall must not take its siblings — or the copy
          // that is already written — down with it.
          const message = mediaErr?.message || "Media generation failed";
          renderFailures.push({ label: family.label, message });
          state.errors?.push(`[VISUALIZER_PROVIDER_ERROR] ${family.label}: ${message}`);
          console.error(`[visualizer] ${family.label} render failed:`, mediaErr);
          emit({
            type: "agent_action",
            agentId: "visualizer",
            data: {
              label: `${describeMembers(family)} will publish without media — ${message}`,
              scope: family.label,
              severity: "warning",
            },
          });
          completeScope("visualizer", family.label);
        })
      )
    );

    // Only a cancellation can still end the run here; every render failure was absorbed.
    reportStageFailure(renderOutcomes, "visualizer");
  }

  const skippedCount = skippedFamilies.length;
  const renderedFamilies = visualFamilies.length - renderFailures.length - skippedCount;
  // "Nothing rendered" must not include what the user chose to skip: a run where every
  // family was skipped on purpose did exactly what it was told, and reporting the agent
  // as failed for obeying would be wrong.
  const allRendersFailed =
    visualFamilies.length > 0 && renderedFamilies === 0 && renderFailures.length > 0;

  emit({ type: "output_ready", agentId: "visualizer", data: { generatedAssets: state.generatedAssets } });
  emitProgress(
    "visualizer",
    100,
    "completed",
    mediaRestored
      ? `${state.generatedAssets?.length || 0} asset(s) kept from the previous attempt`
      : renderFailures.length === 0 && skippedCount === 0
      ? "Media generation complete"
      : `${renderedFamilies}/${visualFamilies.length} format(s) rendered` +
        (renderFailures.length ? ` — ${renderFailures.length} failed` : "") +
        (skippedCount ? ` — ${skippedCount} skipped` : ""),
    "completed"
  );

  if (allRendersFailed) {
    // Nothing rendered at all. The copy is still worth delivering, so the campaign goes
    // on to the audit — but the visualizer is reported as failed, because it did fail.
    emit({
      type: "agent_error",
      agentId: "visualizer",
      data: {
        agent: "visualizer",
        status: "failed",
        errorCode: "VISUALIZER_PROVIDER_ERROR",
        message: `No media could be produced for any of the ${visualFamilies.length} visual format(s). ${renderFailures[0].message}`,
        provider: "google_vertex",
        model: MODELS.VISUALIZER,
        retryable: true,
      },
    });
  } else {
    emit({ type: "agent_completed", agentId: "visualizer" });
  }
  completePhase("render");

  // =========================================================================
  // PHASE 4 — CEO AUDITOR: verify → judge → revise → re-verify
  // =========================================================================
  checkCancelled();
  startPhase("audit", "CEO audit", ["ceo_auditor"], "sequential");
  emit({ type: "agent_started", agentId: "ceo_auditor" });

  const runChecks = (): QualityReport =>
    runDeterministicChecks({
      content: state.generatedContent,
      families,
      forbiddenWords: brandForbidden,
    });

  emitProgress("ceo_auditor", 10, "verifying", "Verifying assets, platform limits and brand rules");
  let report = runChecks();

  /** The issues that belong to one family, so the review can be reported per family. */
  const issuesForFamily = (family: FormatFamily, rep: QualityReport) =>
    rep.issues.filter((i) =>
      family.members.some((m) => m.platform === i.platform && m.contentType === i.contentType)
    );

  const isMissingMediaIssue = (i: QualityIssue) =>
    i.severity === "blocker" &&
    (i.code === "IMAGE_ASSET_MISSING" ||
      i.code === "VIDEO_ASSET_MISSING" ||
      i.code === "DECK_ASSET_MISSING" ||
      i.code === "DECK_TOO_SHORT");

  /** Which family a bare (platform, format) belongs to, for naming a gap. */
  const familyOfMissing = (platform: string, contentType: string) =>
    families.find((f) =>
      f.members.some((m) => m.platform === platform && m.contentType === contentType)
    );

  /** Posts that will ship without media. Recorded, reported, never fatal. */
  const mediaGaps: NonNullable<CampaignState["auditResult"]>["mediaGaps"] = [];
  const skippedLabels = new Set(skippedFamilies.map((s) => s.label));

  // How many families the CEO may re-render before giving up and handing the rest to the
  // user. Unbounded recovery would let one dead quota stretch the audit by many minutes
  // for renders that are all going to fail the same way.
  const recoveryBudget = envInt("CAMPAIGN_CEO_MEDIA_RECOVERY_MAX", 2, { min: 0, max: 10 });
  let recoveriesLeft = process.env.CAMPAIGN_CEO_MEDIA_RECOVERY === "0" ? 0 : recoveryBudget;

  // ── Family-by-family review ──────────────────────────────────────────────────
  // The CEO walks the campaign the same way the visualizer rendered it: one format
  // family at a time, saying which family it is on and what it found there. Where media
  // is missing this is also where the CEO tries to produce it, so the review and the fix
  // land on the same family instead of the console reporting a gap nothing acts on.
  emitProgress("ceo_auditor", 20, "verifying", "Reviewing each format family in turn");

  for (const [familyIndex, family] of families.entries()) {
    checkCancelled();
    const mine = issuesForFamily(family, report);
    const missingMedia = mine.some(isMissingMediaIssue);
    const position = `Review ${familyIndex + 1}/${families.length}`;

    emit({
      type: "agent_action",
      agentId: "ceo_auditor",
      data: {
        label:
          `${position} — ${describeMembers(family)}: copy + ` +
          (!family.visualRequired
            ? "no media required (text-only format)"
            : missingMedia
              ? "MEDIA MISSING"
              : "media present") +
          ` — ${mine.length === 0 ? "no issues" : `${mine.length} issue(s) found`}`,
        detail: mine.slice(0, 4).map((i) => `${i.code}: ${i.message}`).join(" | ") || undefined,
        scope: family.label,
        severity: missingMedia ? "warning" : undefined,
      },
    });

    if (missingMedia) {
      if (skippedLabels.has(family.label)) {
        // The user chose to abandon this one. Re-rendering it here would override that
        // decision and re-impose the wait they just skipped out of.
        emit({
          type: "agent_action",
          agentId: "ceo_auditor",
          data: {
            label: `${describeMembers(family)} — you skipped this format, so the CEO is leaving it for you to finish in the content editor`,
            scope: family.label,
            severity: "warning",
          },
        });
      } else if (recoveriesLeft > 0) {
        recoveriesLeft -= 1;
        emit({
          type: "agent_action",
          agentId: "ceo_auditor",
          data: {
            label: `${describeMembers(family)} has no media — the CEO is generating it now (recovery attempt)`,
            scope: family.label,
          },
        });
        try {
          await mediaLimiter(() =>
            renderFamilyMedia(family, familyIndex, families.length, {
              agentId: "ceo_auditor",
              positionLabel: `${position} recovery`,
            })
          );
          report = runChecks();
        } catch (recoverErr: any) {
          if (recoverErr?.isCancelled) throw recoverErr;
          const reason = recoverErr?.isSkipped
            ? recoverErr.message || "skipped"
            : recoverErr?.message || "media generation failed again";
          emit({
            type: "agent_action",
            agentId: "ceo_auditor",
            data: {
              label: `${describeMembers(family)} — CEO recovery could not produce media (${reason}). Shipping the copy; add the media in the content editor.`,
              scope: family.label,
              severity: "warning",
            },
          });
        }
      } else {
        emit({
          type: "agent_action",
          agentId: "ceo_auditor",
          data: {
            label: `${describeMembers(family)} — recovery budget spent, shipping without media. Add it in the content editor.`,
            scope: family.label,
            severity: "warning",
          },
        });
      }
    }

    completeScope("ceo_auditor", family.label);
  }

  // Re-verified after every recovery attempt, so the verdict below judges what the
  // campaign actually holds now rather than what it held before the CEO stepped in.
  report = runChecks();

  emit({
    type: "agent_action",
    agentId: "ceo_auditor",
    data: {
      label: `Structural verification: ${summarizeReport(report)}`,
      detail: report.issues.slice(0, 6).map((i) => `${i.code}: ${i.message}`).join(" | ") || undefined,
    },
  });

  // ── Missing media is a gap, not a dead campaign ───────────────────────────────
  // This used to throw, which meant one unrendered image destroyed the whole run —
  // every caption, every hook, every family that DID render, gone, with nothing to show
  // for 20 minutes of work. A post without its image is a post the user can finish in
  // the content editor in seconds, so the gap is recorded and the campaign ships.
  for (const issue of report.blockers.filter(isMissingMediaIssue)) {
    const family = issue.platform && issue.contentType
      ? familyOfMissing(issue.platform, issue.contentType)
      : undefined;
    mediaGaps.push({
      platform: issue.platform || "unknown",
      contentType: issue.contentType || "unknown",
      format: family?.label || "media",
      reason: skippedLabels.has(family?.label || "") ? "skipped by you" : issue.message,
    });
  }

  // Only a campaign with nothing publishable at all is still fatal: if not one post was
  // produced there is genuinely nothing to hand back.
  const fatalBlockers = report.blockers.filter((i) => !isMissingMediaIssue(i));
  const publishablePosts = Object.values(state.generatedContent?.platforms || {}).reduce(
    (acc, formats) => acc + Object.keys(formats || {}).length,
    0
  );

  if (publishablePosts === 0 || fatalBlockers.length > 0) {
    state.auditResult = {
      passed: false,
      score: report.score,
      notes: `CEO audit failed verification: ${summarizeReport(report)}`,
      issues: (fatalBlockers.length ? fatalBlockers : report.blockers).map(
        (i) => `${i.code}: ${i.message}`
      ),
      mediaGaps,
    };
    emit({ type: "output_ready", agentId: "ceo_auditor", data: state.auditResult });
    emit({
      type: "agent_error",
      agentId: "ceo_auditor",
      data: { message: `CEO Audit FAILED: ${state.auditResult.issues.join(" | ")}` },
    });
    throw new Error(`Campaign CEO Audit Failed: ${state.auditResult.issues.join("; ")}`);
  }

  if (mediaGaps.length > 0) {
    emit({
      type: "agent_action",
      agentId: "ceo_auditor",
      data: {
        label: `${mediaGaps.length} post(s) will publish without media — everything else is complete and ready`,
        detail: mediaGaps.map((g) => `${g.platform}/${g.contentType} (${g.format}): ${g.reason}`).join(" | "),
        severity: "warning",
      },
    });
  }

  // ── Subjective review (the part that genuinely needs a model) ─────────────────
  // Base64 media never goes to the LLM: it would add megabytes per request and the
  // model cannot judge pixels from a data URI anyway.
  const sanitizedContentForAudit: any = {};
  for (const [plt, formats] of Object.entries(state.generatedContent?.platforms || {})) {
    sanitizedContentForAudit[plt] = {};
    for (const [fmt, item] of Object.entries(formats as Record<string, any>)) {
      const { imageUrl, videoUrl, slideUrls, visualPrompt, visualPrompts, ...safe } = item as any;
      sanitizedContentForAudit[plt][fmt] = {
        ...safe,
        hasImage: Boolean(imageUrl),
        hasVideo: Boolean(videoUrl),
        slideCount: Array.isArray(slideUrls) ? slideUrls.length : 0,
      };
    }
  }

  emitProgress("ceo_auditor", 45, "judging", "Judging hook strength, voice and human tone");

  const judgementThoughts = makeThoughts("ceo_auditor", "quality judgement", 10);
  let llmIssues: QualityIssue[] = [];
  let llmScore: number | null = null;
  let llmNotes = "";
  let judgementUnavailable = false;

  const auditPrompt = `You are the CEO of ${state.brandData.name} reviewing this campaign before it ships. Be ruthless and specific.

CAMPAIGN (media stripped; presence flags kept)
${JSON.stringify({ platforms: sanitizedContentForAudit })}

BRAND
- Tone: ${state.brandData.tone}
- Writing style: ${state.brandData.writingStyle}
- Audience: ${state.brandData.targetAudience}
- Campaign topic: "${topic}"
${brandForbidden.length ? `- Forbidden words: ${brandForbidden.join(", ")}` : ""}

STRUCTURAL CHECKS ALREADY PASSED IN CODE (do not re-report these)
- Required media is present and of the right kind for every post.
- Caption lengths and hashtag counts are inside every platform's limits.
- Brand-forbidden words and known AI clichés were scanned for automatically.
${report.fixable.length ? `Already detected automatically: ${report.fixable.map((i) => i.code).join(", ")}.` : ""}

JUDGE ONLY WHAT CODE CANNOT
1. Does the hook actually stop a scroll, or is it a statement dressed as a hook?
2. Does this read like a human expert wrote it, or like generated marketing copy?
3. Is the claim specific and credible, or vague?
4. Does the caption match the brand's tone and the platform's culture?
5. Do the posts in one family tell one coherent story?

For every issue, name the exact post and field and give the instruction needed to fix it. Do not invent issues to look thorough — an empty list is a valid verdict.

Return strictly JSON:
{
  "score": 0-100,
  "notes": "two sentences on the campaign's real strength and weakness",
  "issues": [
    { "platform": "instagram", "contentType": "reel", "field": "caption | hook | title | hashtags", "severity": "major | minor", "message": "what is wrong", "fixHint": "the specific rewrite instruction" }
  ]
}`;

  // The audit's patience is a deployment fact (model tier, region), not a pipeline
  // constant. The handle is cleared either way so a fast audit doesn't leave a timer
  // holding the request open for the whole ceiling.
  const auditTimeoutMs = envInt("CAMPAIGN_AUDIT_TIMEOUT_MS", 45000, { min: 10000, max: 240000 });

  try {
    let auditTimeout: ReturnType<typeof setTimeout> | undefined;
    const judged = await Promise.race([
      vertexProvider.generateJSONWithThoughts(
        [{ role: "user", content: auditPrompt }],
        { modelName: MODELS.CEO_SUPERVISOR, temperature: 0.1, signal },
        { onThought: (chunk) => judgementThoughts.push(chunk) }
      ),
      new Promise<never>((_, reject) => {
        auditTimeout = setTimeout(
          () => reject(new Error(`CEO judgement timed out after ${Math.round(auditTimeoutMs / 1000)}s`)),
          auditTimeoutMs
        );
      }),
    ]).finally(() => {
      if (auditTimeout) clearTimeout(auditTimeout);
    });
    judgementThoughts.flush();

    const data = judged.data || {};
    llmScore = typeof data.score === "number" ? Math.max(0, Math.min(100, data.score)) : null;
    llmNotes = (data.notes || "").toString().trim();
    llmIssues = (Array.isArray(data.issues) ? data.issues : [])
      .map((i: any) => ({
        code: "CEO_JUDGEMENT",
        severity: (i?.severity === "major" ? "major" : "minor") as QualityIssue["severity"],
        field: (["caption", "hook", "title", "hashtags"].includes(i?.field) ? i.field : "caption") as QualityIssue["field"],
        platform: (i?.platform || "").toString().toLowerCase().trim() || undefined,
        contentType: (i?.contentType || "").toString().toLowerCase().trim() || undefined,
        message: (i?.message || "").toString().trim(),
        fixHint: (i?.fixHint || "").toString().trim() || undefined,
      }))
      .filter((i: QualityIssue) => i.message && i.platform && i.contentType);

    emit({
      type: "agent_action",
      agentId: "ceo_auditor",
      data: {
        label: `Quality judgement: ${llmScore ?? "n/a"}/100, ${llmIssues.length} issue(s) raised`,
        detail: llmNotes || undefined,
      },
    });
  } catch (err: any) {
    if (err?.isCancelled) throw err;
    judgementThoughts.flush();
    judgementUnavailable = true;
    console.warn("[CEO Auditor] Subjective judgement unavailable:", err?.message || err);
    // Previously this path fabricated `{passed: true, score: 95}`. The verdict now
    // stands on the deterministic checks alone and says the judgement is missing.
    emit({
      type: "agent_action",
      agentId: "ceo_auditor",
      data: {
        label: "Subjective quality review unavailable — verdict based on verified checks only",
        detail: err?.message || String(err),
      },
    });
  }

  // ── Revision rounds ──────────────────────────────────────────────────────────
  // Only fields that live OUTSIDE the rendered pixels are revised here: caption,
  // title, hook, hashtags. Slide text was already validated and repaired before the
  // deck was rendered, so a late rewrite can never desync the image from the copy.
  const REVISABLE_FIELDS: QualityIssue["field"][] = ["caption", "title", "hook", "hashtags"];
  const maxRounds = Math.max(1, envConcurrency("CAMPAIGN_MAX_REVISION_ROUNDS", 2));
  let revisionRounds = 0;

  const familyOfMember = new Map<string, FormatFamily>();
  for (const family of families) {
    for (const m of family.members) familyOfMember.set(memberKey(m.platform, m.contentType), family);
  }

  let pending = [...report.fixable, ...llmIssues].filter((i) =>
    REVISABLE_FIELDS.includes(i.field) && i.platform && i.contentType
  );

  while (pending.length > 0 && revisionRounds < maxRounds) {
    checkCancelled();
    revisionRounds += 1;
    const grouped = groupIssuesByPost(pending);

    emit({
      type: "agent_action",
      agentId: "ceo_auditor",
      data: {
        label: `Revision round ${revisionRounds}/${maxRounds}: rewriting ${grouped.length} post(s)`,
        detail: grouped.map((g) => `${g.platform}/${g.contentType} → ${g.fields.join(", ")}`).join(" | "),
      },
    });
    emitProgress("ceo_auditor", 55 + revisionRounds * 10, "revising", `Revision round ${revisionRounds}`);

    const targets = grouped
      .map((g) => {
        const item = state.generatedContent?.platforms?.[g.platform]?.[g.contentType] as any;
        if (!item) return null;
        const limits = limitsFor(g.platform);
        return {
          platform: g.platform,
          contentType: g.contentType,
          fieldsToFix: g.fields.filter((f) => REVISABLE_FIELDS.includes(f)),
          captionMax: limits.captionMax,
          hashtagMax: limits.hashtagMax,
          current: {
            title: item.title,
            hook: item.hook,
            caption: item.caption,
            hashtags: item.hashtags,
          },
          problems: g.issues.map((i) => ({ message: i.message, fix: i.fixHint })),
        };
      })
      .filter(Boolean);

    const revisionThoughts = makeThoughts("ceo_auditor", `revision ${revisionRounds}`, 6);

    try {
      const revised = await vertexProvider.generateJSONWithThoughts(
        [
          {
            role: "user",
            content: `You are the CEO fixing this campaign yourself. Rewrite ONLY the listed fields of the listed posts so that every stated problem is genuinely resolved.

POSTS TO FIX
${JSON.stringify(targets, null, 2)}

BRAND VOICE
- Tone: ${state.brandData.tone}
- Writing style: ${state.brandData.writingStyle}
- Audience: ${state.brandData.targetAudience}

RULES
- Fix the actual problem. Do not merely reword around it.
- Respect each post's captionMax and hashtagMax exactly.
- Keep the post's meaning, offer and CTA. Do not change the subject.
- Do not touch any field that is not in that post's fieldsToFix.
${bannedClause}

Return strictly JSON:
{"posts": [{"platform": "", "contentType": "", "title": "", "hook": "", "caption": "", "hashtags": []}]}
Include a field only if you rewrote it.`,
          },
        ],
        { modelName: MODELS.CONTENT_CREATOR, temperature: 0.35, signal },
        { onThought: (chunk) => revisionThoughts.push(chunk) }
      );
      revisionThoughts.flush();

      let applied = 0;
      for (const raw of Array.isArray(revised.data?.posts) ? revised.data.posts : []) {
        const plt = (raw?.platform || "").toString().toLowerCase().trim();
        const fmt = (raw?.contentType || "").toString().toLowerCase().trim();
        const item = state.generatedContent?.platforms?.[plt]?.[fmt] as any;
        if (!item) continue;

        const limits = limitsFor(plt);
        const newCaption = (raw?.caption || "").toString().trim();
        const newTitle = (raw?.title || "").toString().trim();
        const newHook = (raw?.hook || "").toString().trim();
        const newTags = asStringArray(raw?.hashtags, limits.hashtagMax);

        if (newCaption && newCaption.length <= limits.captionMax) {
          item.caption = newCaption;
          item.wordCount = newCaption.split(/\s+/).filter(Boolean).length;
          item.readingTimeSeconds = Math.max(5, Math.ceil((item.wordCount / 200) * 60));
          applied += 1;
        }
        if (newTitle) {
          item.title = newTitle;
          applied += 1;
        }
        if (newTags.length) {
          item.hashtags = newTags;
          applied += 1;
        }
        if (newHook) {
          // The hook is a family-level property: applying it to one member only would
          // split a family that is supposed to share one creative.
          const family = familyOfMember.get(memberKey(plt, fmt));
          for (const m of family?.members || [{ platform: plt, contentType: fmt } as any]) {
            const sibling = state.generatedContent?.platforms?.[m.platform]?.[m.contentType] as any;
            if (sibling) sibling.hook = newHook;
          }
          applied += 1;
        }
      }

      emit({
        type: "agent_action",
        agentId: "ceo_auditor",
        data: { label: `Applied ${applied} field revision(s); re-verifying` },
      });
    } catch (err: any) {
      if (err?.isCancelled) throw err;
      revisionThoughts.flush();
      console.warn(`[CEO Auditor] Revision round ${revisionRounds} failed:`, err?.message || err);
      emit({
        type: "agent_action",
        agentId: "ceo_auditor",
        data: { label: `Revision round ${revisionRounds} could not complete: ${err?.message || err}` },
      });
      break;
    }

    // Re-verify against the same deterministic rules. A revision only counts if the
    // checks that failed actually pass now.
    const before = report.issues.length;
    report = runChecks();
    const remaining = report.fixable.filter((i) => REVISABLE_FIELDS.includes(i.field));

    emit({
      type: "agent_action",
      agentId: "ceo_auditor",
      data: {
        label: `Re-verification after round ${revisionRounds}: ${before} → ${report.issues.length} issue(s)`,
        detail: summarizeReport(report),
      },
    });

    // A structural regression means rewriting made things worse — stop. Media gaps do not
    // count: they were already there, they are reported separately, and treating them as a
    // regression would abandon revision after the first round on every gapped campaign.
    if (report.blockers.some((i) => !isMissingMediaIssue(i))) break;
    // LLM-raised issues are not re-checkable in code, so they are considered addressed
    // once the rewrite has been applied; deterministic ones must actually clear.
    pending = remaining;
    llmIssues = [];
  }

  // ── Final verdict ────────────────────────────────────────────────────────────
  const finalDeterministic = report;
  // Media gaps are reported on their own channel (`mediaGaps`) and the user closes them
  // in the editor, so they must not ALSO be scored as unfixed quality defects: a campaign
  // whose copy is excellent should not read as 20/100 because one image never rendered.
  // The 40-point blocker penalty is handed back for exactly those issues, and nothing else.
  const gapPenaltyRefund =
    finalDeterministic.blockers.filter(isMissingMediaIssue).length * 40;
  const deterministicScore = Math.min(100, finalDeterministic.score + gapPenaltyRefund);
  const combinedScore =
    llmScore === null
      ? deterministicScore
      : Math.round(deterministicScore * 0.5 + llmScore * 0.5);
  const outstanding = finalDeterministic.issues
    .filter((i) => !isMissingMediaIssue(i))
    .map((i) => `${i.code}: ${i.message}`);
  const unresolvedBlockers = finalDeterministic.blockers.filter((i) => !isMissingMediaIssue(i));
  const passed = unresolvedBlockers.length === 0 && combinedScore >= 80;

  const noteParts = [
    summarizeReport(finalDeterministic),
    revisionRounds > 0 ? `${revisionRounds} revision round(s) applied and re-verified.` : "No revision needed.",
    mediaGaps.length
      ? `${mediaGaps.length} post(s) ship without media — add it in the content editor.`
      : "",
    llmNotes || (judgementUnavailable ? "Subjective quality review was unavailable this run." : ""),
  ].filter(Boolean);

  state.auditResult = {
    passed,
    score: combinedScore,
    notes: noteParts.join(" "),
    issues: outstanding,
    revisionRounds,
    judgementUnavailable,
    mediaGaps,
  };

  emit({
    type: "agent_action",
    agentId: "ceo_auditor",
    data: {
      label: passed
        ? `CEO verdict: APPROVED at ${combinedScore}/100${revisionRounds ? ` after ${revisionRounds} revision round(s)` : ""}` +
          (mediaGaps.length ? ` — ${mediaGaps.length} post(s) still need media` : "")
        : `CEO verdict: ${combinedScore}/100 — ${outstanding.length} issue(s) still open`,
      detail: outstanding.slice(0, 5).join(" | ") || undefined,
    },
  });

  emit({ type: "output_ready", agentId: "ceo_auditor", data: state.auditResult });
  emitProgress("ceo_auditor", 100, "completed", "Campaign audit complete", "completed");
  emit({ type: "agent_completed", agentId: "ceo_auditor" });
  completePhase("audit");

  emit({
    type: "workflow_completed",
    agentId: "system",
    // Only the campaign payload: `state` also holds `generatedAssets`, which duplicates
    // the same (possibly multi-megabyte) media URLs and can blow the SSE buffer.
    data: { campaign: state.generatedContent, audit: state.auditResult },
  });

  return state;
}
