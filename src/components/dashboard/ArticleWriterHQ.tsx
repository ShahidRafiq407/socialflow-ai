"use client";

/**
 * ARTICLE WRITER — the brief, the draft, and where it goes
 *
 * This is an orchestrator: it owns the form state, calls `/api/article-writer`,
 * and hands the result to the editor, the SEO sidebar and the publish panel. It
 * renders no colours of its own — every one is a theme token, so the page follows
 * the dashboard's light/dark switch and a re-theme reaches it for free.
 *
 * Three rules the previous build broke, kept here deliberately:
 *
 *   1. Nothing is shown that was not measured. The score, the checklist and every
 *      count come from the generator's own audit of the finished HTML.
 *   2. Every control is wired. A field that the API does not read is not drawn — and
 *      a control the chosen mode will not act on is drawn off, disabled, with the
 *      reason under it, because a toggle that cannot change the run is the same lie
 *      as a field nobody reads. Which those are is derived in `lib/article/modes.ts`
 *      from the pipeline itself, never listed here.
 *   3. No credential ever touches the browser. Publishing goes through the server
 *      by `targetId`; the old build kept WordPress application passwords in
 *      `localStorage` under `seowriting_connected_wp_sites`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Flame,
  HelpCircle,
  ImagePlus,
  Loader2,
  Lock,
  PenLine,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { listPublishTargets } from "@/actions/cmsTargets";
import { ToastStack, useToasts } from "@/components/dashboard/goals/shared";
import { SectionExplainer } from "@/components/dashboard/SectionExplainer";
import { describeBrandFacts } from "@/lib/brand/profile";
import {
  BRIEF_CONTROLS,
  CONTROL_LABEL,
  MODE_SUMMARY,
  controlNote,
  type ArticleBriefControl,
} from "@/lib/article/modes";
import { stageSpec, type ArticleRunMode } from "@/lib/article/stages";
import ArticleEditor, { type ArticleEditorHandle } from "./article-writer/ArticleEditor";
import BusinessPanel from "./article-writer/BusinessPanel";
import EvidencePanel from "./article-writer/EvidencePanel";
import MediaStudioModal, { type MediaPick } from "./article-writer/MediaStudioModal";
import ModeGuide, { ModeStages } from "./article-writer/ModeGuide";
import PerformancePanel from "./article-writer/PerformancePanel";
import RunProgress from "./article-writer/RunProgress";
import SeoSidebar from "./article-writer/SeoSidebar";
import type { RunAnalysis } from "./article-writer/runArticle";
import { useArticleRun, type RunOutcome } from "./article-writer/useArticleRun";
import { describeTargets, relativeTime, statusDot } from "./article-writer/targetStatus";
import {
  AI_IMAGE_SHAPES,
  ARTICLE_SIZE_PRESETS,
  IMAGE_COUNT_CHOICES,
  IMAGE_STYLE_OPTIONS,
  LANGUAGES,
  MARKET_GROUPS,
  MAX_TARGET_WORDS,
  MIN_TARGET_WORDS,
  POINT_OF_VIEW_OPTIONS,
  PUBLISH_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  TONE_OPTIONS,
  WORLDWIDE_MARKET,
} from "./article-writer/constants";
import type { EditorView } from "./article-writer/constants";
import type {
  BrandDnaProps,
  CmsContentType,
  CmsProviderDescriptor,
  CmsPublishStatus,
  CmsTargetSummary,
  GeneratedArticle,
  PublishOutcome,
  SerpAnalysis,
  TargetTaxonomy,
  TopicIdea,
} from "./article-writer/types";
export interface ArticleWriterHQProps {
  workspaceId: string;
  workspaceName: string;
  industry?: string;
  website?: string;
  /** Straight from the BrandDNA row. Absent fields stay absent — nothing is faked. */
  brandDna?: BrandDnaProps | null;
  initialTargets?: {
    targets: CmsTargetSummary[];
    providers: CmsProviderDescriptor[];
    encryptionReady: boolean;
  };
}

/** Words in rendered text, counted the way the generator counts them. */
function countWords(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

function clampWords(value: number): number {
  if (!Number.isFinite(value)) return MIN_TARGET_WORDS;
  return Math.min(MAX_TARGET_WORDS, Math.max(MIN_TARGET_WORDS, Math.round(value)));
}

function figureHtml(pick: MediaPick): string {
  const alt = pick.alt.replace(/"/g, "&quot;");
  const caption = pick.credit ? `<figcaption>${pick.credit}</figcaption>` : "";
  if (pick.kind === "video") {
    return `<figure><iframe src="${pick.url}" title="${alt}" loading="lazy" allowfullscreen></iframe><figcaption>${
      pick.alt
    }</figcaption></figure>`;
  }
  return `<figure><img src="${pick.url}" alt="${alt}" loading="lazy" />${caption}</figure>`;
}
/** A labelled form row. `hint` carries the reason a field exists, not filler. */
function Field({
  label,
  hint,
  children,
  action,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {action && <span className="ml-auto normal-case tracking-normal">{action}</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">{hint}</span>}
    </label>
  );
}

const INPUT =
  "w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none";
const SELECT =
  "w-full h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:border-ring focus:outline-none";

/**
 * A real checkbox underneath, so it is keyboard-reachable and form-legible.
 *
 * `disabled` is for a control the chosen mode will not act on. It draws off and
 * refuses the click, and the caller keeps the stored value untouched — so a switch
 * to Deep brings the choice back rather than making the person set it again. Drawn
 * on it would be a promise the run does not keep.
 */
function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  note,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** Why this mode ignores it. Replaces the hint, because it outranks it. */
  note?: string | null;
}) {
  const on = checked && !disabled;
  return (
    <label
      className={`flex items-start gap-2 py-1 ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors ${
          on ? "border-primary bg-primary" : "border-border bg-muted"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-background transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[11px] font-medium ${
            disabled ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {label}
        </span>
        {note ? (
          <span className="block text-[10px] font-medium leading-snug text-secondary">{note}</span>
        ) : (
          hint && <span className="block text-[10px] leading-snug text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}
/** The framework the outline is planned against, in the generator's own order. */
const PILLARS: { name: string; meaning: string }[] = [
  { name: "Experience", meaning: "first-hand detail — what actually happens when you do this" },
  { name: "Expertise", meaning: "the mechanism, the numbers, the edge cases" },
  { name: "Authoritativeness", meaning: "named sources a reader can go and check" },
  { name: "Trustworthiness", meaning: "the limits, the costs, and who this is wrong for" },
];

/** Where a topic came from. `brand-model` is the only one Google did not confirm. */
const IDEA_SOURCE_LABEL: Record<string, string> = {
  "google-related": "Google related",
  "google-paa": "People also ask",
  "brand-model": "Inferred",
};

function Card({
  title,
  icon: Icon,
  children,
  right,
  className = "",
}: {
  title: string;
  icon: typeof PenLine;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card ${className}`}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{title}</h2>
        {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ArticleWriterHQ({
  workspaceId,
  workspaceName,
  industry = "",
  website = "",
  brandDna = null,
  initialTargets,
}: ArticleWriterHQProps) {
  const { toasts, push, dismiss } = useToasts();
  const editorRef = useRef<ArticleEditorHandle | null>(null);

  // ---- the brief ---------------------------------------------------------
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [sizePreset, setSizePreset] = useState(ARTICLE_SIZE_PRESETS[2]?.value || "medium");
  const [targetWords, setTargetWords] = useState(ARTICLE_SIZE_PRESETS[2]?.words || 1500);
  const [market, setMarket] = useState(WORLDWIDE_MARKET.code);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [pointOfView, setPointOfView] = useState(POINT_OF_VIEW_OPTIONS[1].value);
  const [tone, setTone] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [briefOpen, setBriefOpen] = useState(true);

  // ---- what goes in the article ------------------------------------------
  const [enableToc, setEnableToc] = useState(true);
  const [enableFaq, setEnableFaq] = useState(true);
  const [enableTakeaways, setEnableTakeaways] = useState(true);
  const [enableSources, setEnableSources] = useState(true);
  const [enableInternalLinks, setEnableInternalLinks] = useState(true);
  const [enableExternalLinks, setEnableExternalLinks] = useState(true);
  const [enableImages, setEnableImages] = useState(true);
  const [enableYoutube, setEnableYoutube] = useState(true);
  const [humanize, setHumanize] = useState(true);
  const [imageCount, setImageCount] = useState(3);
  const [imageStyle, setImageStyle] = useState(IMAGE_STYLE_OPTIONS[0].value);
  // ---- the run -----------------------------------------------------------
  // The mode is the person's choice, stored on the run row. Nothing here derives it
  // from a plan code: what the plan allows arrives as a row per mode from the server,
  // carrying its own sentence, and a mode the plan does not include is drawn locked
  // with that sentence rather than hidden. `runMode` also drives every brief control
  // below, because a toggle whose stage this mode never reaches has to say so before
  // the run, not in the score afterwards.
  const [runMode, setRunMode] = useState<ArticleRunMode>("quick");
  const [guideOpen, setGuideOpen] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);
  const pipeline = useArticleRun({
    workspaceId,
    onNotice: (kind, message) => push(kind, message),
  });
  const running = pipeline.walking;

  // What the run established before it wrote anything — the business it read and
  // the site it crawled. Held apart from the draft on purpose: a run that blocked
  // at the evidence gate produced no page and still has both of these to show, and
  // the panels are the only honest answer to "what did it actually look at".
  const [analysis, setAnalysis] = useState<RunAnalysis>({});

  // ---- the draft ---------------------------------------------------------
  const [article, setArticle] = useState<GeneratedArticle | null>(null);
  const [html, setHtml] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [view, setView] = useState<EditorView>("preview");
  const [featuredUrl, setFeaturedUrl] = useState("");
  const [featuredAlt, setFeaturedAlt] = useState("");

  // ---- research ----------------------------------------------------------
  const [serpData, setSerpData] = useState<SerpAnalysis | null>(null);
  const [serpError, setSerpError] = useState<string | null>(null);
  const [serpBusy, setSerpBusy] = useState(false);
  const [ideas, setIdeas] = useState<TopicIdea[]>([]);
  const [ideaWarnings, setIdeaWarnings] = useState<string[]>([]);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasLoaded, setIdeasLoaded] = useState(false);
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [titleBusy, setTitleBusy] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);

  // ---- publishing --------------------------------------------------------
  // Destinations are connected in the Plugins tab. This screen only reads them,
  // so it holds no provider descriptors and no credential form state.
  const [targets, setTargets] = useState<CmsTargetSummary[]>(initialTargets?.targets || []);
  const [encryptionReady, setEncryptionReady] = useState(
    initialTargets?.encryptionReady !== false
  );
  const [targetsBusy, setTargetsBusy] = useState(false);
  const [targetPick, setTargetPick] = useState<string | null>(null);
  const [taxonomy, setTaxonomy] = useState<TargetTaxonomy | null>(null);
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);
  const [contentTypePick, setContentTypePick] = useState<CmsContentType | null>(null);
  const [statusPick, setStatusPick] = useState<CmsPublishStatus | null>(null);
  // `null` means untouched, so the platform's own default still applies. An empty
  // array is a real choice — no categories — and is not re-seeded.
  const [categoryPick, setCategoryPick] = useState<number[] | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [authorPick, setAuthorPick] = useState<number | null | undefined>(undefined);
  const [publishing, setPublishing] = useState(false);
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);

  // ---- media -------------------------------------------------------------
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaSlot, setMediaSlot] = useState<"body" | "featured">("body");

  /**
   * Every publish option below is derived, not synced. The old build kept them in
   * state and copied the platform's defaults across in an effect, which left the
   * publish button reading a value one render behind the destination list — switch
   * from WordPress to Shopify and click fast enough and it sent `post` to a store
   * that only takes `article`. Here the picks hold what the user asked for and the
   * platform resolves it at render, so the two can never disagree.
   */
  const targetId = useMemo(() => {
    if (targetPick && targets.some((t) => t.id === targetPick)) return targetPick;
    return (targets.find((t) => t.status === "connected") || targets[0])?.id ?? null;
  }, [targetPick, targets]);

  const selectedTarget = useMemo(
    () => targets.find((t) => t.id === targetId) || null,
    [targets, targetId]
  );

  /**
   * Re-reads the destinations. The list arrives with the page, so this exists for
   * one case: the user connects a site in the Plugins tab in another tab and comes
   * back here expecting to see it.
   */
  const refreshTargets = useCallback(async () => {
    setTargetsBusy(true);
    try {
      const view = await listPublishTargets(workspaceId);
      setTargets(view.targets);
      setEncryptionReady(view.encryptionReady);
    } catch {
      push("error", "The destination list could not be re-read. Try again in a moment.");
    } finally {
      setTargetsBusy(false);
    }
  }, [workspaceId, push]);

  const targetMeta: Record<string, any> = selectedTarget?.meta || {};
  const contentTypes = (
    selectedTarget?.contentTypes.length ? selectedTarget.contentTypes : ["post"]
  ) as CmsContentType[];
  const statuses = (
    selectedTarget?.statuses.length ? selectedTarget.statuses : ["draft"]
  ) as CmsPublishStatus[];
  const contentType =
    [contentTypePick, targetMeta.defaultContentType as CmsContentType].find(
      (v): v is CmsContentType => Boolean(v) && contentTypes.includes(v as CmsContentType)
    ) || contentTypes[0];
  const status =
    [statusPick, targetMeta.defaultStatus as CmsPublishStatus].find(
      (v): v is CmsPublishStatus => Boolean(v) && statuses.includes(v as CmsPublishStatus)
    ) || statuses[0];
  const authorId =
    authorPick === undefined
      ? typeof targetMeta.defaultAuthorId === "number"
        ? targetMeta.defaultAuthorId
        : null
      : authorPick;
  const categoryIds = useMemo(
    () =>
      categoryPick ??
      (typeof targetMeta.defaultCategoryId === "number" && targetMeta.defaultCategoryId > 0
        ? [targetMeta.defaultCategoryId]
        : []),
    [categoryPick, targetMeta.defaultCategoryId]
  );

  const liveWordCount = useMemo(() => countWords(html), [html]);

  /** The pipeline the mode buttons are describing, with the server's own verdict. */
  const modeInfo = useMemo(
    () => pipeline.modes.find((entry) => entry.mode === runMode) ?? null,
    [pipeline.modes, runMode]
  );

  /**
   * Per brief control: why the chosen mode will ignore it, or null when it will not.
   *
   * Derived in `modes.ts` from the one fact that decides it — whether this mode runs
   * the stage that produces what the control asks for — so the toggles below cannot
   * disagree with the pipeline, and switching the mode rewrites all nine at once.
   */
  const briefNotes = useMemo(() => {
    const notes = {} as Record<ArticleBriefControl, string | null>;
    for (const control of BRIEF_CONTROLS) notes[control] = controlNote(control, runMode);
    return notes;
  }, [runMode]);

  /** One request shape for every step. A non-2xx answer throws its own message. */
  const call = useCallback(
    async (step: string, payload: Record<string, unknown> = {}): Promise<any> => {
      const res = await fetch("/api/article-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, workspaceId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          String(data?.error || data?.message || `The request failed (HTTP ${res.status}).`)
        );
      }
      return data;
    },
    [workspaceId]
  );

  /** WordPress is the only platform with a taxonomy; the rest say so plainly. */
  const loadTaxonomy = useCallback(
    async (id: string | null) => {
      if (!id) {
        setTaxonomy(null);
        return;
      }
      setTaxonomyBusy(true);
      try {
        const data = await call("target-meta", { targetId: id });
        if (data?.supported === false) {
          setTaxonomy({
            supported: false,
            categories: [],
            authors: [],
            postTypes: [],
            note: data?.note,
          });
        } else if (data?.success === false) {
          setTaxonomy({
            supported: true,
            categories: [],
            authors: [],
            postTypes: [],
            error: data?.error,
          });
        } else {
          setTaxonomy({
            supported: true,
            categories: data?.categories || [],
            authors: data?.authors || [],
            postTypes: data?.postTypes || [],
          });
        }
      } catch (error: any) {
        setTaxonomy({
          supported: false,
          categories: [],
          authors: [],
          postTypes: [],
          error: error?.message || "The site's categories could not be read.",
        });
      } finally {
        setTaxonomyBusy(false);
      }
    },
    [call]
  );

  useEffect(() => {
    void loadTaxonomy(targetId);
  }, [targetId, loadTaxonomy]);
  /**
   * Takes a finished run into the editor.
   *
   * Continue lands here as well as Start, because a run that was blocked and then
   * continued is the same run: the draft is redrawn from its artifacts, which are
   * the only place the page exists. Anything the run did not produce is left alone
   * rather than cleared — an empty tag list from a pipeline with no tag stage is not
   * a reason to throw away tags a person typed.
   */
  const adoptRun = useCallback(
    (outcome: RunOutcome) => {
      setRunNote(outcome.message ?? null);
      setRunError(outcome.ending === "failed" ? (outcome.message ?? null) : null);

      // Before the early return below, and deliberately so: the business profile is
      // stage one and the site crawl is stage two, so a run that stopped anywhere
      // after them has facts worth showing even though it has no page.
      setAnalysis(outcome.analysis);

      const built = outcome.result;
      if (!built) {
        if (outcome.ending === "done") {
          setRunError(
            "The run finished without producing a page. Every stage it recorded is on the progress list."
          );
        }
        return;
      }

      const next = built.article;
      setArticle(next);
      setHtml(next.content);
      setDraftTitle(next.title);
      setMetaTitle(next.metaTitle);
      setMetaDescription(next.metaDescription);
      setSlug(next.slug);
      setExcerpt(next.excerpt);
      if (next.suggestedTags.length) setTags(next.suggestedTags);
      if (built.serp) setSerpData(built.serp);
      setView("preview");
      setBriefOpen(false);

      if (built.score) {
        push(
          "success",
          `Content Quality Score ${built.score.total}/100 — ours, not Google's. Differentiation ${built.score.differentiation}/100. ${next.seoMetrics.wordCount.toLocaleString()} words.`
        );
      } else {
        push(
          "info",
          `${next.seoMetrics.wordCount.toLocaleString()} words written. The scoring stage did not run, so there is no quality score for this draft.`
        );
      }
      if (built.gate && !built.gate.passed) {
        push(
          "error",
          `The publish checks refused this page: ${built.gate.blockers[0]}${
            built.gate.blockers.length > 1 ? ` (+${built.gate.blockers.length - 1} more)` : ""
          }`
        );
      }
    },
    [push]
  );
  const runGenerate = useCallback(async () => {
    const focus = keyword.trim();
    if (!focus) {
      push("error", "A focus keyword is what the whole article is built from. Add one first.");
      return;
    }
    setRunError(null);
    setRunNote(null);
    setOutcome(null);
    // A new run has not read anything yet. Leaving the last run's business profile
    // on screen beside a fresh progress list would attribute one run's facts to
    // another — the panels go back to saying which stage has not run.
    setAnalysis({});
    try {
      // The site is resolved server-side from the destination, so the brief stores
      // the same URL the publish step will use instead of one the browser guessed.
      //
      // `honours` sends what the screen showed. A control the chosen mode cannot act
      // on is drawn off, so it is posted off — the stored brief then matches what was
      // agreed to, and the score's commentary afterwards cannot cite an intent the
      // person was told this run would ignore. Their own state is left alone, so
      // switching to Deep and running again sends it back.
      const honours = (control: ArticleBriefControl, value: boolean): boolean =>
        value && !briefNotes[control];
      const result = await pipeline.start(runMode, {
        keyword: focus,
        title: title.trim() || undefined,
        targetId: targetId || undefined,
        articleSize: sizePreset,
        targetWordCount: targetWords,
        pointOfView,
        language,
        targetCountry: market,
        tone: tone || undefined,
        authorName: authorName.trim() || undefined,
        enableToc: honours("enableToc", enableToc),
        enableFaq: honours("enableFaq", enableFaq),
        enableTakeaways: honours("enableTakeaways", enableTakeaways),
        enableSources: honours("enableSources", enableSources),
        enableInternalLinks: honours("enableInternalLinks", enableInternalLinks),
        enableExternalLinks: honours("enableExternalLinks", enableExternalLinks),
        enableImages: honours("enableImages", enableImages),
        enableYoutube: honours("enableYoutube", enableYoutube),
        imageCount,
        imageStyle,
        humanize: honours("humanize", humanize),
      });
      adoptRun(result);
    } catch (error: any) {
      const message = error?.message || "The article could not be written.";
      setRunError(message);
      push("error", message);
    }
  }, [
    adoptRun, authorName, briefNotes, enableExternalLinks, enableFaq, enableImages,
    enableInternalLinks, enableSources, enableTakeaways, enableToc, enableYoutube, humanize,
    imageCount, imageStyle, keyword, language, market, pipeline, pointOfView, push, runMode,
    sizePreset, targetId, targetWords, title, tone,
  ]);

  /**
   * Picks the run up from the stage that stopped it.
   *
   * Not a restart: every stage already recorded stays recorded and is not paid for
   * again. A failed stage is claimable again, so this retries exactly that one.
   */
  const continueRun = useCallback(async () => {
    const runId = pipeline.run?.id;
    if (!runId) return;
    setRunError(null);
    setRunNote(null);
    try {
      adoptRun(await pipeline.resume(runId));
    } catch (error: any) {
      const message = error?.message || "The run could not be continued.";
      setRunError(message);
      push("error", message);
    }
  }, [adoptRun, pipeline, push]);

  /**
   * A verification run somebody approved from the performance panel.
   *
   * Resumed with exactly the code that continues any other run: one endpoint, one
   * stage at a time, the same evidence panel, the same Publish card. That is what
   * keeps the promise this whole loop is built on true in the UI as well as on the
   * server — approving a proposal buys a draft, and a person publishes the draft.
   * Nothing about an approved proposal reaches the live page by itself.
   */
  const walkVerifyRun = useCallback(
    async (runId: string) => {
      if (!runId) return;
      setRunError(null);
      setRunNote(null);
      setOutcome(null);
      // The last run's facts belong to the last run. A verification run establishes
      // its own, and leaving the previous profile beside a fresh progress list would
      // attribute one run's reading to another.
      setAnalysis({});
      window.scrollTo({ top: 0, behavior: "smooth" });
      try {
        adoptRun(await pipeline.resume(runId));
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "The verification run could not be continued.";
        setRunError(message);
        push("error", message);
      }
    },
    [adoptRun, pipeline, push]
  );
  const loadIdeas = useCallback(
    async (seedHint?: string) => {
      setIdeasBusy(true);
      try {
        const data = await call("topic-ideas", {
          targetCountry: market,
          seedHint: seedHint || undefined,
        });
        setIdeas(data?.ideas || []);
        setIdeaWarnings(data?.warnings || []);
        setIdeasLoaded(true);
        if (!data?.ideas?.length) {
          push("info", data?.warnings?.[0] || "No topics could be derived from this brand yet.");
        }
      } catch (error: any) {
        push("error", error?.message || "Topic ideas could not be loaded.");
      } finally {
        setIdeasBusy(false);
      }
    },
    [call, market, push]
  );

  const previewSerp = useCallback(async () => {
    const focus = keyword.trim();
    if (!focus) {
      push("error", "Add a keyword to look up who is ranking for it.");
      return;
    }
    setSerpBusy(true);
    try {
      const data = await call("serp-only", { keyword: focus, targetCountry: market });
      setSerpData(data?.serpData || null);
      setSerpError(data?.serpError || null);
      if (!data?.serpData) push("error", data?.serpError || "The live results could not be read.");
    } catch (error: any) {
      push("error", error?.message || "The live results could not be read.");
    } finally {
      setSerpBusy(false);
    }
  }, [call, keyword, market, push]);

  const suggestTitles = useCallback(async () => {
    const focus = keyword.trim();
    if (!focus) {
      push("error", "Titles are written against a keyword. Add one first.");
      return;
    }
    setTitleBusy(true);
    try {
      const data = await call("suggest-title", { keyword: focus, targetCountry: market });
      setTitleOptions(data?.titles || []);
      if (data?.note) push("info", data.note);
    } catch (error: any) {
      push("error", error?.message || "Titles could not be generated.");
    } finally {
      setTitleBusy(false);
    }
  }, [call, keyword, market, push]);
  const rewriteMeta = useCallback(async () => {
    if (!draftTitle.trim() || !keyword.trim()) {
      push("error", "A keyword and a title are needed to rewrite the search metadata.");
      return;
    }
    setMetaBusy(true);
    try {
      const data = await call("enhance-seo", {
        keyword: keyword.trim(),
        title: draftTitle.trim(),
        excerpt: excerpt.trim() || undefined,
      });
      if (data?.metaTitle) setMetaTitle(data.metaTitle);
      if (data?.metaDescription) setMetaDescription(data.metaDescription);
      if (data?.slug) setSlug(data.slug);
      if (data?.tags?.length) setTags(data.tags);
      push("success", "Search metadata rewritten. The score updates on the next run.");
    } catch (error: any) {
      push("error", error?.message || "The metadata could not be rewritten.");
    } finally {
      setMetaBusy(false);
    }
  }, [call, draftTitle, excerpt, keyword, push]);

  const addCategory = useCallback(async () => {
    const name = newCategory.trim();
    if (!name || !targetId) return;
    try {
      const data = await call("create-category", { name, targetId });
      const created = data?.category;
      if (created?.id) {
        setTaxonomy((prev) =>
          prev ? { ...prev, categories: [...prev.categories, created] } : prev
        );
        setCategoryPick([...categoryIds, Number(created.id)]);
        setNewCategory("");
        push("success", `Category "${created.name}" created on your site.`);
      }
    } catch (error: any) {
      push("error", error?.message || "The category could not be created.");
    }
  }, [call, categoryIds, newCategory, push, targetId]);

  const publish = useCallback(async () => {
    const liveHtml = editorRef.current?.read() || html;
    if (!draftTitle.trim() || !liveHtml.trim()) {
      push("error", "A title and some content are needed before publishing.");
      return;
    }
    if (!targetId) {
      push("error", "Pick a destination first — WordPress, Shopify or your own coded site.");
      return;
    }
    setPublishing(true);
    setOutcome(null);
    try {
      const data = await call("publish", {
        targetId,
        publishPayload: {
          title: draftTitle.trim(),
          html: liveHtml,
          contentType,
          status,
          excerpt: excerpt.trim() || undefined,
          slug: slug.trim() || undefined,
          metaTitle: metaTitle.trim() || undefined,
          metaDescription: metaDescription.trim() || undefined,
          focusKeyword: keyword.trim() || undefined,
          schemaMarkup: article?.schemaMarkup || undefined,
          tags,
          categoryIds,
          authorId: authorId || undefined,
          featuredImageUrl: featuredUrl || undefined,
          featuredImageAlt: featuredAlt || draftTitle.trim(),
        },
      });
      setOutcome(data as PublishOutcome);
      push(
        "success",
        `Sent to ${selectedTarget?.label || "your site"}${data?.status ? ` as ${data.status}` : ""}.`
      );
      (data?.warnings || []).slice(0, 2).forEach((w: string) => push("info", w));
    } catch (error: any) {
      const message = error?.message || "Publishing failed.";
      setOutcome({ success: false, error: message });
      push("error", message);
    } finally {
      setPublishing(false);
    }
  }, [
    article, authorId, call, categoryIds, contentType, draftTitle, excerpt, featuredAlt,
    featuredUrl, html, keyword, metaDescription, metaTitle, push, selectedTarget, slug, status,
    tags, targetId,
  ]);
  const insertMedia = useCallback(
    (pick: MediaPick) => {
      if (mediaSlot === "featured") {
        setFeaturedUrl(pick.url);
        setFeaturedAlt(pick.alt);
        push("success", "Featured image set.");
        return;
      }
      editorRef.current?.insertHtml(figureHtml(pick));
      push("success", pick.kind === "video" ? "Video embedded." : "Image inserted.");
    },
    [mediaSlot, push]
  );

  const applyIdea = useCallback((idea: TopicIdea) => {
    setKeyword(idea.keyword);
    setTitle(idea.title);
    setTitleOptions([]);
    setBriefOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const commitTags = useCallback(() => {
    const parts = tagDraft
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((prev) => Array.from(new Set([...prev, ...parts])).slice(0, 15));
    setTagDraft("");
  }, [tagDraft]);

  const openMedia = useCallback((slot: "body" | "featured") => {
    setMediaSlot(slot);
    setMediaOpen(true);
  }, []);
  // Facts, not a JSON dump. `describeBrandFacts` reads the unpacked Brand DNA the
  // page hands down, so `Style: {"ctaOffer":…}` can no longer reach the screen.
  const brandFacts = useMemo(
    () =>
      describeBrandFacts({
        brandName: workspaceName,
        website,
        industry,
        tone: brandDna?.tone || "",
        targetAudience: brandDna?.targetAudience || "",
        missionVision: brandDna?.missionVision || "",
        painPoints: brandDna?.painPoints || "",
        differentiator: brandDna?.differentiator || "",
        ctaOffer: brandDna?.ctaOffer || "",
        competitors: brandDna?.competitors || "",
        writingRules: brandDna?.writingRules || "",
        forbiddenWords: brandDna?.forbiddenWords || [],
      }),
    [workspaceName, website, industry, brandDna]
  );

  return (
    <div className="mx-auto w-full max-w-[110rem] space-y-4 p-4 md:p-6">
      <header className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <SectionExplainer
              title="Article Writer"
              explanation="Create search-ranked, long-form SEO articles with keyword research, real competitor analysis, auto-generated visuals, and one-click publishing to WordPress, Shopify, or custom CMS."
              tip="Use 'Deep' mode for comprehensive multi-stage research or 'Quick' mode for rapid, high-quality drafts."
              badge="SEO Engine"
              headingClassName="text-lg font-black text-foreground md:text-xl"
            />
            <p className="text-xs text-muted-foreground mt-0.5">
              Writing for <strong className="text-foreground">{workspaceName}</strong>
            </p>
            {brandFacts.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {brandFacts.map((fact) => (
                  <span
                    key={fact.label}
                    className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground"
                    title={`${fact.label}: ${fact.value}`}
                  >
                    <span className="text-muted-foreground">{fact.label}:</span> {fact.value}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-secondary/30 bg-secondary/10 px-2 py-1 text-[10px] font-medium text-secondary">
                <Sparkles className="h-3 w-3" />
                No Brand DNA saved yet — fill it in under Brand so the writer knows your voice.
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {/* Two different noes, drawn differently. `selectable` false means there is
                nothing to configure — the plan does not include this pipeline, or the
                build is missing a stage — so the button locks and the padlock says the
                reason is an upgrade. `available` false is a mode you may still choose
                and read about; only the Write button refuses, with the gate's sentence
                under it. Neither is ever hidden: an option that vanishes explains
                nothing, and this is where an upgrade gets decided. */}
            <div className="inline-flex items-center gap-1.5">
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {pipeline.modes.map((entry) => (
                  <button
                    key={entry.mode}
                    type="button"
                    onClick={() => setRunMode(entry.mode)}
                    disabled={running || entry.selectable === false}
                    title={entry.reason || MODE_SUMMARY[entry.mode].line}
                    className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      runMode === entry.mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {entry.locked && <Lock className="h-2.5 w-2.5" />}
                    {entry.mode === "deep" ? "Deep" : "Quick"}
                    <span className="font-medium opacity-70">{entry.stages}</span>
                  </button>
                ))}
              </div>
              {/* The explanation lives behind this, and in the hovers, so the page
                  itself stays a form rather than a comparison table. */}
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
              >
                <HelpCircle className="h-3 w-3" />
                Which one?
              </button>
            </div>
            <button
              type="button"
              onClick={() => void runGenerate()}
              disabled={running || !keyword.trim() || modeInfo?.available === false}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {running
                ? pipeline.activeStage
                  ? `${stageSpec(pipeline.activeStage).label}…`
                  : "Working…"
                : article
                  ? "Write it again"
                  : "Write the article"}
            </button>
            {/* The gate's sentence when it refused, otherwise what this run will cost:
                the price and the stage count are the server's, not this file's. */}
            <span className="max-w-[18rem] text-right text-[10px] text-muted-foreground">
              {modeInfo?.available === false
                ? modeInfo.reason
                : `${targetWords.toLocaleString()} words · ${
                    modeInfo?.stages ?? "—"
                  } stages, one request each${
                    modeInfo?.credits ? ` · ${modeInfo.credits.toLocaleString()} credits` : ""
                  }${article ? " · starts a new run" : ""}`}
            </span>
          </div>
        </div>
        {/* Real rows, not a timer. The list is only drawn once a run exists. */}
        {pipeline.run && (
          <div className="mt-4">
            <RunProgress
              run={pipeline.run}
              walking={running}
              onStop={pipeline.stop}
              onContinue={() => void continueRun()}
              note={runNote}
            />
          </div>
        )}

        {runError && !running && (
          <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {runError}
          </p>
        )}
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[21rem_minmax(0,1fr)] 2xl:grid-cols-[21rem_minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <Card
            title="The brief"
            icon={PenLine}
            right={
              <button
                type="button"
                onClick={() => setBriefOpen((v) => !v)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                {briefOpen ? "Hide" : "Show"}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${briefOpen ? "" : "-rotate-90"}`}
                />
              </button>
            }
          >
            {briefOpen && (
              <div className="space-y-3">
                <Field
                  label="Focus keyword"
                  hint="Everything is built from this: the outline, the benchmark, the internal links."
                  action={
                    <button
                      type="button"
                      onClick={() => void loadIdeas(keyword.trim() || undefined)}
                      disabled={ideasBusy}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      {ideasBusy ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Flame className="h-2.5 w-2.5" />
                      )}
                      Trending
                    </button>
                  }
                >
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="e.g. inventory management for small shops"
                    className={INPUT}
                  />
                </Field>
                <Field
                  label="Title"
                  hint="Leave it empty and the writer picks one that beats what is ranking."
                  action={
                    <button
                      type="button"
                      onClick={() => void suggestTitles()}
                      disabled={titleBusy}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      {titleBusy ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-2.5 w-2.5" />
                      )}
                      Suggest
                    </button>
                  }
                >
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Optional"
                    className={INPUT}
                  />
                </Field>

                {titleOptions.length > 0 && (
                  <ul className="space-y-1 rounded-xl border border-border bg-background p-2">
                    {titleOptions.map((option) => (
                      <li key={option}>
                        <button
                          type="button"
                          onClick={() => {
                            setTitle(option);
                            setTitleOptions([]);
                          }}
                          className="w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-snug text-foreground hover:bg-primary/10 hover:text-primary"
                        >
                          {option}
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {option.length} chars
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Length">
                    <select
                      value={sizePreset}
                      onChange={(e) => {
                        const preset = ARTICLE_SIZE_PRESETS.find((p) => p.value === e.target.value);
                        setSizePreset(e.target.value);
                        if (preset) setTargetWords(preset.words);
                      }}
                      className={SELECT}
                    >
                      {ARTICLE_SIZE_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Exact words">
                    <input
                      type="number"
                      min={MIN_TARGET_WORDS}
                      max={MAX_TARGET_WORDS}
                      step={50}
                      value={targetWords}
                      onChange={(e) => setTargetWords(Number(e.target.value))}
                      onBlur={(e) => setTargetWords(clampWords(Number(e.target.value)))}
                      className={INPUT}
                    />
                  </Field>
                </div>
                <p className="-mt-1 text-[10px] leading-snug text-muted-foreground">
                  The exact number wins. The writer measures the draft and keeps expanding or
                  trimming until it lands within 5% of it, between {MIN_TARGET_WORDS} and{" "}
                  {MAX_TARGET_WORDS.toLocaleString()} words.
                </p>

                <Field
                  label="Market"
                  hint="Sets the country the live results are read from, and the spelling."
                >
                  <select
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    className={SELECT}
                  >
                    <option value={WORLDWIDE_MARKET.code}>{WORLDWIDE_MARKET.label}</option>
                    {MARKET_GROUPS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.markets.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Language">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className={SELECT}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Point of view">
                    <select
                      value={pointOfView}
                      onChange={(e) => setPointOfView(e.target.value)}
                      className={SELECT}
                    >
                      {POINT_OF_VIEW_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field
                  label="Tone"
                  hint={
                    brandDna?.tone
                      ? `Left alone, the brand's own tone is used: ${brandDna.tone}.`
                      : "No brand tone is saved, so pick one here or the writer stays neutral."
                  }
                >
                  <select value={tone} onChange={(e) => setTone(e.target.value)} className={SELECT}>
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value || "brand"} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Author"
                  hint="Goes in the byline, the experience signals and the article schema."
                >
                  <input
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Who is writing this"
                    className={INPUT}
                  />
                </Field>
              </div>
            )}
          </Card>
          {/* Every label comes from `CONTROL_LABEL` and every note from
              `controlNote`, so this card and the guide cannot call the same thing two
              different names, and a control the chosen mode will not act on says so
              here — before the run, in the place the choice is made. */}
          <Card
            title="What goes in it"
            icon={Settings2}
            right={
              <span className="text-[10px] font-medium text-muted-foreground">
                {MODE_SUMMARY[runMode].name}
              </span>
            }
          >
            <div className="space-y-0.5">
              <Toggle
                checked={enableToc}
                onChange={setEnableToc}
                disabled={Boolean(briefNotes.enableToc)}
                note={briefNotes.enableToc}
                label={CONTROL_LABEL.enableToc}
                hint="Anchored links to every H2, which is what wins a jump-to link in the results."
              />
              <Toggle
                checked={enableFaq}
                onChange={setEnableFaq}
                disabled={Boolean(briefNotes.enableFaq)}
                note={briefNotes.enableFaq}
                label={CONTROL_LABEL.enableFaq}
                hint="Answers the questions Google shows for this keyword, with FAQ schema."
              />
              <Toggle
                checked={enableTakeaways}
                onChange={setEnableTakeaways}
                disabled={Boolean(briefNotes.enableTakeaways)}
                note={briefNotes.enableTakeaways}
                label={CONTROL_LABEL.enableTakeaways}
              />
              <Toggle
                checked={enableSources}
                onChange={setEnableSources}
                disabled={Boolean(briefNotes.enableSources)}
                note={briefNotes.enableSources}
                label={CONTROL_LABEL.enableSources}
                hint="A reference list built only from pages that were really read."
              />
              <Toggle
                checked={enableInternalLinks}
                onChange={setEnableInternalLinks}
                disabled={Boolean(briefNotes.enableInternalLinks)}
                note={briefNotes.enableInternalLinks}
                label={CONTROL_LABEL.enableInternalLinks}
                hint={
                  website || targets.length
                    ? "Crawls your own site and links only to URLs that exist."
                    : "Needs a connected site or a workspace website — otherwise none are added."
                }
              />
              <Toggle
                checked={enableExternalLinks}
                onChange={setEnableExternalLinks}
                disabled={Boolean(briefNotes.enableExternalLinks)}
                note={briefNotes.enableExternalLinks}
                label={CONTROL_LABEL.enableExternalLinks}
                hint="Outbound links to the sources behind each claim."
              />
              <Toggle
                checked={enableYoutube}
                onChange={setEnableYoutube}
                disabled={Boolean(briefNotes.enableYoutube)}
                note={briefNotes.enableYoutube}
                label={CONTROL_LABEL.enableYoutube}
              />
              <Toggle
                checked={humanize}
                onChange={setHumanize}
                disabled={Boolean(briefNotes.humanize)}
                note={briefNotes.humanize}
                label={CONTROL_LABEL.humanize}
                hint="A second pass that breaks up the rhythm machines fall into."
              />
            </div>
          </Card>
          {/* Images are in both modes — the difference is who places them. Deep runs
              the media stage and does it for you; on a quick run the studio below is
              how they get in, which is why that button is not conditional on anything.
              The user's count and style choices are kept, just not offered where no
              stage would read them. */}
          <Card title="Images" icon={ImagePlus}>
            <Toggle
              checked={enableImages}
              onChange={setEnableImages}
              disabled={Boolean(briefNotes.enableImages)}
              note={briefNotes.enableImages}
              label={CONTROL_LABEL.enableImages}
              hint="Sourced and rehosted on your own storage, never hotlinked."
            />
            {enableImages && !briefNotes.enableImages && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="How many">
                  <select
                    value={imageCount}
                    onChange={(e) => setImageCount(Number(e.target.value))}
                    className={SELECT}
                  >
                    {IMAGE_COUNT_CHOICES.map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "Hero only" : `${n} in-article`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Style">
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                    className={SELECT}
                  >
                    {IMAGE_STYLE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <button
              type="button"
              onClick={() => openMedia("body")}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Open the media studio
            </button>
            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
              {briefNotes.enableImages
                ? `Works in either mode, and on a ${MODE_SUMMARY[runMode].name.toLowerCase()} run it is how images get in: stock search, your own uploads, an AI render in ${AI_IMAGE_SHAPES.length} shapes, or a YouTube embed. Every pick needs alt text before it goes in.`
                : `Stock search, your own uploads, an AI render in ${AI_IMAGE_SHAPES.length} shapes, or a YouTube embed. Every pick needs alt text before it goes in.`}
            </p>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card
            title="Trending topics from your Brand DNA"
            icon={Flame}
            right={
              <button
                type="button"
                onClick={() => void loadIdeas()}
                disabled={ideasBusy}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {ideasBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {ideasLoaded ? "Refresh" : "Find topics"}
              </button>
            }
          >
            {ideasBusy ? (
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reading what your market is actually searching for…
              </p>
            ) : !ideasLoaded ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Reads your brand, your industry and the titles you have already published, then
                pulls the queries Google really returns around them. Nothing here is a guess — each
                topic is labelled with where it came from.
              </p>
            ) : ideas.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {ideaWarnings[0] || "No topics could be derived for this brand yet."}
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {ideas.map((idea) => (
                  <li
                    key={`${idea.keyword}-${idea.title}`}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          idea.source === "brand-model"
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {IDEA_SOURCE_LABEL[idea.source] || idea.source}
                      </span>
                      <span className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground">
                        {idea.searchIntent}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-bold leading-snug text-foreground">
                      {idea.title}
                    </p>
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                      {idea.angle}
                    </p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{idea.keyword}</span> ·{" "}
                      {idea.pillar}
                    </p>
                    <button
                      type="button"
                      onClick={() => applyIdea(idea)}
                      className="mt-2 inline-flex h-7 items-center gap-1 rounded-md bg-primary/10 px-2 text-[11px] font-semibold text-primary hover:bg-primary/20"
                    >
                      Use this <ArrowRight className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {ideas.length > 0 && ideaWarnings.length > 0 && (
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                {ideaWarnings.join(" ")}
              </p>
            )}
          </Card>
          {/* The stage list for the mode that is selected, so the toggle above visibly
              changes what this page says it will do. Names and one-liners are the
              pipeline's own — the hover on each carries the detail, which is how the
              whole comparison fits here without becoming a wall of text. */}
          {!article && (
            <Card
              title={`What a ${MODE_SUMMARY[runMode].name.toLowerCase()} run does`}
              icon={Sparkles}
              right={
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                >
                  <HelpCircle className="h-3 w-3" />
                  Compare the two
                </button>
              }
            >
              <ModeStages mode={runMode} />
            </Card>
          )}
          {!article && (
            <Card title="How a run is planned" icon={BookOpen}>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The outline is built so that every one of the four pillars has a section carrying
                it. That mapping comes back with the article, so you can see which section is
                doing which job.
              </p>
              <ul className="mt-3 space-y-2">
                {PILLARS.map((pillar) => (
                  <li key={pillar.name} className="flex items-start gap-2">
                    <Star className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span className="text-[11px] leading-snug">
                      <span className="font-semibold text-foreground">{pillar.name}</span>
                      <span className="text-muted-foreground"> — {pillar.meaning}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {article && (
            <Card
              title="Search appearance"
              icon={Search}
              right={
                <button
                  type="button"
                  onClick={() => void rewriteMeta()}
                  disabled={metaBusy}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  {metaBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                  Rewrite meta
                </button>
              }
            >
              <div className="space-y-3">
                <Field label="Headline">
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className={INPUT}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label={`Meta title — ${metaTitle.length} chars`}>
                    <input
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Slug">
                    <input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className={INPUT}
                    />
                  </Field>
                </div>
                <Field label={`Meta description — ${metaDescription.length} chars`}>
                  <textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed text-foreground focus:border-ring focus:outline-none"
                  />
                </Field>
                <Field label="Excerpt">
                  <textarea
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed text-foreground focus:border-ring focus:outline-none"
                  />
                </Field>

                <Field label={`Tags — ${tags.length} of 15`}>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-foreground"
                      >
                        <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                        {tag}
                        <button
                          type="button"
                          onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                          className="text-muted-foreground hover:text-destructive"
                          title={`Remove ${tag}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          commitTags();
                        }
                      }}
                      placeholder="Add a tag, or paste a comma-separated list"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={commitTags}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                      title="Add"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Field>
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Featured image
                    </p>
                    <button
                      type="button"
                      onClick={() => openMedia("featured")}
                      className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      <ImagePlus className="h-3 w-3" />
                      {featuredUrl ? "Replace" : "Choose"}
                    </button>
                    {featuredUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setFeaturedUrl("");
                          setFeaturedAlt("");
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
                        title="Remove the featured image"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {featuredUrl ? (
                    <div className="mt-2 flex gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={featuredUrl}
                        alt={featuredAlt}
                        className="h-16 w-28 shrink-0 rounded-lg border border-border object-cover"
                      />
                      <input
                        value={featuredAlt}
                        onChange={(e) => setFeaturedAlt(e.target.value)}
                        placeholder="Alt text — required by most platforms"
                        className={INPUT}
                      />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                      Not every platform accepts one, and where it does the panel below says so.
                      Shopify uses it as the article image; WordPress sets it as the featured media.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}
          {article && (
            <ArticleEditor
              ref={editorRef}
              html={html}
              onChange={setHtml}
              schemaMarkup={article.schemaMarkup}
              view={view}
              onViewChange={setView}
              onOpenMedia={() => openMedia("body")}
              onNotify={push}
              wordCount={liveWordCount}
              targetWordCount={article.seoMetrics.targetWordCount}
              title={draftTitle || title}
              siteName={workspaceName}
              siteUrl={website}
              slug={slug}
              authorName={authorName}
              excerpt={excerpt}
              featuredImageUrl={featuredUrl}
              featuredImageAlt={featuredAlt}
              language={language}
            />
          )}

          {/* Gated on the run, not on the draft. A run that was refused by the
              evidence gate has no page and is exactly when somebody needs to see
              which claim failed which check. Pipeline order: what it read about
              you, then what it read about the world. */}
          {pipeline.run && (
            <BusinessPanel run={pipeline.run} analysis={analysis} />
          )}
          {pipeline.run && (
            <EvidencePanel run={pipeline.run} load={pipeline.evidence} />
          )}

          {article && (
            <Card
              title="Publish"
              icon={Send}
              right={
                <span className="text-[11px] text-muted-foreground">
                  {selectedTarget ? selectedTarget.label : "no destination chosen"}
                </span>
              }
            >
              {targets.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  No destination is connected yet. WordPress, Shopify and hand-coded sites are
                  all connected in the Plugins tab — the article stays here either way, so
                  nothing is lost.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Field label="Destination">
                      <select
                        value={targetId || ""}
                        onChange={(e) => setTargetPick(e.target.value || null)}
                        className={SELECT}
                      >
                        {targets.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label} — {t.providerName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Publish as">
                      <select
                        value={contentType}
                        onChange={(e) => setContentTypePick(e.target.value as CmsContentType)}
                        className={SELECT}
                      >
                        {contentTypes.map((type) => (
                          <option key={type} value={type}>
                            {CONTENT_TYPE_LABELS[type] || type}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="State">
                      <select
                        value={status}
                        onChange={(e) => setStatusPick(e.target.value as CmsPublishStatus)}
                        className={SELECT}
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {PUBLISH_STATUS_LABELS[s] || s}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {taxonomyBusy && (
                    <p className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Reading the categories and authors on the site…
                    </p>
                  )}

                  {taxonomy?.supported && taxonomy.categories.length > 0 && (
                    <Field label={`Categories — ${categoryIds.length} chosen`}>
                      <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
                        {taxonomy.categories.map((cat) => (
                          <label key={cat.id} className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={categoryIds.includes(cat.id)}
                              onChange={(e) =>
                                setCategoryPick(
                                  e.target.checked
                                    ? [...categoryIds, cat.id]
                                    : categoryIds.filter((id) => id !== cat.id)
                                )
                              }
                              className="h-3 w-3 accent-[var(--primary)]"
                            />
                            <span className="text-[11px] text-foreground">{cat.name}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-1.5 flex gap-1.5">
                        <input
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void addCategory();
                            }
                          }}
                          placeholder="Create a new category on the site"
                          className={INPUT}
                        />
                        <button
                          type="button"
                          onClick={() => void addCategory()}
                          disabled={!newCategory.trim()}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                          title="Create"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </Field>
                  )}
                  {taxonomy?.supported && taxonomy.authors.length > 0 && (
                    <Field
                      label="Published as"
                      hint="The byline on the live site. The article's own author line comes from the brief."
                    >
                      <select
                        value={authorId ?? ""}
                        onChange={(e) =>
                          setAuthorPick(e.target.value ? Number(e.target.value) : null)
                        }
                        className={SELECT}
                      >
                        <option value="">The account that owns the connection</option>
                        {taxonomy.authors.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {taxonomy?.note && (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {taxonomy.note}
                    </p>
                  )}
                  {taxonomy?.error && (
                    <p className="text-[11px] leading-snug text-destructive">{taxonomy.error}</p>
                  )}

                  <button
                    type="button"
                    onClick={() => void publish()}
                    disabled={publishing || !article || !targetId}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {publishing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending to {selectedTarget?.label || "the site"}…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Publish as {PUBLISH_STATUS_LABELS[status] || status}
                      </>
                    )}
                  </button>
                  {!article && (
                    <p className="text-[11px] text-muted-foreground">
                      Generate an article first — publishing sends what is in the editor.
                    </p>
                  )}
                  {outcome && (
                    <div
                      className={`rounded-xl border p-3 ${
                        outcome.success
                          ? "border-primary/30 bg-primary/5"
                          : "border-destructive/30 bg-destructive/5"
                      }`}
                    >
                      <p
                        className={`flex items-center gap-1.5 text-xs font-semibold ${
                          outcome.success ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {outcome.success ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        {outcome.success
                          ? `Live on ${outcome.label || selectedTarget?.label || "the site"}${
                              outcome.status ? ` as ${outcome.status}` : ""
                            }`
                          : "It did not publish"}
                      </p>
                      {outcome.error && (
                        <p className="mt-1 text-[11px] leading-snug text-foreground">
                          {outcome.error}
                        </p>
                      )}
                      {outcome.url && (
                        <a
                          href={outcome.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-secondary"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open it on the site
                        </a>
                      )}
                      {outcome.warnings && outcome.warnings.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
                          {outcome.warnings.map((w) => (
                            <li key={w} className="text-[10px] leading-snug text-muted-foreground">
                              {w}
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Only ever non-zero when the run being published was a
                          verification run somebody approved, so the sentence names
                          the loop that produced it rather than appearing from
                          nowhere. The server marked them, not this component. */}
                      {!!outcome.appliedProposals && outcome.appliedProposals > 0 && (
                        <p className="mt-1.5 border-t border-border pt-1.5 text-[10px] leading-snug text-muted-foreground">
                          {outcome.appliedProposals} optimisation proposal
                          {outcome.appliedProposals === 1 ? " was" : "s were"} marked applied,
                          because this run was verifying{" "}
                          {outcome.appliedProposals === 1 ? "it" : "them"}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Not gated on a run: this card is about the weeks after publishing, and
              a workspace with no run in progress is exactly when somebody comes
              looking at how last month's articles are doing. Approving a proposal
              here starts a run and hands it to `walkVerifyRun` — it never writes to
              a live page. `reloadKey` changes when a publish records a new
              `PublishResult`, so the page that just went live shows up. */}
          <PerformancePanel
            workspaceId={workspaceId}
            onVerifyRun={(runId) => void walkVerifyRun(runId)}
            onNotice={(kind, message) => push(kind, message)}
            reloadKey={outcome?.publicationId}
          />

          {/*
            Connecting a site lives in the Plugins tab, next to every other
            connector. Two copies of a credential form means two places to debug
            one broken password, so this card only reports what is there.
          */}
          <Card
            title="Where it publishes"
            icon={Plug}
            right={
              <>
                <span className="text-[11px] text-muted-foreground">
                  {describeTargets(targets)}
                </span>
                <button
                  type="button"
                  onClick={() => void refreshTargets()}
                  disabled={targetsBusy}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50"
                  title="Re-read the destinations"
                >
                  <RefreshCw className={`h-3 w-3 ${targetsBusy ? "animate-spin" : ""}`} />
                </button>
              </>
            }
          >
            <div className="space-y-2.5">
              {targets.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Nothing is connected yet. Paste your site&apos;s address in the Plugins tab and
                  it will appear here, with its verification status.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {targets.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(t.status)}`} />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {t.label}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {t.providerName}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {relativeTime(t.lastVerifiedAt)}
                      </span>
                      {t.lastError && (
                        <p className="w-full text-[10px] leading-snug text-destructive">
                          {t.lastError}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {!encryptionReady && (
                <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] leading-snug text-foreground">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span>
                    <code className="font-mono">APP_ENCRYPTION_KEY</code> is not set on this
                    deployment, so no credential can be stored. Set it, then connect the site in
                    Plugins.
                  </span>
                </p>
              )}

              <Link
                href="/dashboard/plugins"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                <Plug className="h-3.5 w-3.5" />
                {targets.length ? "Manage in Plugins" : "Connect a site in Plugins"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-3">
          <Card
            title="What already ranks"
            icon={Search}
            right={
              <button
                type="button"
                onClick={() => void previewSerp()}
                disabled={serpBusy || !keyword.trim()}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {serpBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Check
              </button>
            }
          >
            {serpError && (
              <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] leading-snug text-foreground">
                {serpError}
              </p>
            )}
            {!serpData && !serpError && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                A generated article always looks at the live results first. Press Check to see
                them before you run one — the average length below is what the page you are
                competing with actually is.
              </p>
            )}
            {serpData && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Average length
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {serpData.estimatedAvgWordCount
                        ? `${serpData.estimatedAvgWordCount.toLocaleString()} words`
                        : "not readable"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Average headings
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {serpData.estimatedHeadingCount || "not readable"}
                    </p>
                  </div>
                </div>
                {serpData.estimatedAvgWordCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetWords(clampWords(serpData.estimatedAvgWordCount));
                      push(
                        "info",
                        `Target set to ${clampWords(
                          serpData.estimatedAvgWordCount
                        ).toLocaleString()} words — the average of the pages ranking now.`
                      );
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-secondary"
                  >
                    <ArrowRight className="h-3 w-3" />
                    Match that length
                  </button>
                )}
                {serpData.peopleAlsoAsk.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      People also ask
                    </p>
                    <ul className="space-y-1">
                      {serpData.peopleAlsoAsk.slice(0, 6).map((q) => (
                        <li key={q} className="text-[11px] leading-snug text-foreground">
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {serpData.relatedSearches.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Searched alongside it
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {serpData.relatedSearches.slice(0, 8).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setKeyword(r)}
                          title="Use this as the focus keyword"
                          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-foreground hover:bg-primary/10 hover:text-primary"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {serpData.topResults.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Ranking now
                    </p>
                    <ol className="space-y-1.5">
                      {serpData.topResults.slice(0, 5).map((r) => (
                        <li key={r.link} className="min-w-0">
                          <a
                            href={r.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-1.5 text-[11px] font-medium leading-snug text-foreground hover:text-primary"
                          >
                            <span className="mt-px shrink-0 text-[10px] font-bold text-muted-foreground">
                              {r.position}.
                            </span>
                            <span className="line-clamp-2">{r.title}</span>
                          </a>
                          {r.wordCount ? (
                            <span className="ml-4 text-[10px] text-muted-foreground">
                              {r.wordCount.toLocaleString()} words
                              {r.headingCount ? ` · ${r.headingCount} headings` : ""}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </Card>

          {article && <SeoSidebar article={article} keyword={keyword || draftTitle} />}
        </div>
      </div>
      <MediaStudioModal
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        seed={keyword.trim() || draftTitle || title.trim()}
        fallbackSeeds={[industry, workspaceName]}
        allowVideo={mediaSlot === "body"}
        title={mediaSlot === "featured" ? "Choose the featured image" : "Add media to the article"}
        onInsert={insertMedia}
        onNotify={push}
      />
      {/* The side-by-side answer, given the server's own rows: what each mode costs,
          what it runs, and the gate's sentence where it refused one. Picking a mode
          from here is the same state the toggle in the header writes. */}
      <ModeGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        modes={pipeline.modes}
        active={runMode}
        onPick={setRunMode}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
