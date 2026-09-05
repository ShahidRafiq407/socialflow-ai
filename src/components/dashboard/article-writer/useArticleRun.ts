"use client";

/**
 * ONE RUN, ONE STAGE AT A TIME, FROM THE BROWSER
 *
 * The platform kills a function at 300 seconds and the pipeline is longer than
 * that, so the loop that walks it lives here: start the run, then ask the server
 * to advance it, once per stage, until there is nothing left to advance.
 *
 * What this hook is careful about, in the order it matters:
 *
 *   1. It renders only what a row said. Every tick, every duration and every model
 *      call comes back from the database in the `advance` response. There is no
 *      timer here inventing progress and no optimistic stage.
 *   2. A stage that failed is not retried automatically. Each stage is a paid call,
 *      and a loop that retried a failing one would spend money until the tab was
 *      closed. It stops, keeps everything the run produced, and `resume` is the
 *      person's decision.
 *   3. Stop actually stops. The in-flight request is aborted, which aborts the
 *      stage server-side, and the loop does not queue the next one.
 *
 * It holds no credentials and no artifacts of its own: `runId` plus whatever the
 * server last said about that run.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readEvidenceLedger, type EvidenceLedger } from "@/lib/article/artifacts";
import type { ArticleBrief } from "@/lib/article/brief";
import { stagesFor, type ArticleRunMode, type ArticleStageKey } from "@/lib/article/stages";
import type { ArticleRunView } from "@/lib/article/types";
import { articleFromRun, analysisFromRun, type RunAnalysis, type RunArticle } from "./runArticle";

/** How a run ended, from the point of view of the person who started it. */
export type RunEnding = "done" | "blocked" | "failed" | "stopped" | "busy";

export interface RunOutcome {
  ending: RunEnding;
  view: ArticleRunView;
  /** The stage that ended it, when one did. */
  stage?: ArticleStageKey;
  /** The blocker's own words, or the error. Empty only when the run finished. */
  message?: string;
  /** Assembled from the artifacts, or null when no stage produced a page. */
  result: RunArticle | null;
  /**
   * What the run established before it wrote — the business it read and the site
   * it crawled. Separate from `result` because those two stages run first and a
   * run that never reached the writer still has both of them to show.
   */
  analysis: RunAnalysis;
  brief?: ArticleBrief;
}

/** A line per stage that has said something, newest last. Drawn from the responses. */
export interface RunEvent {
  stage: ArticleStageKey;
  outcome: string;
  message?: string;
  modelCalls: number;
}

/**
 * What the server says about one pipeline, for this account, right now.
 *
 * Two kinds of "no" live here and they are not the same kind. `selectable` is false
 * when the mode cannot be chosen at all — the build is missing a stage, or the plan
 * does not include the mode, so there is nothing to configure. `available` is false
 * for that and also when the allowance for the period is spent or the balance will
 * not cover the run: choosable, describable, just not startable this minute.
 */
export interface ModeAvailability {
  mode: ArticleRunMode;
  stages: number;
  /** May a run be started right now? What the Write button reads. */
  available: boolean;
  /** May this mode be chosen? What the mode buttons read. */
  selectable?: boolean;
  /** The plan does not include this mode. Distinguishes an upgrade from a wait. */
  locked?: boolean;
  /** The gate's own sentence. Shown as-is; never reworded here. */
  reason?: string;
  /** Credits one run of this mode costs. */
  credits?: number;
  plan?: string;
  /** The cheapest plan that lifts whatever refused. */
  requiredPlan?: string;
  /**
   * That plan's display name, resolved on the server.
   *
   * Sent rather than looked up here: the plan catalogue in the browser bundle is the
   * code default, and the admin's renamed or repriced plans are only ever patched
   * into the server's copy.
   */
  requiredPlanName?: string;
  /** Per-period ceiling and what is gone, where the plan caps this mode by count. */
  cap?: number;
  used?: number;
  /** Set until the server has answered. Nothing about the plan is known yet. */
  pending?: boolean;
}

/**
 * Both modes, before the server has answered.
 *
 * The stage counts come from `stages.ts`, which the browser already has, so the
 * buttons and the guide draw on the first paint instead of a round-trip later.
 *
 * They start allowed, and `pending` says why that is not a claim: an unanswered
 * question is not a verdict, and the alternative — starting refused — turns one
 * failed fetch into a page whose Write button is dead with no reason on it. The
 * charge is taken at `run-start` and refused there with the same sentence, so the
 * worst an optimistic button can do is arrive at that refusal a moment later.
 */
function unaskedModes(): ModeAvailability[] {
  return (["quick", "deep"] as const).map((mode) => ({
    mode,
    stages: stagesFor(mode).length,
    available: true,
    selectable: true,
    pending: true,
  }));
}
/** A stage held by another request. Waited out, not fought over. */
const BUSY_WAIT_MS = 3_000;
const BUSY_LIMIT = 5;

interface AdvanceResponse {
  run?: ArticleRunView;
  stage?: ArticleStageKey;
  outcome?: string;
  next?: ArticleStageKey | null;
  message?: string;
  stopped?: boolean;
  modelCalls?: number;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * The sentence the server stated about a refusal, when it stated one.
 *
 * Every route in this app answers a refusal with `error`, and the whole point of
 * that is to be shown. A generic "the request failed" in its place is how a
 * specific, actionable reason — a lapsed plan, a run in another workspace, a
 * stage another tab is holding — becomes a shrug.
 */
function statedError(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const body = data as { error?: unknown; message?: unknown };
  for (const value of [body.error, body.message]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** A thrown thing's own words, or the fallback. Never `[object Object]`. */
function reasonFrom(thrown: unknown, fallback: string): string {
  if (thrown instanceof Error && thrown.message.trim()) return thrown.message;
  if (typeof thrown === "string" && thrown.trim()) return thrown;
  return fallback;
}

export interface UseArticleRunInput {
  workspaceId: string;
  /** Raised for anything the user should see while a run is walking. */
  onNotice?: (kind: "info" | "error", message: string) => void;
}

export function useArticleRun({ workspaceId, onNotice }: UseArticleRunInput) {
  const [run, setRun] = useState<ArticleRunView | null>(null);
  const [brief, setBrief] = useState<ArticleBrief | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [walking, setWalking] = useState(false);
  const [modes, setModes] = useState<ModeAvailability[]>(unaskedModes);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  // The notice callback is read from inside the walking loop, never during render.
  // It is held in a ref so a parent that re-renders with a fresh closure does not
  // rebuild `walk` and restart the loop, and it is assigned in an effect because a
  // ref written during render is not safe under concurrent rendering.
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    noticeRef.current = onNotice;
  }, [onNotice]);

  /**
   * One request shape, and a non-2xx answer throws the server's own sentence.
   *
   * Returns `unknown` on purpose: every caller below names the fields it reads and
   * asserts the shape it expects at that one line, so a response that changes shape
   * fails where it is read instead of somewhere downstream that assumed a field.
   */
  const call = useCallback(
    async (
      step: string,
      payload: Record<string, unknown>,
      signal?: AbortSignal
    ): Promise<unknown> => {
      const res = await fetch("/api/article-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, workspaceId, ...payload }),
        signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          statedError(data) || `The request failed (HTTP ${res.status}).`
        );
      }
      return data ?? {};
    },
    [workspaceId]
  );

  /**
   * Which pipeline this account can run, asked once.
   *
   * Two things at once: whether the build has every stage, and what the plan in
   * force allows. Both come from the server because neither is knowable in a
   * browser, and a mode that is refused is shown with the gate's own sentence
   * rather than hidden — a missing option with no explanation is the thing people
   * file bugs about, and a locked one is where an upgrade gets decided.
   */
  useEffect(() => {
    let live = true;
    void call("run-modes", {})
      .then((data) => {
        const listed = (data as { modes?: unknown }).modes;
        if (live && Array.isArray(listed) && listed.length) {
          setModes(listed as ModeAvailability[]);
        }
      })
      .catch(() => {
        // Not fatal: the seeded rows stay, so the buttons keep working and
        // `run-start` refuses with the same sentence this would have shown.
      });
    return () => {
      live = false;
    };
  }, [call]);

  /** Every artifact the run has, assembled into the shape the editor reads. */
  const bundle = useCallback(
    async (
      runId: string
    ): Promise<{ result: RunArticle | null; analysis: RunAnalysis; brief?: ArticleBrief }> => {
      const data = (await call("run-bundle", { runId })) as {
        brief?: ArticleBrief | null;
        artifacts?: Record<string, unknown> | null;
      };
      const loaded = data.brief ?? undefined;
      const artifacts = data.artifacts ?? {};
      return {
        result: loaded ? articleFromRun(artifacts, loaded) : null,
        // Not conditional on the brief: the business and inventory stages read the
        // workspace, not the brief, so their artifacts stand on their own.
        analysis: analysisFromRun(artifacts),
        brief: loaded,
      };
    },
    [call]
  );
  /**
   * The evidence ledger for one run, on demand.
   *
   * Not part of `bundle`: it is two more queries for up to 120 sources and 200
   * claims, and it is read by a panel that is closed until somebody opens it. The
   * response is put back through the same guard the server used, because a row
   * that crossed HTTP is as untrusted as one that came out of a model — the five
   * checks decide `status`, so a ledger cannot arrive claiming a claim passed.
   */
  const evidence = useCallback(
    async (runId: string): Promise<EvidenceLedger> => {
      const data = (await call("run-evidence", { runId })) as { ledger?: unknown };
      return (
        readEvidenceLedger(data.ledger) ?? { sources: [], claims: [], allowed: 0, blocked: 0 }
      );
    },
    [call]
  );

  /**
   * Walk the run to its end, or to the first thing that stops it.
   *
   * The loop is bounded by the stage count plus a small allowance, so a server that
   * kept answering `busy` or handing back the same stage cannot spin here forever.
   */
  const walk = useCallback(
    async (runId: string, view: ArticleRunView): Promise<RunOutcome> => {
      const controller = new AbortController();
      abortRef.current = controller;
      stoppedRef.current = false;
      setWalking(true);

      let latest = view;
      let busy = 0;
      const limit = stagesFor(view.mode).length + BUSY_LIMIT + 2;

      try {
        for (let step = 0; step < limit; step++) {
          if (stoppedRef.current) break;

          let data: AdvanceResponse;
          try {
            data = (await call("advance", { runId }, controller.signal)) as AdvanceResponse;
          } catch (thrown) {
            // An abort is the Stop button, not a failure of the pipeline. The stage
            // row goes back to claimable server-side, so nothing was lost.
            if (stoppedRef.current || controller.signal.aborted) break;
            throw thrown;
          }

          if (data.run) {
            latest = data.run;
            setRun(latest);
          }
          if (data.stage) {
            setEvents((prev) => [
              ...prev,
              {
                stage: data.stage as ArticleStageKey,
                outcome: String(data.outcome || ""),
                message: data.message,
                modelCalls: Number(data.modelCalls) || 0,
              },
            ]);
          }

          if (data.outcome === "busy") {
            busy++;
            if (busy > BUSY_LIMIT) {
              return {
                ending: "busy",
                view: latest,
                stage: data.stage,
                message:
                  data.message ||
                  "Another tab is running this article. Nothing was lost — reopen the run there, or come back once it has finished.",
                ...(await bundle(runId)),
              };
            }
            await wait(BUSY_WAIT_MS, controller.signal);
            continue;
          }
          busy = 0;

          if (data.outcome === "blocked" || data.outcome === "failed") {
            return {
              ending: data.stopped ? "stopped" : (data.outcome as RunEnding),
              view: latest,
              stage: data.stage,
              message: data.message,
              ...(await bundle(runId)),
            };
          }

          // `skipped` is a stage this run did not need. It advances like any other.
          if (data.outcome === "skipped" && data.message) {
            noticeRef.current?.("info", data.message);
          }

          if (!data.next) break;
        }

        return {
          ending: stoppedRef.current ? "stopped" : "done",
          view: latest,
          message: stoppedRef.current
            ? "You stopped the run. Every stage that finished is saved, and Continue picks up from the one that did not."
            : undefined,
          ...(await bundle(runId)),
        };
      } finally {
        setWalking(false);
        abortRef.current = null;
      }
    },
    [bundle, call]
  );
  /**
   * Start a run and walk it.
   *
   * The brief is posted once, normalised server-side and stored on the row, so
   * every stage reads the same brief no matter how many requests it takes.
   */
  const start = useCallback(
    async (mode: ArticleRunMode, fields: Record<string, unknown>): Promise<RunOutcome> => {
      setError(null);
      setEvents([]);
      setRun(null);
      setBrief(null);
      try {
        const started = (await call("run-start", { mode, brief: fields })) as {
          run?: ArticleRunView;
          brief?: ArticleBrief;
        };
        const view = started.run;
        if (!view?.id) throw new Error("The run could not be started.");
        setRun(view);
        if (started.brief) setBrief(started.brief);
        const outcome = await walk(view.id, view);
        if (outcome.brief) setBrief(outcome.brief);
        return outcome;
      } catch (thrown) {
        const message = reasonFrom(thrown, "The run could not be started.");
        setError(message);
        throw thrown;
      }
    },
    [call, walk]
  );

  /** Pick up a run that stopped — the same loop, from whatever stage the row says. */
  const resume = useCallback(
    async (runId: string): Promise<RunOutcome> => {
      setError(null);
      try {
        const data = (await call("run-state", { runId })) as {
          run?: ArticleRunView;
          brief?: ArticleBrief;
        };
        const view = data.run;
        if (!view?.id) throw new Error("That run could not be read.");
        setRun(view);
        if (data.brief) setBrief(data.brief);
        const outcome = await walk(view.id, view);
        if (outcome.brief) setBrief(outcome.brief);
        return outcome;
      } catch (thrown) {
        const message = reasonFrom(thrown, "That run could not be continued.");
        setError(message);
        throw thrown;
      }
    },
    [call, walk]
  );

  /** Abort the stage in flight and stop the loop. Recorded, not silent. */
  const stop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** What is on the wire right now, for the button and the progress list. */
  const activeStage = useMemo<ArticleStageKey | null>(
    () => run?.stages.find((stage) => stage.status === "running")?.stage ?? null,
    [run]
  );

  const modelCalls = useMemo(
    () => (run?.stages ?? []).reduce((sum, stage) => sum + stage.modelCalls, 0),
    [run]
  );

  return {
    run,
    brief,
    events,
    walking,
    modes,
    error,
    activeStage,
    modelCalls,
    start,
    resume,
    stop,
    evidence,
  };
}
