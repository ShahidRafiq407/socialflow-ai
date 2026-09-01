"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  Globe,
  ImagePlus,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import type { GrowthPlanTask, GrowthStrategy } from "@/lib/types/growth";
import {
  updateGrowthTaskCaption,
  setGrowthTaskMedia,
  deleteGrowthTaskPost,
  publishGrowthTaskNow,
} from "@/actions/goals";
import {
  ActionButton,
  Chip,
  ConfirmButton,
  CopyButton,
  EmptyState,
  LiveLink,
  MediaPreview,
  SectionCard,
  StatusChip,
  fmtDateTime,
} from "./shared";
import type { GoalHQData } from "./types";

/**
 * Today tab — the work that actually goes out today.
 *
 * Generation runs through the SSE execute route with an AbortController per
 * task plus one for the whole batch, so every Generate has a Stop that really
 * cancels the upstream call. Media has Regenerate / Replace / Remove, captions
 * have Edit / Save / Cancel, and Delete is two-step.
 */

interface Runtime {
  status?: string;
  postId?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  caption?: string;
  shortUrl?: string | null;
  liveUrl?: string | null;
  scheduledFor?: string | null;
  error?: string | null;
  needsDestination?: boolean;
  warning?: string | null;
  // article-only
  title?: string;
  wordCount?: number;
  seoScore?: number;
  hasSchema?: boolean;
  deleted?: boolean;
}

/**
 * A plan task with whatever this session has learned about it layered on top.
 * The runtime fields are deliberately wider than the plan's (`string | null`
 * instead of a literal union) because they carry server responses, so the plan
 * versions are omitted rather than intersected.
 */
type TaskView = Omit<
  GrowthPlanTask,
  "status" | "mediaUrl" | "mediaType" | "shortUrl" | "liveUrl" | "error"
> &
  Runtime;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function TodayTab({
  data,
  strategy,
  onToast,
  onGoToTab,
  onRefresh,
}: {
  data: GoalHQData;
  strategy: GrowthStrategy | null;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onGoToTab: (tab: string) => void;
  onRefresh: () => void;
}) {
  const [runtime, setRuntime] = useState<Record<string, Runtime>>({});
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [runningTasks, setRunningTasks] = useState<string[]>([]);
  const [runningAll, setRunningAll] = useState(false);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const [generateVisuals, setGenerateVisuals] = useState(true);
  const [scheduleNow, setScheduleNow] = useState(true);

  const batchAbort = useRef<AbortController | null>(null);
  const taskAborts = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    return () => {
      batchAbort.current?.abort();
      taskAborts.current.forEach((c) => c.abort());
    };
  }, []);

  // Captions of already-generated posts come from the activity feed, so the
  // editor opens with the real text rather than an empty box.
  const captionByPostId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of data.activity) {
      if (item.postId && item.captionPreview) map[item.postId] = item.captionPreview;
    }
    return map;
  }, [data.activity]);

  const tasks = (strategy?.todayPlan || []).filter((t) => !runtime[t.id]?.deleted);

  const merged = (task: GrowthPlanTask): TaskView => {
    const r = runtime[task.id] || {};
    return {
      ...task,
      ...r,
      status: r.status || task.status,
      postId: r.postId || task.postId,
      mediaUrl: r.mediaUrl !== undefined ? r.mediaUrl : task.mediaUrl,
      mediaType: r.mediaType !== undefined ? r.mediaType : task.mediaType,
      shortUrl: r.shortUrl ?? task.shortUrl,
      liveUrl: r.liveUrl ?? task.liveUrl,
      needsDestination: r.needsDestination ?? task.needsDestination,
      error: r.error ?? task.error,
    };
  };

  const patch = (taskId: string, next: Runtime) =>
    setRuntime((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...next } }));

  // ── SSE runner ────────────────────────────────────────────────────────────
  const run = async (taskIds: string[] | undefined, controller: AbortController) => {
    const res = await fetch("/api/growth/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: data.workspaceId,
        taskIds,
        generateVisuals,
        scheduleNow,
        concurrency: 3,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not start generation.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      for (const frame of frames) {
        const lines = frame.split("\n");
        const event = lines.find((l) => l.startsWith("event: "))?.slice(7).trim();
        const raw = lines.find((l) => l.startsWith("data: "))?.slice(6);
        if (!event || !raw) continue;

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          continue;
        }

        if (event === "batch_started") {
          setBatchNote(
            payload.skippedByCap > 0
              ? `${payload.message} ${payload.skippedByCap} task${
                  payload.skippedByCap === 1 ? "" : "s"
                } held back by your daily cap of ${payload.dailyCap}.`
              : payload.message
          );
        } else if (event === "task_started") {
          setProgress((p) => ({ ...p, [payload.taskId]: "Starting…" }));
          patch(payload.taskId, { status: "GENERATING", error: null });
        } else if (event === "task_progress") {
          setProgress((p) => ({ ...p, [payload.taskId]: payload.message }));
        } else if (event === "task_done") {
          setProgress((p) => {
            const next = { ...p };
            delete next[payload.taskId];
            return next;
          });
          patch(payload.taskId, {
            status: payload.success ? payload.status || "APPROVED" : "FAILED",
            postId: payload.postId,
            mediaUrl: payload.mediaUrl ?? null,
            caption: payload.caption,
            shortUrl: payload.shortUrl ?? null,
            liveUrl: payload.liveUrl ?? null,
            scheduledFor: payload.scheduledFor ?? null,
            needsDestination: payload.needsDestination,
            warning: payload.warning ?? null,
            error: payload.success ? null : payload.error || "Generation failed.",
            title: payload.title,
            wordCount: payload.wordCount,
            seoScore: payload.seoScore,
            hasSchema: payload.hasSchema,
          });
        } else if (event === "batch_done") {
          if (payload.aborted) {
            onToast("info", "Stopped. Anything already finished was kept.");
          } else if (payload.total === 0) {
            onToast("info", "Nothing left to run in today's plan.");
          } else {
            onToast(
              payload.failed > 0 ? "info" : "success",
              `${payload.succeeded} of ${payload.total} done${
                payload.failed > 0 ? `, ${payload.failed} failed — see the messages below.` : "."
              }`
            );
          }
          onRefresh();
        } else if (event === "batch_error") {
          onToast(payload.error === "Stopped by user." ? "info" : "error", payload.error);
        }
      }
    }
  };

  const runAll = async () => {
    if (!strategy?.todayPlan?.length) {
      onToast("error", "Build the plan first.");
      onGoToTab("plan");
      return;
    }
    const controller = new AbortController();
    batchAbort.current = controller;
    setRunningAll(true);
    setBatchNote(null);
    try {
      await run(undefined, controller);
    } catch (err: any) {
      if (err?.name !== "AbortError") onToast("error", err?.message || "Generation failed.");
    } finally {
      batchAbort.current = null;
      setRunningAll(false);
      setProgress({});
    }
  };

  const stopAll = () => {
    batchAbort.current?.abort();
    batchAbort.current = null;
    setRunningAll(false);
    setProgress({});
    onToast("info", "Stopping — no further tasks will start.");
  };

  const runOne = async (taskId: string) => {
    const controller = new AbortController();
    taskAborts.current.set(taskId, controller);
    setRunningTasks((prev) => [...prev, taskId]);
    try {
      await run([taskId], controller);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        onToast("error", err?.message || "Generation failed.");
        patch(taskId, { status: "FAILED", error: err?.message || "Generation failed." });
      }
    } finally {
      taskAborts.current.delete(taskId);
      setRunningTasks((prev) => prev.filter((id) => id !== taskId));
      setProgress((p) => {
        const next = { ...p };
        delete next[taskId];
        return next;
      });
    }
  };

  const stopOne = (taskId: string) => {
    taskAborts.current.get(taskId)?.abort();
    taskAborts.current.delete(taskId);
    setRunningTasks((prev) => prev.filter((id) => id !== taskId));
    patch(taskId, { status: "PENDING_APPROVAL" });
    onToast("info", "Stopped.");
  };

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!data.goal) {
    return (
      <EmptyState
        icon={<Sparkles className="w-5 h-5" />}
        title="No goal yet"
        description="Set your lead target first. Today's work is generated from the plan that comes out of it."
        action={
          <button
            type="button"
            onClick={() => onGoToTab("goal")}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            Set the goal
          </button>
        }
      />
    );
  }

  if (!strategy?.todayPlan?.length) {
    return (
      <EmptyState
        icon={<Sparkles className="w-5 h-5" />}
        title="No plan for today"
        description="Build the plan and the AI will lay out exactly what to post today across your platforms, plus any SEO articles."
        action={
          <button
            type="button"
            onClick={() => onGoToTab("plan")}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/90"
          >
            Build the plan
          </button>
        }
      />
    );
  }

  const socialTasks = tasks.filter((t) => t.channel !== "WEBSITE");
  const articleTasks = tasks.filter((t) => t.channel === "WEBSITE");
  const pendingCount = tasks.filter((t) => {
    const s = merged(t).status;
    return s !== "SCHEDULED" && s !== "PUBLISHED";
  }).length;

  return (
    <div className="space-y-5">
      {/* ── Batch controls ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">
              {pendingCount === 0
                ? "Everything for today is done"
                : `${pendingCount} task${pendingCount === 1 ? "" : "s"} left for today`}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {socialTasks.length} social post{socialTasks.length === 1 ? "" : "s"}
              {articleTasks.length > 0 &&
                ` and ${articleTasks.length} website article${articleTasks.length === 1 ? "" : "s"}`}
              . Three run at a time, so the whole day is generated in one go.
            </p>
          </div>

          <ActionButton
            running={runningAll}
            onRun={runAll}
            onStop={stopAll}
            label="Run all in parallel"
            runningLabel="Stop all"
            icon={<Wand2 className="w-3.5 h-3.5" />}
            disabled={pendingCount === 0 || runningTasks.length > 0}
            title={
              pendingCount === 0
                ? "Nothing left to run today."
                : runningTasks.length > 0
                  ? "A single task is already running."
                  : "Generate everything for today"
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border">
          <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={generateVisuals}
              onChange={(e) => setGenerateVisuals(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            Generate the visual too
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleNow}
              onChange={(e) => setScheduleNow(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            Schedule at the best time automatically
          </label>
          {!scheduleNow && (
            <span className="text-[11px] text-secondary">
              Posts will be created but not scheduled — you publish them yourself.
            </span>
          )}
        </div>

        {batchNote && (
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">{batchNote}</p>
        )}
      </section>

      {/* ── Social tasks ── */}
      {socialTasks.length > 0 && (
        <SectionCard
          title="Social posts for today"
          subtitle="Each caption carries a tracked link, so clicks and leads from it are counted for real."
          icon={<Sparkles className="w-4 h-4" />}
        >
          <div className="space-y-3">
            {socialTasks.map((task) => (
              <SocialTaskCard
                key={task.id}
                task={merged(task)}
                workspaceId={data.workspaceId}
                running={runningTasks.includes(task.id)}
                blocked={runningAll}
                progress={progress[task.id]}
                seedCaption={
                  runtime[task.id]?.caption ??
                  (merged(task).postId ? captionByPostId[merged(task).postId!] : undefined)
                }
                onRun={() => runOne(task.id)}
                onStop={() => stopOne(task.id)}
                onPatch={(next) => patch(task.id, next)}
                onToast={onToast}
                onGoToTab={onGoToTab}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Article tasks ── */}
      {articleTasks.length > 0 && (
        <SectionCard
          title="Website articles for today"
          subtitle="Written for keywords the AI picked, given JSON-LD schema, and published straight to your site."
          icon={<Globe className="w-4 h-4" />}
          accent="secondary"
        >
          <div className="space-y-3">
            {articleTasks.map((task) => (
              <ArticleTaskCard
                key={task.id}
                task={merged(task)}
                running={runningTasks.includes(task.id)}
                blocked={runningAll}
                progress={progress[task.id]}
                wordpressConnected={data.wordpress.connected}
                onRun={() => runOne(task.id)}
                onStop={() => stopOne(task.id)}
                onGoToTab={onGoToTab}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ============================================================================
// Social task
// ============================================================================

function SocialTaskCard({
  task,
  workspaceId,
  running,
  blocked,
  progress,
  seedCaption,
  onRun,
  onStop,
  onPatch,
  onToast,
  onGoToTab,
  onRefresh,
}: {
  task: TaskView;
  workspaceId: string;
  running: boolean;
  blocked: boolean;
  progress?: string;
  seedCaption?: string;
  onRun: () => void;
  onStop: () => void;
  onPatch: (next: Runtime) => void;
  onToast: (tone: "success" | "error" | "info", text: string) => void;
  onGoToTab: (tab: string) => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(seedCaption || "");
  const [savingCaption, setSavingCaption] = useState(false);
  const [mediaBusy, setMediaBusy] = useState<"regenerate" | "upload" | "remove" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mediaAbort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(seedCaption || "");
  }, [seedCaption, editing]);

  useEffect(() => {
    return () => mediaAbort.current?.abort();
  }, []);

  const generated = Boolean(task.postId);
  const isLive = task.status === "PUBLISHED";

  const saveCaption = async () => {
    setSavingCaption(true);
    try {
      const res = await updateGrowthTaskCaption(workspaceId, task.id, draft);
      if (!res.success) {
        onToast("error", res.error || "Could not save the caption.");
        return;
      }
      onPatch({ caption: draft });
      setEditing(false);
      onToast("success", "Caption saved.");
    } finally {
      setSavingCaption(false);
    }
  };

  const regenerateMedia = async () => {
    const controller = new AbortController();
    mediaAbort.current = controller;
    setMediaBusy("regenerate");
    try {
      const res = await fetch("/api/growth/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, taskId: task.id }),
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        onToast("error", payload.error || "Could not regenerate the visual.");
        return;
      }
      onPatch({ mediaUrl: payload.mediaUrl });
      onToast("success", "New visual ready.");
    } catch (err: any) {
      if (err?.name !== "AbortError") onToast("error", err?.message || "Could not regenerate the visual.");
    } finally {
      mediaAbort.current = null;
      setMediaBusy(null);
    }
  };

  const stopMedia = () => {
    mediaAbort.current?.abort();
    mediaAbort.current = null;
    setMediaBusy(null);
    onToast("info", "Visual generation stopped.");
  };

  const uploadMedia = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      onToast("error", "That file is over 10 MB. Use a smaller one.");
      return;
    }
    setMediaBusy("upload");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });

      const res = await setGrowthTaskMedia(
        workspaceId,
        task.id,
        dataUrl,
        file.type.startsWith("video/") ? "video" : "image"
      );
      if (!res.success) {
        onToast("error", res.error || "Upload failed.");
        return;
      }
      onPatch({ mediaUrl: res.mediaUrl, mediaType: file.type.startsWith("video/") ? "video" : "image" });
      onToast("success", "Media replaced.");
    } catch (err: any) {
      onToast("error", err?.message || "Upload failed.");
    } finally {
      setMediaBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeMedia = async () => {
    setMediaBusy("remove");
    try {
      const res = await setGrowthTaskMedia(workspaceId, task.id, null);
      if (!res.success) {
        onToast("error", res.error || "Could not remove the media.");
        return;
      }
      onPatch({ mediaUrl: null });
      onToast("info", "Media removed. The post will go out as text only.");
    } finally {
      setMediaBusy(null);
    }
  };

  const publishNow = async () => {
    setPublishing(true);
    try {
      const res = await publishGrowthTaskNow(workspaceId, task.id);
      if (!res.success) {
        onToast("error", res.error || "Publish failed.");
        onPatch({ error: res.error || "Publish failed." });
        return;
      }
      onPatch({ status: "PUBLISHED", liveUrl: res.liveUrl ?? null, error: null });
      onToast("success", res.liveUrl ? "Published. The live link is on the card." : "Published.");
      onRefresh();
    } finally {
      setPublishing(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await deleteGrowthTaskPost(workspaceId, task.id);
      if (!res.success) {
        onToast("error", res.error || "Could not delete it.");
        return;
      }
      onPatch({ deleted: true });
      onToast("info", "Deleted. It will not be published.");
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">{task.platform}</span>
            <Chip tone="muted">{task.format}</Chip>
            <span className="text-[11px] text-muted-foreground">{task.time}</span>
            <StatusChip status={task.status} />
          </div>
          <p className="text-sm text-foreground mt-1.5 leading-snug">{task.topic}</p>
          {task.hook && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed italic">
              &ldquo;{task.hook}&rdquo;
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            <span className="font-semibold">Why this post:</span> {task.leadGoalRole}
          </p>
        </div>

        <div className="shrink-0">
          <MediaPreview url={task.mediaUrl} mediaType={task.mediaType} className="w-20 h-20" />
        </div>
      </div>

      {/* progress */}
      {progress && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-secondary mt-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          {progress}
        </p>
      )}

      {/* problems */}
      {task.needsDestination && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[11px] text-foreground leading-relaxed">
            No CTA link is set, so this post cannot carry a tracked link and no lead can be traced to it.
          </p>
          <button
            type="button"
            onClick={() => onGoToTab("goal")}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 shrink-0"
          >
            <Link2 className="w-3 h-3" />
            Add a link
          </button>
        </div>
      )}
      {task.warning && (
        <p className="inline-flex items-start gap-1.5 text-[11px] text-secondary mt-3 leading-relaxed">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          {task.warning}
        </p>
      )}
      {task.error && (
        <p className="inline-flex items-start gap-1.5 text-[11px] text-destructive mt-3 leading-relaxed">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          {task.error}
        </p>
      )}

      {/* caption */}
      {generated && (
        <div className="mt-3">
          {editing ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={saveCaption}
                  disabled={savingCaption}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingCaption ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  Save caption
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(seedCaption || "");
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </>
          ) : (
            (task.caption || seedCaption) && (
              <p className="rounded-xl bg-muted/40 p-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">
                {task.caption || seedCaption}
              </p>
            )
          )}
        </div>
      )}

      {/* tracked link */}
      {task.shortUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-primary">
            <Link2 className="w-3 h-3" />
            {task.shortUrl}
          </span>
          <CopyButton value={task.shortUrl} label="Copy link" />
          {(task.platform || "").toLowerCase() === "instagram" ||
          (task.platform || "").toLowerCase() === "tiktok" ? (
            <span className="text-[11px] text-muted-foreground">
              {task.platform} does not make caption links clickable — put this in your bio.
            </span>
          ) : null}
        </div>
      )}

      {task.scheduledFor && !isLive && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground mt-3">
          <CalendarClock className="w-3 h-3" />
          Goes out {fmtDateTime(task.scheduledFor)}
        </p>
      )}

      {isLive && (
        <div className="mt-3">
          <LiveLink url={task.liveUrl} />
        </div>
      )}

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
        <ActionButton
          running={running}
          onRun={onRun}
          onStop={onStop}
          label={generated ? "Regenerate" : "Generate"}
          runningLabel="Stop"
          icon={generated ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          size="sm"
          disabled={blocked || isLive}
          title={
            isLive
              ? "This one is already live."
              : blocked
                ? "A batch run is in progress."
                : generated
                  ? "Write it again from scratch"
                  : "Write the caption and make the visual"
          }
        />

        {generated && !isLive && (
          <>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted"
            >
              <Pencil className="w-3 h-3" />
              {editing ? "Close editor" : "Edit caption"}
            </button>

            <ActionButton
              running={mediaBusy === "regenerate"}
              onRun={regenerateMedia}
              onStop={stopMedia}
              label={task.mediaUrl ? "New visual" : "Make a visual"}
              runningLabel="Stop"
              icon={<ImagePlus className="w-3 h-3" />}
              size="sm"
              variant="outline"
              disabled={mediaBusy !== null && mediaBusy !== "regenerate"}
            />

            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMedia(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={mediaBusy !== null}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {mediaBusy === "upload" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              {task.mediaUrl ? "Replace media" : "Upload media"}
            </button>

            {task.mediaUrl && (
              <button
                type="button"
                onClick={removeMedia}
                disabled={mediaBusy !== null}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 disabled:opacity-50"
              >
                {mediaBusy === "remove" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
                Remove media
              </button>
            )}

            <button
              type="button"
              onClick={publishNow}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Publish now
            </button>

            <ConfirmButton
              onConfirm={remove}
              busy={deleting}
              label="Delete"
              confirmLabel="Delete it"
              icon={<Trash2 className="w-3 h-3" />}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Article task
// ============================================================================

function ArticleTaskCard({
  task,
  running,
  blocked,
  progress,
  wordpressConnected,
  onRun,
  onStop,
  onGoToTab,
}: {
  task: TaskView;
  running: boolean;
  blocked: boolean;
  progress?: string;
  wordpressConnected: boolean;
  onRun: () => void;
  onStop: () => void;
  onGoToTab: (tab: string) => void;
}) {
  const published = task.status === "PUBLISHED" || Boolean(task.liveUrl);

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Globe className="w-3.5 h-3.5 text-secondary" />
              Website article
            </span>
            <StatusChip status={task.status} />
            {task.hasSchema && (
              <Chip tone="secondary" title="JSON-LD structured data was added so search engines can read it.">
                Schema added
              </Chip>
            )}
            {typeof task.seoScore === "number" && <Chip tone="primary">SEO {task.seoScore}/100</Chip>}
          </div>

          <p className="text-sm text-foreground mt-1.5 leading-snug">{task.title || task.topic}</p>

          {task.keyword && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              <span className="font-semibold">Target keyword:</span> {task.keyword}
              {task.searchIntent ? ` · ${task.searchIntent} intent` : ""}
            </p>
          )}
          {typeof task.wordCount === "number" && (
            <p className="text-[11px] text-muted-foreground mt-1">{task.wordCount} words</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            <span className="font-semibold">Why this article:</span> {task.leadGoalRole}
          </p>
        </div>

        <span className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-secondary/10 text-secondary shrink-0">
          <FileText className="w-6 h-6" />
        </span>
      </div>

      {progress && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-secondary mt-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          {progress}
        </p>
      )}

      {!wordpressConnected && !published && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[11px] text-foreground leading-relaxed">
            No verified WordPress site is connected, so this article cannot be published anywhere.
          </p>
          <button
            type="button"
            onClick={() => onGoToTab("goal")}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-secondary text-secondary-foreground text-[11px] font-semibold hover:bg-secondary/90 shrink-0"
          >
            Connect the site
          </button>
        </div>
      )}

      {task.error && (
        <p className="inline-flex items-start gap-1.5 text-[11px] text-destructive mt-3 leading-relaxed">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          {task.error}
        </p>
      )}

      {task.shortUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-secondary">
            <Link2 className="w-3 h-3" />
            {task.shortUrl}
          </span>
          <CopyButton value={task.shortUrl} label="Copy CTA link" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
        <ActionButton
          running={running}
          onRun={onRun}
          onStop={onStop}
          label={published ? "Write another" : "Write & publish"}
          runningLabel="Stop"
          icon={<FileText className="w-3 h-3" />}
          size="sm"
          variant="secondary"
          disabled={blocked || !wordpressConnected}
          title={
            !wordpressConnected
              ? "Connect your WordPress site first."
              : blocked
                ? "A batch run is in progress."
                : "Research the keyword, write the article and publish it"
          }
        />

        {task.liveUrl ? (
          <a
            href={task.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-secondary/30 text-secondary text-xs font-semibold hover:bg-secondary/10"
          >
            <ExternalLink className="w-3 h-3" />
            Open live article
          </a>
        ) : null}
        {task.liveUrl && <CopyButton value={task.liveUrl} label="Copy article URL" />}
      </div>
    </div>
  );
}
