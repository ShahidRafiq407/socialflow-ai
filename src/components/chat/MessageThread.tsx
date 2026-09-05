"use client";

// ============================================================================
// MESSAGE THREAD
//
// One column, generous line length, no chat bubbles for the assistant — the
// answer is the page. The user's turn is a small indented block so the eye can
// find where each exchange starts.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  FileArchive,
  FileText,
  ImageIcon,
  Music,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Video,
} from "lucide-react";
import type { AttachmentRef, ChatMessage } from "@/lib/agents/controller/types";
import type { ChatSettings } from "@/lib/agents/controller/settingsShape";
import { Markdown } from "./Markdown";
import { ThinkingStream } from "./ThinkingStream";
import { ToolTimeline } from "./ToolTimeline";
import { ArtifactCards } from "./ArtifactCards";

/** A vote already cast on a message, keyed by message id. */
export type FeedbackVotes = Record<string, 1 | -1>;

export interface FeedbackHandlers {
  votes: FeedbackVotes;
  onVote: (message: ChatMessage, rating: 1 | -1, comment?: string) => void;
}

const ATTACHMENT_ICON: Record<string, typeof FileText> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  archive: FileArchive,
  project: FileArchive,
};

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChips({ attachments }: { attachments: AttachmentRef[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a, i) => {
        const Icon = ATTACHMENT_ICON[a.kind] || FileText;
        return (
          <span
            key={`${a.name}-${i}`}
            className="inline-flex max-w-[240px] items-center gap-1.5 rounded-lg border mkt-border mkt-bg2 px-2 py-1 text-[11.5px] mkt-muted"
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{a.name}</span>
            {a.size > 0 && <span className="shrink-0 mkt-faint">{formatBytes(a.size)}</span>}
          </span>
        );
      })}
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="group flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md border mkt-border mkt-surface2 px-3.5 py-2.5">
        <div className="whitespace-pre-wrap text-[14px] leading-[1.65] mkt-text">{message.content}</div>
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentChips attachments={message.attachments} />
        )}
      </div>
    </div>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;

  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
      }
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] mkt-faint transition-colors hover:mkt-muted"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Thumbs under an answer. A down-vote opens a one-line "what went wrong" box;
 * the vote itself is sent at once so the box can be ignored. Only messages the
 * server has saved (a real id, not the client's placeholder) can be voted on.
 */
function FeedbackButtons({
  message,
  vote,
  onVote,
}: {
  message: ChatMessage;
  vote: 1 | -1 | undefined;
  onVote: (rating: 1 | -1, comment?: string) => void;
}) {
  const [askWhy, setAskWhy] = useState(false);
  const [why, setWhy] = useState("");
  const saved = !message.id.startsWith("a-");
  if (!saved) return null;

  const cls = (active: boolean) =>
    `flex items-center rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
      active ? "mkt-accent-text" : "mkt-faint hover:mkt-muted"
    }`;

  return (
    <>
      <button type="button" title="Helpful" className={cls(vote === 1)} onClick={() => { setAskWhy(false); onVote(1); }}>
        <ThumbsUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        title="Not helpful"
        className={cls(vote === -1)}
        onClick={() => {
          onVote(-1);
          setAskWhy(true);
        }}
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
      {askWhy && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onVote(-1, why.trim() || undefined);
            setAskWhy(false);
            setWhy("");
          }}
        >
          <input
            autoFocus
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="What went wrong? (optional)"
            maxLength={2000}
            className="h-6 w-56 rounded-md border mkt-border bg-transparent px-2 text-[11px] mkt-text outline-none"
          />
          <button type="submit" className="rounded-md px-1.5 py-0.5 text-[11px] mkt-accent-text">
            Send
          </button>
        </form>
      )}
    </>
  );
}

function AssistantMessage({
  message,
  settings,
  onSuggestion,
  onRetry,
  feedback,
}: {
  message: ChatMessage;
  settings: ChatSettings;
  onSuggestion: (text: string) => void;
  onRetry?: () => void;
  feedback?: FeedbackHandlers;
}) {
  const empty =
    !message.streaming &&
    !message.content.trim() &&
    (message.toolRuns || []).length === 0 &&
    (message.artifacts || []).length === 0;

  return (
    <div className="group">
      <ThinkingStream
        reasoning={message.reasoning || ""}
        streaming={!!message.streaming}
        display={settings.thinkingDisplay}
        durationMs={message.durationMs}
      />

      {(message.toolRuns || []).length > 0 && (
        <ToolTimeline runs={message.toolRuns || []} visibility={settings.toolVisibility} />
      )}

      {message.content.trim() && <Markdown>{message.content}</Markdown>}

      {message.streaming && !message.content.trim() && (message.toolRuns || []).length === 0 && (
        <div className="flex items-center gap-2 py-1 text-[13px] mkt-faint">
          <span className="thinking-dots" aria-hidden />
        </div>
      )}

      {(message.artifacts || []).length > 0 && <ArtifactCards artifacts={message.artifacts || []} />}

      {empty && (
        <div className="flex items-center gap-2 text-[13px] mkt-muted">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          No answer came back.
          {onRetry && (
            <button type="button" onClick={onRetry} className="mkt-accent-text underline underline-offset-2">
              Try again
            </button>
          )}
        </div>
      )}

      {!message.streaming && (
        <div className="mt-2 flex flex-wrap items-center gap-2.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <CopyAnswer text={message.content} />
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] mkt-faint transition-colors hover:mkt-muted"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}
          {feedback && message.content.trim() && (
            <FeedbackButtons
              message={message}
              vote={feedback.votes[message.id]}
              onVote={(rating, comment) => feedback.onVote(message, rating, comment)}
            />
          )}
          {message.model && <span className="text-[11px] mkt-faint">{message.model}</span>}
          {typeof message.durationMs === "number" && message.durationMs > 0 && (
            <span className="text-[11px] mkt-faint">{(message.durationMs / 1000).toFixed(1)}s</span>
          )}
          {message.finishReason === "max_loops" && (
            <span className="text-[11px] text-amber-400">stopped at the tool limit</span>
          )}
        </div>
      )}

      {settings.showSuggestions && !message.streaming && (message.suggestions || []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(message.suggestions || []).map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-full border mkt-border px-3 py-1.5 text-[12px] mkt-muted transition-colors hover:border-[color:var(--mkt-accent)]/60 hover:mkt-accent-text"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface MessageThreadProps {
  messages: ChatMessage[];
  settings: ChatSettings;
  streaming: boolean;
  onSuggestion: (text: string) => void;
  onRetry: (message: ChatMessage) => void;
  /** Present when the admin has chat feedback switched on. */
  feedback?: FeedbackHandlers;
}

export function MessageThread({
  messages,
  settings,
  streaming,
  onSuggestion,
  onRetry,
  feedback,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Follow the stream, but stop following the moment the user scrolls up.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (pinnedRef.current) bottomRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  return (
    <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-7 px-4 py-6 sm:px-6">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              settings={settings}
              onSuggestion={onSuggestion}
              feedback={feedback}
              onRetry={
                !message.streaming && index === messages.length - 1
                  ? () => onRetry(messages[index - 1])
                  : undefined
              }
            />
          )
        )}
        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  );
}
