"use client";

// ============================================================================
// COMPOSER
//
// One input for the whole product. Files, folders, model, thinking depth and the
// stop control all live here so the user never has to leave the thread to change
// how the controller works.
// ============================================================================

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowUp,
  Brain,
  FolderUp,
  Loader2,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { resolveChatModel } from "@/lib/agents/controller/models";
import type { ChatSettings } from "@/lib/agents/controller/settingsShape";
import type { ConnectedPlugin } from "@/lib/plugins/connected";
import { useFeature } from "@/components/billing/AccessProvider";
import { FeatureGate } from "@/components/billing/FeatureLock";
import { PluginStrip } from "./PluginStrip";
import type { PendingFile } from "./useChatStream";

/** Vercel caps a serverless request body at ~4.5 MB, so we stop well short. */
const MAX_TOTAL_BYTES = 3.6 * 1024 * 1024;
const MAX_FILES = 10;

const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|json|jsonc|ya?ml|toml|ini|env|csv|tsv|log|html?|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|kts|c|h|cpp|hpp|cs|php|swift|sh|bash|zsh|ps1|sql|prisma|graphql|gql|vue|svelte|astro|xml|svg|gitignore|dockerignore|editorconfig)$/i;

const SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|\.turbo|\.vercel|venv|__pycache__)(\/|$)/;

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface ComposerProps {
  settings: ChatSettings;
  streaming: boolean;
  status?: { label: string; detail?: string } | null;
  draft: string;
  /** What the workspace has connected, so it can be mentioned in one tap. */
  plugins: ConnectedPlugin[];
  onDraftChange: (value: string) => void;
  onSend: (text: string, files: PendingFile[]) => void;
  onStop: () => void;
  onSettingsChange: (patch: Partial<ChatSettings>) => void;
  onNotice: (message: string) => void;
  /**
   * Server-computed plan locks per model id, so the label names the model that will
   * really serve the turn. Undefined until the settings fetch lands, which resolves to
   * the saved pick — the honest answer before the locks are known.
   */
  lockedModels?: Record<string, boolean>;
}

export function Composer({
  settings,
  streaming,
  status,
  draft,
  plugins,
  onDraftChange,
  onSend,
  onStop,
  onSettingsChange,
  onNotice,
  lockedModels,
}: ComposerProps) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Archives and whole folders are a plan line, so this decides both the folder
  // button's lock and whether a dropped `.zip` is accepted at all. The server
  // refuses it either way; refusing here means the user is told before they wait.
  const archives = useFeature("export.zip");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [draft]);

  const ingest = async (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    if (incoming.length === 0) return;

    setReading(true);
    try {
      const accepted: PendingFile[] = [];
      let bytes = files.reduce((sum, f) => sum + f.size, 0);
      let skipped = 0;
      let blockedArchives = 0;

      for (const file of incoming) {
        const path = (file as any).webkitRelativePath || file.name;
        if (SKIP_PATH.test(path)) {
          skipped += 1;
          continue;
        }
        if (!archives.allowed && /\.zip$/i.test(file.name)) {
          blockedArchives += 1;
          continue;
        }
        if (files.length + accepted.length >= MAX_FILES) {
          skipped += 1;
          continue;
        }
        if (bytes + file.size > MAX_TOTAL_BYTES) {
          skipped += 1;
          continue;
        }

        const isText = file.type.startsWith("text/") || TEXT_EXTENSIONS.test(file.name);
        const content = isText ? await readAsText(file) : await readAsDataUrl(file);

        accepted.push({
          name: path,
          type: file.type || (isText ? "text/plain" : "application/octet-stream"),
          size: file.size,
          content,
        });
        bytes += file.size;
      }

      if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
      if (blockedArchives > 0) {
        // `reason` is a finished sentence from the server, so it is dropped in whole
        // rather than spliced into one — a reworded plan reason is a wrong price.
        onNotice(
          `${blockedArchives === 1 ? "That archive was" : `${blockedArchives} archives were`} not attached. ${archives.reason || "Reading archives is not part of this plan."} Single documents still work.`
        );
      }
      if (skipped > 0) {
        // The "zip it instead" advice is only true when this plan can read archives.
        const tail = archives.allowed
          ? " Zip a large project and attach the zip instead."
          : "";
        onNotice(
          accepted.length > 0
            ? `Attached ${accepted.length} file(s); skipped ${skipped} (build folders, or over the ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB limit).${tail}`
            : `Nothing could be attached — ${skipped} file(s) were build folders or over the ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB limit.${tail}`
        );
      }
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Could not read those files.");
    } finally {
      setReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  };

  const submit = () => {
    if (streaming || reading) return;
    if (!draft.trim() && files.length === 0) return;
    onSend(draft, files);
    setFiles([]);
  };

  /**
   * Drop `@Gmail` in at the caret — appending to the end would be wrong the
   * moment the user is mid-sentence, which is exactly when they reach for a
   * plugin. Spaces are added only where there isn't one already.
   */
  const insertMention = (plugin: ConnectedPlugin) => {
    const el = textareaRef.current;
    const at = el ? el.selectionStart : draft.length;
    const end = el ? el.selectionEnd : draft.length;
    const before = draft.slice(0, at);
    const after = draft.slice(end);
    const token = `${/\s$|^$/.test(before) ? "" : " "}@${plugin.name} `;
    onDraftChange(`${before}${token}${after}`);
    // The value lands on the next render, so move the caret after it commits.
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const caret = before.length + token.length;
      node.setSelectionRange(caret, caret);
    });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void ingest(e.dataTransfer?.files || null);
  };

  // Resolved rather than looked up by id, so this names the model the send button is
  // actually about to use. A pick the admin has since disabled, or one the plan no
  // longer covers, falls back to the default brain in the request handler — and this
  // label went on advertising the old one right next to the button.
  const model = resolveChatModel(settings.model, (id) => lockedModels?.[id] === true);

  return (
    <div className="shrink-0 border-t mkt-border mkt-bg/80 backdrop-blur">
      <div className="mx-auto w-full max-w-4xl px-4 pb-4 pt-3 sm:px-6">
        {status && (
          <div className="mb-2 flex items-center gap-2 text-[12px] mkt-muted">
            <Loader2 className="h-3 w-3 animate-spin mkt-accent-text" />
            <span>{status.label}</span>
            {status.detail && <span className="mkt-faint">· {status.detail}</span>}
          </div>
        )}

        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex max-w-[260px] items-center gap-1.5 rounded-lg border mkt-border mkt-surface px-2 py-1 text-[11.5px] mkt-muted"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 mkt-faint transition-colors hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setFiles([])}
              className="rounded-lg px-2 py-1 text-[11.5px] mkt-faint transition-colors hover:mkt-muted"
            >
              Clear all
            </button>
          </div>
        )}

        <PluginStrip plugins={plugins} onInsert={insertMention} />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-2xl border mkt-surface transition-colors ${
            dragging ? "border-[color:var(--mkt-accent)]" : "mkt-border"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={
              dragging
                ? "Drop files to attach…"
                : "Ask for anything — generate a post, analyse a project, publish a campaign…"
            }
            className="max-h-[260px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[14.5px] leading-[1.65] mkt-text outline-none placeholder:mkt-faint"
          />

          <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => void ingest(e.target.files)}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              hidden
              // @ts-expect-error — non-standard but supported in Chromium/WebKit
              webkitdirectory=""
              directory=""
              onChange={(e) => void ingest(e.target.files)}
            />

            <button
              type="button"
              title="Attach files"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-lg mkt-muted transition-colors hover:mkt-bg2 hover:mkt-text"
            >
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </button>
            {/* A whole project folder is the archive feature by another route, so it
                carries the same lock — and says why on hover instead of opening a
                picker whose files would then be refused. */}
            <FeatureGate feature="export.zip" side="top">
              <button
                type="button"
                title="Attach a folder"
                onClick={() => folderInputRef.current?.click()}
                className="flex h-8 w-8 items-center justify-center rounded-lg mkt-muted transition-colors hover:mkt-bg2 hover:mkt-text"
              >
                <FolderUp className="h-4 w-4" />
              </button>
            </FeatureGate>

            <div className="mx-1 h-5 w-px bg-[color:var(--mkt-border)]" aria-hidden />

            {/* One brain runs the controller, so this states it rather than offering
                a choice. Images and video are made by their own models via tools. */}
            <span
              title={`${model.label} — ${model.blurb}`}
              className="max-w-[190px] truncate px-1 py-1 text-[12px] mkt-muted"
            >
              {model.label}
            </span>

            <button
              type="button"
              title={`Thinking: ${settings.thinkingLevel}`}
              onClick={() => {
                const order: ChatSettings["thinkingLevel"][] = ["off", "concise", "balanced", "deep"];
                const next = order[(order.indexOf(settings.thinkingLevel) + 1) % order.length];
                onSettingsChange({ thinkingLevel: next });
              }}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] transition-colors hover:mkt-bg2 ${
                settings.thinkingLevel === "off" ? "mkt-faint" : "mkt-accent-text"
              }`}
            >
              <Brain className="h-3.5 w-3.5" />
              {settings.thinkingLevel}
            </button>

            <div className="flex-1" />

            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-8 items-center gap-1.5 rounded-lg border mkt-border px-2.5 text-[12.5px] mkt-text transition-colors hover:border-red-400/60 hover:text-red-400"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={reading || (!draft.trim() && files.length === 0)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--mkt-accent)] text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        <p className="mt-1.5 text-center text-[11px] mkt-faint">
          Enter to send · Shift+Enter for a new line · drop a folder or zip to have it analysed
        </p>
      </div>
    </div>
  );
}
