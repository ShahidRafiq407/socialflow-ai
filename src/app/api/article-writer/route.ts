/**
 * ARTICLE WRITER API
 *
 * One POST endpoint, switched on `step`. Everything the Article Writer page does
 * that needs the server — SERP, topic ideas, generation, publishing — comes
 * through here so credentials and model keys stay server-side.
 *
 * Three rules this file enforces:
 *   - every step resolves the workspace by id AND checks the signed-in user owns
 *     it, so a workspace id in a request body is never taken on trust,
 *   - publishing goes through the CMS layer, so WordPress, Shopify and a
 *     hand-coded site are the same code path here,
 *   - a step that cannot do its job returns the reason. Nothing returns invented
 *     keywords, categories or scores as a "fallback".
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import type { ActionKey } from "@/lib/billing/actions";
import { getAction } from "@/lib/billing/actions";
import { billedRoute, entitlementResponse, unbilled } from "@/lib/billing/route";
import {
  checkAction,
  getFeatureUsageMap,
  getPlanContext,
  requireFeature,
} from "@/lib/billing/entitlements";
import { withMeterContext } from "@/lib/billing/meter";
import {
  createWPCategory,
  fetchWPAuthors,
  fetchWPCategories,
  fetchWPPostTypes,
  testWPConnection,
  type WPConfig,
} from "@/actions/wordpress";
import { fetchSerpAnalysis } from "@/actions/serp";
import { llm } from "@/lib/agents/llm";
import {
  advanceArticleRun,
  modeUnavailableReason,
  STAGE_BUDGET_MS,
  workspaceFacts,
} from "@/lib/agents/article/articleGraph";
import { generateSeoArticle } from "@/lib/agents/workers/article-generator";
import { normalizeBrief, readBriefRow } from "@/lib/article/brief";
import { loadEvidenceLedger } from "@/lib/article/evidenceStore";
import {
  createArticleRun,
  listArticleRuns,
  loadArtifacts,
  loadArticleRun,
  loadStageArtifact,
  readBrief,
  toRunView,
} from "@/lib/article/runStore";
import {
  isArticleRunMode,
  isArticleStageKey,
  stageCount,
  stageSpec,
} from "@/lib/article/stages";
import {
  listCmsTargetSummaries,
  loadCmsTarget,
  publishToCmsTarget,
  resolveDefaultCmsTarget,
} from "@/lib/cms";

import { describeCmsProviders } from "@/lib/cms/registry";
import { buildBrandProfile, splitBrandList } from "@/lib/brand/profile";
import { isEncryptionConfigured } from "@/lib/crypto";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { discoverInternalLinkCandidates } from "@/lib/seo/internalLinks";
import { suggestTopicIdeas } from "@/lib/seo/topicIdeas";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** The generator budgets 235s of work; the platform kills the function at 300s. */
export const maxDuration = 300;



// ---------------------------------------------------------------------------
// WORKSPACE + TARGET RESOLUTION
// ---------------------------------------------------------------------------

type OwnedWorkspace = NonNullable<Awaited<ReturnType<typeof loadOwnedWorkspace>>>;

/**
 * The workspace this request is for, only if the caller owns it.
 *
 * A workspace id arriving in a request body is attacker-controlled, so it is
 * checked against the signed-in user every time. With no id we fall back to the
 * workspace the header is currently pointing at, which is safe by construction.
 */
async function loadOwnedWorkspace(userId: string, workspaceId?: unknown) {
  const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
  if (id) {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: { brandDNA: true },
    });
    if (!workspace || workspace.userId !== userId) return null;
    return workspace;
  }
  return prisma.workspace.findFirst({
    ...(await activeWorkspaceQuery(userId)),
    include: { brandDNA: true },
  });
}

function denied() {
  return NextResponse.json(
    { error: "You do not have access to that workspace." },
    { status: 403 }
  );
}

/**
 * Every business fact the generator accepts, from the one place it is stored.
 *
 * `brandDNA.writingStyle` is a JSON blob, not a style string, so it goes through
 * the shared parser: the writer gets the offer, the customer problems, the
 * differentiator and the competitor set as separate facts instead of one
 * unreadable object it has to guess at.
 */
function brandParams(workspace: OwnedWorkspace) {
  const profile = buildBrandProfile(workspace);
  return {
    brandName: profile.brandName || workspace.name,
    industry: profile.industry || undefined,
    brandTone: profile.tone || undefined,
    targetAudience: profile.targetAudience || undefined,
    missionVision: profile.missionVision || undefined,
    writingStyle: profile.writingRules || undefined,
    businessWebsite: profile.website || undefined,
    customerProblems: profile.painPoints || undefined,
    differentiator: profile.differentiator || undefined,
    ctaOffer: profile.ctaOffer || undefined,
    competitorBrands: profile.competitors ? splitBrandList(profile.competitors) : undefined,
    forbiddenWords: profile.forbiddenWords.length ? profile.forbiddenWords : undefined,
  };
}

/**
 * The site an article is being written for, and the target it will publish to.
 *
 * Resolved in one place because three steps need it and they must agree: the
 * internal-link crawl, the staged pipeline's brief, and the old one-shot
 * generator. The order is deliberate — an explicit website in the body wins, then
 * the connected target's own URL, then the workspace's website. Empty string
 * means no site is connected, which is a fact the caller reports rather than
 * papers over.
 */
async function resolvePublishSite(
  workspaceId: string,
  body: any,
  workspaceWebsite?: string | null
) {
  const target =
    typeof body?.targetId === "string" && body.targetId.trim()
      ? await loadCmsTarget(workspaceId, body.targetId.trim())
      : await resolveDefaultCmsTarget(workspaceId);

  const siteUrl =
    String(body?.targetWebsite || "").trim() ||
    target?.meta.siteUrl ||
    (target?.meta.shopDomain ? `https://${target.meta.shopDomain}` : "") ||
    String(workspaceWebsite || "").trim() ||
    "";

  return { target, siteUrl };
}

/**
 * The WordPress credentials behind a target, for the taxonomy calls that only
 * WordPress has. Other platforms answer honestly that they have no categories.
 */
async function wordPressConfigFor(
  workspaceId: string,
  targetId?: unknown
): Promise<{ config: WPConfig | null; siteUrl?: string; reason?: string }> {
  const id = typeof targetId === "string" && targetId.trim() ? targetId.trim() : "";
  const target = id
    ? await loadCmsTarget(workspaceId, id)
    : await resolveDefaultCmsTarget(workspaceId);

  if (!target) {
    return {
      config: null,
      reason:
        "No publishing site is connected yet. Add one from the Publish panel to load its categories and authors.",
    };
  }
  if (target.providerKey !== "wordpress") {
    return {
      config: null,
      reason: `${target.label} is not a WordPress site, so it has no categories or authors to load.`,
    };
  }
  const siteUrl = target.meta.siteUrl || "";
  const username = target.credentials.username || "";
  const appPassword = target.credentials.appPassword || "";
  if (!siteUrl || !username || !appPassword) {
    return {
      config: null,
      reason: `${target.label} is missing its credentials. Reconnect it from the Publish panel.`,
    };
  }
  return { config: { siteUrl, username, appPassword }, siteUrl };
}

/** Strips the model's markdown fence without swallowing the payload. */
function unfence(raw: unknown): string {
  return String(raw ?? "")
    .replace(/```(?:json|html)?/gi, "")
    .replace(/```/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// ROUTE
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// WHAT EACH STEP COSTS
//
// A step names an action and the catalogue says the price; nothing here invents a
// number. The important line is the last one: an unrecognised step is charged as
// an article, because the step that writes the article is this route's fallthrough
// default. A typo in a request body must not be a free pipeline.
//
// `FREE_STEPS` is therefore the whole exemption list, and everything on it is
// exempt for a reason that can be checked: it makes no model call and buys no
// third-party request. `advance` is on it not because it is free — it is the most
// expensive thing here — but because its run was paid for at the door and charging
// again per stage would bill one article twelve times.
// ---------------------------------------------------------------------------

const FREE_STEPS = new Set([
  // The staged pipeline. Charged once at `run-start`, metered per stage below.
  "advance",
  // Reads. A lapsed plan must still be able to open what it already paid for.
  "run-state",
  "run-artifact",
  "run-bundle",
  "run-evidence",
  "run-modes",
  "publications",
  "performance-read",
  "optimization-status",
  "optimization-dismiss",
  // Connections and publishing: CMS APIs and our own crawler, no model.
  "targets",
  "target-meta",
  "wp-connect",
  "create-category",
  "publish",
  "wp-publish",
  "performance-sync",
  "internal-links",
]);

function stepAction(step: string, body: any): ActionKey | null {
  if (FREE_STEPS.has(step)) return null;

  switch (step) {
    // Both of these buy a pipeline rather than run one: the credits are taken when
    // the run is created, and every stage afterwards advances something already
    // paid for. `optimize-verify` always starts a deep run, whatever the page it
    // came from was originally written by.
    case "run-start":
      return body?.mode === "deep" ? "article.deep" : "article.quick";
    case "optimize-verify":
      return "article.deep";

    case "optimize-scan":
      return "article.optimizeScan";
    case "serp-only":
      return "article.serp";
    case "topic-ideas":
    case "suggest-keyword":
    case "suggest-title":
    case "suggest-categories":
    case "enhance-seo":
      return "article.assist";

    // `generate` is the one-shot writer and this route's default step, so it is
    // also what an unknown step falls through to. Priced as a Quick article
    // because that is what it produces.
    default:
      return "article.quick";
  }
}

/** What the charge is filed against, so a ledger row points at a real thing. */
function stepReference(step: string, body: any): string | null {
  if (step === "optimize-verify") {
    const id = String(body?.optimizationId || "").trim();
    return id || null;
  }
  const keyword = String(body?.keyword || body?.brief?.keyword || "").trim();
  return keyword ? keyword.slice(0, 120) : null;
}

interface ArticleStepContext {
  req: Request;
  requestStartedAt: number;
  body: any;
  step: string;
  workspace: OwnedWorkspace;
  workspaceId: string;
  userId: string;
}

export async function POST(req: Request) {
  try {
    // The stage budget is measured from here, not from where the stage starts, so
    // the deadline it honours is the platform's ceiling minus this handler's own
    // work rather than a fresh 240 seconds.
    const requestStartedAt = Date.now();
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}) as any);
    const step = typeof body?.step === "string" && body.step ? body.step : "generate";

    const workspace = await loadOwnedWorkspace(userId, body?.workspaceId);
    if (!workspace) {
      return body?.workspaceId
        ? denied()
        : NextResponse.json({ error: "No workspace found for your account." }, { status: 404 });
    }
    const workspaceId = workspace.id;

    const ctx: ArticleStepContext = {
      req,
      requestStartedAt,
      body,
      step,
      workspace,
      workspaceId,
      userId,
    };

    // ── the gate, the charge and the meter scope ──────────────────────────
    // One call instead of the old feature-less `checkAIAccess`: the plan is asked
    // about the thing being done, the credits are taken before the work starts,
    // every model call inside lands in the usage table under this action, and a
    // non-2xx answer refunds. A step that costs nothing runs unwrapped.
    const action = stepAction(step, body);
    if (action) {
      return await billedRoute(
        {
          userId,
          action,
          workspaceId,
          referenceId: stepReference(step, body),
          surface: "article",
          measureCost: true,
        },
        () => runArticleStep(ctx)
      );
    }

    return await runArticleStep(ctx);
  } catch (error: any) {
    console.error("[article-writer] error:", error);
    return NextResponse.json(
      { error: error?.message || "The request could not be completed." },
      { status: 500 }
    );
  }
}

async function runArticleStep(ctx: ArticleStepContext): Promise<NextResponse> {
  const { req, requestStartedAt, body, step, workspace, workspaceId, userId } = ctx;

  try {
    // =====================================================================
    // STEP: start a run
    //
    // Creates the run and one row per stage it intends to execute, and runs
    // nothing. The mode is taken from the request and stored on the row — quick or
    // deep, chosen by the person — and is never derived from a plan code or a
    // subscription tier. A mode this build cannot finish is refused here rather
    // than discovered at the stage that is missing.
    // =====================================================================
    if (step === "run-start") {
      const mode = isArticleRunMode(body?.mode) ? body.mode : "quick";
      const unavailable = modeUnavailableReason(mode);
      if (unavailable) return NextResponse.json({ error: unavailable }, { status: 400 });

      // The form may post its fields flat or nested under `brief`. Both are read
      // the same way, and the normaliser is the only thing that decides what a
      // field means.
      const raw = (body?.brief && typeof body.brief === "object" ? body.brief : body) as any;
      const { target, siteUrl } = await resolvePublishSite(workspaceId, raw, workspace.website);
      const brief = normalizeBrief({
        ...raw,
        // Resolved server-side so all twenty-three stages read the same site the
        // publish step will use, instead of each one guessing from a row.
        targetId: target?.id,
        targetWebsite: siteUrl || undefined,
      });
      if (!brief) {
        return NextResponse.json(
          { error: "A focus keyword is required to start a run." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        run: await createArticleRun({ workspaceId, mode, brief }),
        brief,
        // Connection status only. Connecting a site belongs in the Plugins tab, and
        // the Article Writer reports what is there rather than asking again.
        site: {
          url: siteUrl,
          connected: Boolean(siteUrl),
          target: target
            ? { id: target.id, providerKey: target.providerKey, label: target.label }
            : null,
        },
      });
    }

    // =====================================================================
    // STEP: advance a run by exactly one stage
    //
    // Twenty-three stages cannot share a function the platform kills at 300
    // seconds, so each request runs one and returns the row it wrote. The stage is
    // read from the run, never from the body: a browser holding stale state cannot
    // re-run a stage that has already been paid for, and two tabs pressing
    // continue cannot both buy the same one.
    // =====================================================================
    if (step === "advance") {
      const runId = String(body?.runId || "").trim();
      const run = runId ? await loadArticleRun(workspaceId, runId) : null;
      if (!run) {
        return NextResponse.json(
          { error: "That run could not be found in this workspace." },
          { status: 404 }
        );
      }

      // The run was paid for when it was created, so this spends no credits. It is
      // still gated, and gated on the article tab rather than on this run's own
      // mode: a plan that lost Deep may finish the deep run it already bought, and
      // a plan with no article tab at all may advance nothing. Without this, a
      // lapsed account keeps a working 23-stage pipeline for as long as it has an
      // unfinished run lying around.
      try {
        await requireFeature(userId, "article.quick");
      } catch (gateErr) {
        const refusal = entitlementResponse(gateErr);
        if (!refusal) throw gateErr;
        return refusal;
      }

      // Attributed to the action that paid for it, so the stage's model calls land
      // on the same row the run's charge is measured against. This is the only
      // reason `article.deep` at 350 credits can be checked against what a deep run
      // actually costs us — the spend is spread over twenty-three requests, and
      // this is what ties them together.
      const runMode = run.mode === "deep" ? "deep" : "quick";
      const outcome = await withMeterContext(
        {
          userId,
          workspaceId,
          feature: "article",
          action: runMode === "deep" ? "article.deep" : "article.quick",
          referenceId: run.id,
        },
        () =>
          advanceArticleRun({
            workspace: workspaceFacts(workspace),
            runId,
            // A closed tab or a pressed Stop aborts the stage. The row goes back to
            // claimable, so nothing is lost and continue runs it again.
            signal: req.signal,
            deadline: requestStartedAt + STAGE_BUDGET_MS,
          })
      );
      if (!outcome) {
        return NextResponse.json(
          { error: "That run could not be found in this workspace." },
          { status: 404 }
        );
      }
      return NextResponse.json({
        // Blocked is not a failed request: the stage did its job and refused the
        // page. Only a stage that threw reports failure.
        success: outcome.outcome !== "failed",
        run: outcome.view,
        stage: outcome.stage,
        outcome: outcome.outcome,
        next: outcome.next,
        message: outcome.message,
        stopped: outcome.stopped,
        modelCalls: outcome.modelCalls,
      });
    }

    // =====================================================================
    // STEP: read a run, or the recent ones
    //
    // The only thing the progress list is ever drawn from — every tick on screen
    // is a row that said done. Deliberately outside the AI entitlement: a plan
    // that has lapsed still has to be able to open the runs it paid for.
    // =====================================================================
    if (step === "run-state") {
      const runId = String(body?.runId || "").trim();
      if (!runId) {
        return NextResponse.json({
          success: true,
          runs: await listArticleRuns(workspaceId, Number(body?.limit) || 10),
        });
      }
      const run = await loadArticleRun(workspaceId, runId);
      if (!run) {
        return NextResponse.json(
          { error: "That run could not be found in this workspace." },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        run: toRunView(run),
        // The brief comes back too, so a reload can redraw the form and the publish
        // panel from the run itself instead of whatever the browser was holding.
        brief: readBriefRow(readBrief(run)),
      });
    }

    // =====================================================================
    // STEP: one stage's artifact
    //
    // Artifacts are not inlined into the run view — some are large, and the panel
    // that knows how to read one asks for it by name.
    // =====================================================================
    if (step === "run-artifact") {
      const stage = body?.stage;
      if (!isArticleStageKey(stage)) {
        return NextResponse.json(
          { error: "That is not a stage of this pipeline." },
          { status: 400 }
        );
      }
      const artifact = await loadStageArtifact(workspaceId, body?.runId, stage);
      return NextResponse.json({
        success: true,
        stage,
        artifact,
        note:
          artifact === null
            ? `“${stageSpec(stage).label}” has not produced anything for this run.`
            : undefined,
      });
    }

    // =====================================================================
    // STEP: every artifact this run has produced
    //
    // The editor needs most of them at once — the draft, the SEO report, the links,
    // the structured data, the score, the gate — and eleven round trips to draw one
    // screen is eleven chances to render half a page. The run *view* still never
    // inlines an artifact; this is the panel that reads them asking for them by
    // name, in one request, for a run this workspace owns.
    //
    // Only `done` stages contribute, so nothing here comes from a stage that
    // blocked or threw.
    // =====================================================================
    if (step === "run-bundle") {
      const run = await loadArticleRun(workspaceId, body?.runId);
      if (!run) {
        return NextResponse.json(
          { error: "That run could not be found in this workspace." },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        run: toRunView(run),
        brief: readBriefRow(readBrief(run)),
        artifacts: await loadArtifacts(String(run.id)),
      });
    }

    // =====================================================================
    // STEP: the evidence ledger for one run
    //
    // Two tables rather than the stage artifacts: the research stage and the
    // evidence gate both write rows so provenance outlives the run, and months
    // later "where did this number come from" has to be answerable by a URL, a
    // publisher and a date rather than by a JSON blob on a stage row.
    //
    // Read-only and outside the AI entitlement — it spends nothing, and a plan
    // that has lapsed still has to be able to show what a published article was
    // built on. Ownership is inside the query (`run: { workspaceId }`), so a run
    // id in a request body cannot reach another workspace's sources.
    // =====================================================================
    if (step === "run-evidence") {
      const ledger = await loadEvidenceLedger(workspaceId, body?.runId);
      return NextResponse.json({
        success: true,
        ledger,
        // Empty is not one fact. A quick run never had a research stage; a deep run
        // that stopped before stage ten has not got there yet; and a deep run that
        // finished with nothing recorded is a third thing entirely. The panel says
        // which, so it needs the run to say it from.
        note:
          ledger.sources.length === 0 && ledger.claims.length === 0
            ? "No sources or checked claims are recorded for this run."
            : undefined,
      });
    }

    // =====================================================================
    // STEP: which pipeline this account can actually run
    //
    // Two separate questions, asked together and never merged into one answer:
    //
    //   does this build have an agent behind every stage of the mode, and
    //   does the plan in force include the mode, have allowance left this period,
    //   and cover the credits the run costs?
    //
    // The first is a fact about the deployment. The second is a fact about the
    // subscription, and it is the one the screen used to learn far too late: Deep
    // is an Agency feature, so on Pro both buttons rendered enabled and the
    // refusal arrived only after the brief was filled in and Write was pressed.
    //
    // `selectable` and `available` are deliberately different. A mode the plan
    // does not include cannot be chosen at all — there is nothing to configure
    // and the sections below would describe work that will not happen. A mode the
    // plan does include but whose allowance or balance is spent stays choosable,
    // because that reason belongs next to the mode it is about, and it is fixed by
    // waiting or topping up rather than by changing plan.
    //
    // On the free list: this reads the subscription row and the period counter. It
    // spends nothing, charges nothing, and claims nothing.
    // =====================================================================
    if (step === "run-modes") {
      // One context, both checks. Passing it in rather than the user id means the
      // subscription is read once for the pair instead of once per mode.
      const plan = await getPlanContext(userId);
      const usage = await getFeatureUsageMap(plan);

      const modes = await Promise.all(
        (["quick", "deep"] as const).map(async (mode) => {
          const action: ActionKey = mode === "deep" ? "article.deep" : "article.quick";
          const spec = getAction(action);
          const missing = modeUnavailableReason(mode);
          const gate = await checkAction(plan, action);
          const locked = gate.reason === "FEATURE_LOCKED";
          // The counter the cap is kept on, which is not always the action's own
          // feature — `article.serp` and `article.assist` both count against Quick.
          const meter = usage[spec.countsAgainst ?? spec.feature];

          return {
            mode,
            stages: stageCount(mode),
            credits: gate.cost,
            available: !missing && gate.allowed,
            selectable: !missing && !locked,
            locked,
            reason: missing || (gate.allowed ? undefined : gate.message),
            plan: gate.plan,
            requiredPlan: gate.requiredPlan,
            // Present only where this plan caps the mode by count. Deep is capped
            // on no plan that has it, so it reports no meter rather than a zero.
            cap: meter?.cap,
            used: meter?.used,
          };
        })
      );

      return NextResponse.json({ success: true, plan: plan.plan, modes });
    }

    // =====================================================================
    // STEP: publish targets (WordPress / Shopify / coded site)
    // =====================================================================
    if (step === "targets") {
      return NextResponse.json({
        success: true,
        targets: await listCmsTargetSummaries(workspaceId),
        providers: describeCmsProviders(),
        encryptionReady: isEncryptionConfigured(),
      });
    }

    // =====================================================================
    // STEP: taxonomy for a connected WordPress target
    // =====================================================================
    if (step === "target-meta" || step === "wp-connect") {
      const { config, siteUrl, reason } = await wordPressConfigFor(workspaceId, body?.targetId);
      if (!config) {
        return NextResponse.json({
          success: true,
          supported: false,
          categories: [],
          authors: [],
          postTypes: [],
          note: reason,
        });
      }

      const connected = await testWPConnection(config);
      if (!connected) {
        return NextResponse.json({
          success: false,
          supported: true,
          wpConnected: false,
          error:
            "WordPress refused the stored credentials. Re-verify the site in the Publish panel.",
        });
      }

      const [categories, authors, postTypes] = await Promise.all([
        fetchWPCategories(config),
        fetchWPAuthors(config),
        fetchWPPostTypes(config),
      ]);

      return NextResponse.json({
        success: true,
        supported: true,
        wpConnected: true,
        categories,
        authors,
        postTypes,
        siteUrl,
      });
    }

    // =====================================================================
    // STEP: create a WordPress category
    // =====================================================================
    if (step === "create-category") {
      const name = String(body?.name || "").trim();
      if (!name) {
        return NextResponse.json({ error: "A category name is required." }, { status: 400 });
      }

      const { config, reason } = await wordPressConfigFor(workspaceId, body?.targetId);
      if (!config) return NextResponse.json({ error: reason }, { status: 400 });

      const category = await createWPCategory(config, name);
      if (!category) {
        return NextResponse.json(
          { error: `WordPress would not create the category "${name}".` },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, category });
    }

    // =====================================================================
    // STEP: publish the finished article to a connected target
    // =====================================================================
    if (step === "publish" || step === "wp-publish") {
      const payload = body?.publishPayload;
      if (!payload?.title || !payload?.html) {
        return NextResponse.json(
          { error: "The article title and HTML are required to publish." },
          { status: 400 }
        );
      }

      const targetId =
        typeof body?.targetId === "string" && body.targetId.trim()
          ? body.targetId.trim()
          : (await resolveDefaultCmsTarget(workspaceId))?.id;

      if (!targetId) {
        return NextResponse.json(
          {
            error:
              "No publishing target is connected. Add your WordPress, Shopify or coded site in the Publish panel first.",
          },
          { status: 400 }
        );
      }

      const result = await publishToCmsTarget(workspaceId, targetId, {
        title: String(payload.title),
        html: String(payload.html),
        contentType: payload.contentType === "page" ? "page" : "post",
        status:
          payload.status === "draft" || payload.status === "pending" ? payload.status : "publish",
        excerpt: payload.excerpt ? String(payload.excerpt) : undefined,
        slug: payload.slug ? String(payload.slug) : undefined,
        metaTitle: payload.metaTitle ? String(payload.metaTitle) : undefined,
        metaDescription: payload.metaDescription ? String(payload.metaDescription) : undefined,
        focusKeyword: payload.focusKeyword ? String(payload.focusKeyword) : undefined,
        schemaMarkup: payload.schemaMarkup ? String(payload.schemaMarkup) : undefined,
        tags: Array.isArray(payload.tags)
          ? payload.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15)
          : undefined,
        categoryIds: Array.isArray(payload.categoryIds)
          ? payload.categoryIds.map((id: any) => Number(id)).filter((n: number) => n > 0)
          : undefined,
        authorId: Number(payload.authorId) > 0 ? Number(payload.authorId) : undefined,
        featuredImageUrl: payload.featuredImageUrl ? String(payload.featuredImageUrl) : undefined,
        featuredImageAlt: payload.featuredImageAlt ? String(payload.featuredImageAlt) : undefined,
      });

      // The live URL is the join key to Search Console, and until this point the
      // step threw it away. Recorded on success only, and a failure to record it is
      // reported as a warning rather than turned into a failed publish: the article
      // is live either way, and saying otherwise would have somebody publish twice.
      let publication: { id: string; url: string } | null = null;
      let publicationWarning = "";
      let appliedProposals = 0;
      if (result.success && result.url) {
        try {
          const { normalizePageUrl } = await import("@/lib/connectors/searchConsole");
          const url = normalizePageUrl(result.url);
          if (url) {
            const { recordPublication, applyOptimizationsForRun } = await import(
              "@/lib/article/performanceStore"
            );
            const runId = typeof body?.runId === "string" ? body.runId.trim() : null;
            publication = await recordPublication(workspaceId, {
              runId,
              targetId: result.targetId,
              providerKey: result.providerKey,
              url,
              remoteId: result.id ? String(result.id) : null,
              title: String(payload.title),
              keyword: payload.focusKeyword ? String(payload.focusKeyword) : null,
              status: result.status || undefined,
            });
            // Publishing the run that was verifying a proposal is what applies it.
            // This is the only place a proposal becomes `applied`, and it happens
            // because a person pressed Publish — nothing was inserted into the live
            // page by this app on its own.
            if (runId) appliedProposals = await applyOptimizationsForRun(workspaceId, runId);
          }
        } catch (error: unknown) {
          publicationWarning =
            "The article published, but this workspace could not record the URL for performance tracking.";
          console.error("[article-writer] recordPublication failed", error);
        }
      }

      return NextResponse.json(
        {
          ...result,
          publicationId: publication?.id,
          publicationUrl: publication?.url,
          ...(appliedProposals ? { appliedProposals } : {}),
          ...(publicationWarning
            ? { warnings: [...(result.warnings || []), publicationWarning] }
            : {}),
        },
        { status: result.success ? 200 : 502 }
      );
    }

    // =====================================================================
    // STEP: publications, performance and the optimisation loop
    //
    // Read steps, and on `FREE_STEPS` deliberately: reading what a live page is
    // found for spends no model calls, and a lapsed plan must still be able to see
    // how the articles it already paid for are doing.
    //
    // `performance-sync` does call Google, with the workspace's own read-only
    // credentials. It is still not charged — it buys rows, not tokens.
    // =====================================================================
    if (step === "publications") {
      const { listPublications, listOptimizations } = await import(
        "@/lib/article/performanceStore"
      );
      const [publications, optimizations] = await Promise.all([
        listPublications(workspaceId, Number(body?.limit) || 50),
        listOptimizations(workspaceId, { statuses: ["proposed", "verified"], limit: 30 }),
      ]);
      return NextResponse.json({ success: true, publications, optimizations });
    }

    if (step === "performance-read") {
      const { findPublication, readPerformance, listOptimizations } = await import(
        "@/lib/article/performanceStore"
      );
      const publication = await findPublication(workspaceId, String(body?.publicationId || ""));
      if (!publication) {
        return NextResponse.json(
          { error: "That published page could not be found in this workspace." },
          { status: 404 }
        );
      }

      const { summarizePerformance } = await import("@/lib/article/performance");
      const days = Number(body?.days) || 90;
      const [rows, optimizations] = await Promise.all([
        readPerformance(workspaceId, publication.url, days),
        listOptimizations(workspaceId, { publicationId: publication.id, limit: 20 }),
      ]);

      return NextResponse.json({
        success: true,
        publication,
        // Totalled in the same file the browser imports, so the panel and this
        // response cannot disagree about what the rows add up to.
        summary: summarizePerformance(rows, publication.url),
        optimizations,
      });
    }

    /**
     * PERFORMANCE SYNC — the one step here that spends somebody else's quota.
     *
     * Three things it refuses to guess at:
     *
     *   The property. Search Console keys data by property, not by domain, and a
     *   workspace can be verified on several. `resolveProperty` picks the longest
     *   URL prefix that actually contains this page and falls back to the domain
     *   property; if nothing covers the page, that is an answer, not a retry.
     *
     *   The page URL. `equals` on the `page` dimension is case-sensitive and
     *   exact, so `queryPagePerformance` tries the few legitimate spellings of the
     *   same address and stores under whichever one returned rows.
     *
     *   Which days are final. `incompleteFrom` comes back from the API and is
     *   handed to the browser, so a still-counting Tuesday is labelled rather than
     *   drawn as a cliff.
     */
    if (step === "performance-sync") {
      const { findPublication, savePerformanceRows, readPerformance } = await import(
        "@/lib/article/performanceStore"
      );
      const publication = await findPublication(workspaceId, String(body?.publicationId || ""));
      if (!publication) {
        return NextResponse.json(
          { error: "That published page could not be found in this workspace." },
          { status: 404 }
        );
      }

      const { getConnectorCredentials } = await import("@/lib/connectors/credentials");
      const connection = await getConnectorCredentials(workspaceId, "search-console");
      if (!connection) {
        return NextResponse.json(
          {
            error:
              "Search Console is not connected for this workspace. Add it in Plugins to read what this page is found for.",
            needsConnection: "search-console",
          },
          { status: 400 }
        );
      }

      const creds = {
        clientId: connection.credentials.clientId || "",
        clientSecret: connection.credentials.clientSecret || "",
        refreshToken: connection.credentials.refreshToken || "",
      };

      const { listProperties, resolveProperty, dayRange, queryPagePerformance } = await import(
        "@/lib/connectors/searchConsole"
      );

      const list = await listProperties(creds);
      if (!list.success) {
        return NextResponse.json({ error: list.error || "Search Console refused the request." }, { status: 502 });
      }

      const property = resolveProperty(publication.url, list.properties || []);
      if (!property) {
        return NextResponse.json(
          {
            error: `None of the Search Console properties this account can read cover ${publication.url}. Verify that property first, then sync.`,
          },
          { status: 400 }
        );
      }

      const window = dayRange(Number(body?.days) || 28);
      const performance = await queryPagePerformance(creds, {
        property: property.siteUrl,
        page: publication.url,
        startDate: window.startDate,
        endDate: window.endDate,
      });
      if (!performance.success) {
        return NextResponse.json(
          { error: performance.error || "Search Console refused the query." },
          { status: 502 }
        );
      }

      const { toPerformanceRows, summarizePerformance } = await import("@/lib/article/performance");
      // Stored under the publication's own URL, not `matchedPage`: the stored page
      // is the join key for everything else in this workspace, and the spelling
      // Search Console happened to accept is an API detail.
      const rows = toPerformanceRows(publication.url, performance.rows || []);
      const written = await savePerformanceRows(workspaceId, {
        page: publication.url,
        startDate: window.startDate,
        endDate: window.endDate,
        rows,
      });

      const stored = await readPerformance(workspaceId, publication.url, 90);
      return NextResponse.json({
        success: true,
        publication,
        property: property.siteUrl,
        matchedPage: performance.matchedPage || publication.url,
        window: { from: written.from, to: written.to },
        written: written.written,
        incompleteFrom: performance.incompleteFrom || "",
        summary: summarizePerformance(stored, publication.url),
      });
    }

    /**
     * OPTIMISATION SCAN — the only paid step in this section.
     *
     * Reads the live page, ranks the queries mechanically, then lets a model that
     * has actually read the page decide which of those candidates are real. The row
     * it writes is a proposal: `sections` a person can approve, `answered` queries
     * that turned out to be covered already, and `declined` ones with a reason.
     *
     * A scan with nothing to approve does not create a row. `performance.ts` has the
     * reason written down — an empty proposal rendered as a card is worse than no
     * card, because somebody would press Approve on it.
     */
    if (step === "optimize-scan") {
      const { findPublication, readPerformance, saveOptimization } = await import(
        "@/lib/article/performanceStore"
      );
      const publication = await findPublication(workspaceId, String(body?.publicationId || ""));
      if (!publication) {
        return NextResponse.json(
          { error: "That published page could not be found in this workspace." },
          { status: 404 }
        );
      }

      const { summarizePerformance, rankOpportunities } = await import("@/lib/article/performance");
      const rows = await readPerformance(workspaceId, publication.url, Number(body?.days) || 90);
      const summary = summarizePerformance(rows, publication.url);
      if (summary.days === 0) {
        return NextResponse.json(
          {
            error:
              "There are no stored Search Console rows for this page yet. Sync it first — a scan with nothing measured behind it would be guesswork.",
          },
          { status: 400 }
        );
      }

      const { fetchPage } = await import("@/lib/agents/article/fetchPage");
      const live = await fetchPage(publication.url, { maxChars: 30_000, signal: req.signal });
      if (!live.ok || !live.text.trim()) {
        return NextResponse.json(
          {
            error: `The live page could not be read${
              live.status ? ` (HTTP ${live.status})` : ""
            }${live.error ? `: ${live.error}` : ""}. Nothing was assumed about what it covers.`,
          },
          { status: 502 }
        );
      }

      const opportunities = rankOpportunities(summary, {
        title: live.title,
        headings: live.headings,
        body: live.text,
      });

      const { scanForOptimizations } = await import("@/lib/agents/article/optimize");
      const { newMeter } = await import("@/lib/agents/article/router");
      const meter = newMeter();
      const scan = await scanForOptimizations({
        page: publication.url,
        title: live.title || publication.title,
        keyword: publication.keyword || undefined,
        headings: live.headings,
        text: live.text,
        summary,
        opportunities,
        meter,
        signal: req.signal,
      });

      const dropped = scan.dropped;
      const note = [
        `Scanned ${opportunities.length} candidate quer${opportunities.length === 1 ? "y" : "ies"} against the live page (${live.headings.length} headings read).`,
        dropped.queries || dropped.sections || dropped.edits
          ? `Discarded: ${dropped.queries} query mention${dropped.queries === 1 ? "" : "s"}, ${dropped.sections} section${dropped.sections === 1 ? "" : "s"}, ${dropped.edits} edit${dropped.edits === 1 ? "" : "s"} that named something not measured or not on the page.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const optimizationId = scan.actionable
        ? await saveOptimization(workspaceId, {
            publicationId: publication.id,
            triggers: opportunities,
            proposal: scan.proposal,
            status: "proposed",
            note,
          })
        : null;

      return NextResponse.json({
        success: true,
        publication,
        summary,
        opportunities,
        proposal: scan.proposal,
        actionable: scan.actionable,
        optimizationId,
        dropped,
        note,
        modelCalls: meter.calls,
        page: { status: live.status, finalUrl: live.finalUrl, headings: live.headings.length },
      });
    }

    /**
     * VERIFY A PROPOSAL — by starting a real run, not by asserting anything.
     *
     * This is the part of the loop the plan is most specific about: an approved
     * proposal goes through the same stages the first draft went through. So it does
     * not get a special lightweight path. It gets an `ArticleRun` in deep mode,
     * carrying the approved headings and the facts the proposal said it needed, and
     * that run does its own research, faces the same evidence gate, and is advanced
     * by the same `advance` endpoint one stage at a time.
     *
     * Nothing is written to the live page here, and nothing is written to it later
     * without somebody pressing Publish on the draft that run produces.
     *
     * Called twice, it returns the run it already started. A double-click must not
     * buy a second pipeline.
     */
    if (step === "optimize-verify") {
      const { findOptimization, updateOptimization } = await import(
        "@/lib/article/performanceStore"
      );
      const optimization = await findOptimization(workspaceId, String(body?.optimizationId || ""));
      if (!optimization) {
        return NextResponse.json(
          { error: "That proposal could not be found in this workspace." },
          { status: 404 }
        );
      }
      if (optimization.verifyRunId) {
        const existing = await loadArticleRun(workspaceId, optimization.verifyRunId);
        if (existing) {
          // The second click gets the first click's run, and pays nothing for it.
          // `unbilled` releases the reservation this request took at the door: a
          // deep run is 350 credits, and a double-click is the easiest way in the
          // product to be charged twice for one pipeline.
          return unbilled(
            NextResponse.json({
              success: true,
              alreadyStarted: true,
              run: toRunView(existing),
              optimizationId: optimization.id,
            }),
            "the verification run was already started"
          );
        }
      }

      const proposal = optimization.proposal;
      if (!proposal || (proposal.sections.length === 0 && proposal.edits.length === 0)) {
        return NextResponse.json(
          {
            error:
              "That proposal has nothing to verify: no section and no edit survived the scan. Re-scan the page instead.",
          },
          { status: 400 }
        );
      }

      // The query the update is for. The queries a proposed section names are the
      // point of the update, so the highest-weight trigger one of them names wins
      // over the keyword the page was originally written for — that keyword is
      // already answered, which is why the page is live.
      const named = new Set(
        [...proposal.sections, ...proposal.edits].flatMap((item) => item.queries)
      );
      const keyword =
        optimization.triggers.find((trigger) => named.has(trigger.query))?.query ||
        optimization.keyword ||
        optimization.triggers[0]?.query ||
        "";
      if (!keyword) {
        return NextResponse.json(
          { error: "This proposal names no query, so there is nothing to research." },
          { status: 400 }
        );
      }

      // The approved points, in the proposal's own words. Stage 3 hands these to the
      // outline as `requiredElements`, and everything a section needs established is
      // in the list — which is what sends it through research and the evidence gate
      // rather than into the draft on trust.
      const mustCover = [
        ...proposal.sections.map((section) =>
          [
            `New section "${section.heading}": ${section.covers.join("; ")}`,
            section.needsResearch.length
              ? `It must establish, with a source: ${section.needsResearch.join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" ")
        ),
        ...proposal.edits.map((edit) => `Change "${edit.target}": ${edit.change}`),
      ];

      // Resolved exactly the way `run-start` resolves it, so the update run is
      // written for — and publishes back to — the site the page came from.
      const { target, siteUrl } = await resolvePublishSite(
        workspaceId,
        { targetId: optimization.targetId || undefined },
        workspace.website
      );
      const brief = normalizeBrief({
        keyword,
        title: optimization.title,
        // Set server-side from a publication this workspace owns, never from the body.
        updateUrl: optimization.page,
        mustCover,
        targetId: target?.id,
        targetWebsite: siteUrl || undefined,
      });
      if (!brief) {
        return NextResponse.json(
          { error: "A focus keyword is required to start a verification run." },
          { status: 400 }
        );
      }

      const run = await createArticleRun({ workspaceId, mode: "deep", brief });
      const linked = await updateOptimization(workspaceId, optimization.id, {
        // Still `proposed`: the run has been created, not passed. Only the evidence
        // gate's own row can make this `verified`.
        status: "proposed",
        verifyRunId: run.id,
      });

      return NextResponse.json({
        success: true,
        run,
        brief,
        linked,
        optimizationId: optimization.id,
        stages: run.total,
      });
    }

    /**
     * WHERE A PROPOSAL HAS GOT TO — read from the run, not from the browser.
     *
     * `verified` is the one word on this card that has to mean something, so it is
     * never sent in a request body. It is derived here from the verification run's
     * own stage rows: the evidence gate finished, or the gate blocked the run. A
     * person can dismiss a proposal, and publishing marks it applied. Nobody can
     * type "verified".
     */
    if (step === "optimization-status") {
      const { findOptimization, updateOptimization } = await import(
        "@/lib/article/performanceStore"
      );
      const optimization = await findOptimization(workspaceId, String(body?.optimizationId || ""));
      if (!optimization) {
        return NextResponse.json(
          { error: "That proposal could not be found in this workspace." },
          { status: 404 }
        );
      }
      if (!optimization.verifyRunId) {
        return NextResponse.json({
          success: true,
          status: optimization.status,
          run: null,
          reason: "No verification run has been started for this proposal yet.",
        });
      }

      const row = await loadArticleRun(workspaceId, optimization.verifyRunId);
      if (!row) {
        return NextResponse.json({
          success: true,
          status: optimization.status,
          run: null,
          reason: "The verification run for this proposal is no longer on file.",
        });
      }
      const run = toRunView(row);
      const gate = run.stages.find((stage) => stage.stage === "evidence_gate");

      let status = optimization.status;
      let reason = "";
      if (run.blockedBy === "evidence_gate") {
        status = "failed";
        reason =
          run.blockedReason ||
          "The evidence gate stopped the verification run: something the proposal wanted to say could not be supported.";
      } else if (gate?.status === "done") {
        status = "verified";
        reason = "The verification run passed the same evidence gate the first draft passed.";
      } else if (gate?.status === "skipped") {
        reason =
          "The verification run reached the evidence gate and skipped it, so nothing has been verified yet.";
      } else {
        reason = `The verification run is at step ${run.position} of ${run.total}.`;
      }

      // Only written when it changed, and never backwards out of a decision a
      // person already made.
      const changed =
        status !== optimization.status && optimization.status !== "dismissed" && optimization.status !== "applied"
          ? await updateOptimization(workspaceId, optimization.id, { status, note: reason })
          : false;

      return NextResponse.json({
        success: true,
        status: changed ? status : optimization.status,
        changed,
        reason,
        run: { id: run.id, status: run.status, position: run.position, total: run.total, currentStage: run.currentStage },
        evidenceGate: gate?.status ?? "pending",
      });
    }

    /**
     * DISMISS — the only status a person is allowed to set by hand.
     *
     * Approving is not a status change, it is starting a verification run, and
     * applying is publishing one. What is left is the human judgement this whole
     * loop is built around: "not worth doing", with a reason if they want to give
     * one.
     */
    if (step === "optimization-dismiss") {
      const { updateOptimization } = await import("@/lib/article/performanceStore");
      const dismissed = await updateOptimization(
        workspaceId,
        String(body?.optimizationId || ""),
        {
          status: "dismissed",
          note: typeof body?.note === "string" ? body.note : undefined,
        }
      );
      return dismissed
        ? NextResponse.json({ success: true, status: "dismissed" })
        : NextResponse.json(
            { error: "That proposal could not be found in this workspace." },
            { status: 404 }
          );
    }

    // =====================================================================
    // STEP: SERP analysis only
    // =====================================================================
    if (step === "serp-only") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) return NextResponse.json({ error: "A keyword is required." }, { status: 400 });

      const res = await fetchSerpAnalysis(keyword, {
        targetCountry: body?.targetCountry,
        measureCompetitors: body?.measureCompetitors !== false,
      });
      // A 200 with `success: false` is how this step has always reported a refused
      // search, and the page relies on that shape to show the reason inline. So the
      // refund happens here rather than by changing the status: no results read,
      // nothing to charge for.
      if (!res.success) {
        return unbilled(
          NextResponse.json({ success: false, serpData: null, serpError: res.error }),
          "the live results could not be read"
        );
      }
      return NextResponse.json({
        success: true,
        serpData: res.data,
        serpError: res.error,
      });
    }

    // =====================================================================
    // STEP: internal link candidates from the user's own site
    // =====================================================================
    if (step === "internal-links") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) return NextResponse.json({ error: "A keyword is required." }, { status: 400 });

      const { siteUrl } = await resolvePublishSite(workspaceId, body, workspace.website);

      const found = await discoverInternalLinkCandidates({
        siteUrl,
        keyword,
        context: String(body?.title || ""),
        limit: Number(body?.limit) > 0 ? Number(body.limit) : 8,
      });
      return NextResponse.json({ success: true, siteUrl, ...found });

    }

    // =====================================================================
    // STEP: trending topics from this workspace's Brand DNA
    // =====================================================================
    if (step === "topic-ideas" || step === "suggest-keyword") {
      const recent = await prisma.contentPost
        .findMany({
          where: { workspaceId },
          select: { title: true },
          orderBy: { createdAt: "desc" },
          take: 25,
        })
        .catch(() => [] as { title: string }[]);

      const profile = buildBrandProfile(workspace);
      const result = await suggestTopicIdeas({
        brandName: profile.brandName || workspace.name,
        industry: profile.industry || undefined,
        targetAudience: profile.targetAudience || undefined,
        tone: profile.tone || undefined,
        missionVision: profile.missionVision || undefined,
        writingStyle: profile.writingRules || undefined,
        customerProblems: profile.painPoints || undefined,
        differentiator: profile.differentiator || undefined,
        ctaOffer: profile.ctaOffer || undefined,
        forbiddenWords: profile.forbiddenWords.length ? profile.forbiddenWords : undefined,
        existingTitles: recent.map((r) => r.title || "").filter(Boolean),
        targetCountry: body?.targetCountry,
        seedHint: body?.seedHint || body?.keyword,
      });

      const payload = {
        success: result.ideas.length > 0,
        ...result,
        // The old shape, so a keyword list still works where only that is needed.
        keywords: result.ideas.map((i) => i.keyword),
      };
      // No ideas is not a finding, it is a failed suggestion — and this step reports
      // it at 200 because the panel renders the reason. Refunded rather than kept.
      if (result.ideas.length === 0) {
        return unbilled(NextResponse.json(payload), "no topic ideas were produced");
      }
      return NextResponse.json(payload);
    }

    // =====================================================================
    // STEP: title options, grounded in the live SERP
    // =====================================================================
    if (step === "suggest-title") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) {
        return NextResponse.json(
          { error: "A keyword is required before titles can be written." },
          { status: 400 }
        );
      }

      let competitorTitles = "";
      let serpNote: string | undefined;
      const serp = await fetchSerpAnalysis(keyword, {
        targetCountry: body?.targetCountry,
        measureCompetitors: false,
      });
      if (serp.success && serp.data?.topResults?.length) {
        competitorTitles = serp.data.topResults
          .slice(0, 7)
          .map((r, i) => `${i + 1}. "${r.title}"`)
          .join("\n");
      } else {
        serpNote = serp.error || "The live results could not be read, so these are unbenchmarked.";
      }

      const brand = brandParams(workspace);
      const prompt = `You write article titles that win the click against the pages currently ranking.

BRAND
- Brand: ${brand.brandName}
${brand.industry ? `- Industry: ${brand.industry}\n` : ""}${brand.targetAudience ? `- Audience: ${brand.targetAudience}\n` : ""}${brand.brandTone ? `- Tone: ${brand.brandTone}\n` : ""}${brand.forbiddenWords?.length ? `- Never use these words: ${brand.forbiddenWords.join(", ")}\n` : ""}
KEYWORD: "${keyword}"
${competitorTitles ? `\nRANKING NOW — beat these on click-through:\n${competitorTitles}\n` : ""}
RULES
1. "${keyword}" appears in the first half of every title.
2. 50-65 characters each. Count them.
3. Four different angles: how-to, numbered list, comparison, and a specific-result deep dive.
4. Any number or year must be one a reader could verify from the article, not decoration.
5. Sound like a person who has done the thing. No "unlock", "unleash", "game-changer", "dive into".

Return ONLY a JSON array of 4 strings.`;

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const titles = JSON.parse(unfence(response.content));
        const clean = Array.isArray(titles)
          ? titles.map((t: any) => String(t || "").trim()).filter(Boolean).slice(0, 4)
          : [];
        if (clean.length === 0) throw new Error("The model returned no usable titles.");
        return NextResponse.json({ success: true, titles: clean, note: serpNote });
      } catch (error: any) {
        // No template fallback: an invented title is worse than none.
        return NextResponse.json(
          {
            success: false,
            error: `Titles could not be generated (${error?.message || "unknown error"}). Try again.`,
          },
          { status: 502 }
        );
      }
    }

    // =====================================================================
    // STEP: category suggestions from the site's real taxonomy
    // =====================================================================
    if (step === "suggest-categories") {
      const keyword = String(body?.keyword || "").trim();
      if (!keyword) return NextResponse.json({ error: "A keyword is required." }, { status: 400 });

      const existing = Array.isArray(body?.existingCategories)
        ? body.existingCategories
            .map((c: any) => (typeof c === "string" ? c : c?.name))
            .map((c: any) => String(c || "").trim())
            .filter(Boolean)
            .slice(0, 80)
        : [];

      const prompt = `Article keyword: "${keyword}"
Article title: "${String(body?.title || keyword)}"

The site's existing categories: ${existing.length ? existing.join(", ") : "(none yet)"}

Pick up to 3 of the existing categories this article belongs in. Only propose a NEW category name when none of the existing ones fit, and never propose more than 2 new ones.

Return ONLY a JSON object: {"existing":["..."],"new":["..."]}`;

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const parsed = JSON.parse(unfence(response.content));
        const pick = (value: any) =>
          Array.isArray(value)
            ? value.map((v: any) => String(v || "").trim()).filter(Boolean).slice(0, 3)
            : [];
        const existingPicks = pick(parsed?.existing).filter((name: string) =>
          existing.some((e: string) => e.toLowerCase() === name.toLowerCase())
        );
        const newPicks = pick(parsed?.new).slice(0, 2);
        return NextResponse.json({
          success: true,
          existing: existingPicks,
          new: newPicks,
          // Flat list for callers that just want names.
          suggested: [...existingPicks, ...newPicks],
        });
      } catch (error: any) {
        return NextResponse.json(
          {
            success: false,
            error: `Categories could not be suggested (${error?.message || "unknown error"}).`,
          },
          { status: 502 }
        );
      }
    }

    // =====================================================================
    // STEP: rewrite the meta of an article that already exists
    // =====================================================================
    if (step === "enhance-seo") {
      const keyword = String(body?.keyword || "").trim();
      const title = String(body?.title || "").trim();
      if (!keyword || !title) {
        return NextResponse.json(
          { error: "A keyword and a title are required to rewrite the meta." },
          { status: 400 }
        );
      }

      const brand = brandParams(workspace);
      const prompt = `Rewrite the search metadata for this article.

Title: "${title}"
Focus keyword: "${keyword}"
${brand.brandName ? `Brand: ${brand.brandName}\n` : ""}${brand.targetAudience ? `Audience: ${brand.targetAudience}\n` : ""}${brand.brandTone ? `Tone: ${brand.brandTone}\n` : ""}${brand.forbiddenWords?.length ? `Never use: ${brand.forbiddenWords.join(", ")}\n` : ""}${body?.excerpt ? `\nCurrent excerpt: ${String(body.excerpt).slice(0, 500)}\n` : ""}
RULES
- metaTitle: 50-60 characters, keyword in the first 30.
- metaDescription: 140-158 characters, keyword once, ends with a reason to click. No ellipsis.
- slug: lowercase, hyphens, 3-6 words, keyword included, no stop words, no year.
- tags: 5-8 lowercase topical tags a reader would browse by. No brand name, no single letters.
- Describe what the article actually delivers. Do not promise anything the title does not.

Return ONLY JSON: {"metaTitle":"...","metaDescription":"...","slug":"...","tags":["..."]}`;

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const parsed = JSON.parse(unfence(response.content));
        const slug = String(parsed?.slug || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 80);

        return NextResponse.json({
          success: true,
          // No score is reported here: this step rewrites meta, it does not audit
          // the article. The generator's own checklist is the only real score.
          metaTitle: String(parsed?.metaTitle || "").trim().slice(0, 70),
          metaDescription: String(parsed?.metaDescription || "").trim().slice(0, 175),
          slug,
          tags: Array.isArray(parsed?.tags)
            ? parsed.tags
                .map((t: any) => String(t || "").trim().toLowerCase())
                .filter((t: string) => t.length > 1)
                .slice(0, 8)
            : [],
        });
      } catch (error: any) {
        return NextResponse.json(
          {
            success: false,
            error: `The metadata could not be rewritten (${error?.message || "unknown error"}).`,
          },
          { status: 502 }
        );
      }
    }

    // =====================================================================
    // STEP (default): write the article
    //
    // Order matters. The SERP read and the internal-link crawl both feed the
    // blueprint, so they happen first and in parallel; the generator then gets
    // the whole Brand DNA, the exact word target and every toggle the UI shows.
    // =====================================================================
    const keyword = String(body?.keyword || "").trim();
    if (!keyword) {
      return NextResponse.json(
        { error: "A focus keyword is required to write an article." },
        { status: 400 }
      );
    }

    const { target, siteUrl: targetWebsite } = await resolvePublishSite(
      workspaceId,
      body,
      workspace.website
    );

    const wantsInternal = body?.enableInternalLinks !== false;
    const wantsExternal = body?.enableExternalLinks !== false;
    const title = String(body?.title || "").trim();

    const [serpResult, internal] = await Promise.all([
      // External citations and the competitive benchmark both come from here, so
      // it still runs when only internal linking is off.
      fetchSerpAnalysis(keyword, {
        targetCountry: body?.targetCountry,
        measureCompetitors: true,
      }),
      wantsInternal && targetWebsite
        ? discoverInternalLinkCandidates({
            siteUrl: targetWebsite,
            keyword,
            context: title,
            limit: 10,
          })
        : Promise.resolve({ candidates: [], note: undefined as string | undefined }),
    ]);

    const preWarnings: string[] = [];
    if (!serpResult.success && wantsExternal) {
      preWarnings.push(
        `Live search results were unavailable (${serpResult.error || "unknown reason"}), so external citations were limited to what could be verified.`
      );
    }
    if (wantsInternal && !targetWebsite) {
      preWarnings.push(
        "No website is connected, so no internal links were added. Connect a publishing target or set the workspace website."
      );
    } else if (wantsInternal && internal.note) {
      preWarnings.push(internal.note);
    }

    const article = await generateSeoArticle({
      keyword,
      title: title || undefined,
      serpData: serpResult.success ? serpResult.data : undefined,

      ...brandParams(workspace),
      // A tone picked in the form overrides the Brand DNA default for this one
      // run. Left empty, the brand's own tone is what the generator gets.
      brandTone: String(body?.tone || "").trim() || workspace.brandDNA?.tone || undefined,
      authorName: String(body?.authorName || "").trim() || undefined,

      // The exact count wins over the preset; the generator measures and closes
      // the gap rather than hoping the model counted.
      articleSize: typeof body?.articleSize === "string" ? body.articleSize : undefined,
      targetWordCount: Number(body?.targetWordCount) > 0 ? Number(body.targetWordCount) : undefined,
      pointOfView: typeof body?.pointOfView === "string" ? body.pointOfView : undefined,
      language: typeof body?.language === "string" ? body.language : undefined,
      targetCountry: typeof body?.targetCountry === "string" ? body.targetCountry : undefined,

      targetWebsite: targetWebsite || undefined,
      internalLinkCandidates: internal.candidates,

      enableYoutube: body?.enableYoutube !== false,
      enableFaq: body?.enableFaq !== false,
      enableToc: body?.enableToc !== false,
      enableTakeaways: body?.enableTakeaways !== false,
      enableSources: body?.enableSources !== false,
      enableInternalLinks: wantsInternal,
      enableExternalLinks: wantsExternal,
      enableImages: body?.enableImages !== false,
      imageCount: Number.isFinite(Number(body?.imageCount)) ? Number(body.imageCount) : undefined,
      imageStyle: typeof body?.imageStyle === "string" ? body.imageStyle : undefined,
      humanize: body?.humanize !== false,
    });

    return NextResponse.json({
      success: true,
      article: {
        ...article,
        warnings: [...preWarnings, ...article.warnings],
      },
      serpData: serpResult.success ? serpResult.data : null,
      serpError: serpResult.success ? undefined : serpResult.error,
      internalLinkCandidates: internal.candidates,
      // The target the article was written for, so the editor can publish without
      // re-resolving it and cannot silently publish somewhere else.
      target: target ? { id: target.id, providerKey: target.providerKey, label: target.label } : null,
    });
  } catch (error: any) {
    console.error("[article-writer] error:", error);
    return NextResponse.json(
      { error: error?.message || "The request could not be completed." },
      { status: 500 }
    );
  }
}
