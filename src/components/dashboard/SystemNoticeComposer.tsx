"use client";

// ============================================================================
// SYSTEM NOTICE COMPOSER
//
// The broadcast form, rendered inside the bell's System tab and only for a user
// the allowlist recognises. It sits where the notices appear on purpose: an
// operator writes the message in the same panel everybody else reads it in, so
// what they are about to send is never a guess about how it will look.
//
// Collapsed until asked for — the tab's job is reading, not writing.
// ============================================================================

import { useState } from "react";
import { Loader2, Megaphone, Send, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { publishSystemNotice } from "@/actions/systemNotices";

const TONE_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "success", label: "Good news" },
  { value: "warning", label: "Heads up" },
  { value: "error", label: "Incident" },
] as const;

const EXPIRY_OPTIONS = [
  { value: 0, label: "Until I retract it" },
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
] as const;

const FIELD_CLASS =
  "h-8 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

export function SystemNoticeComposer({ onPublished }: { onPublished: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]["value"]>("info");
  const [href, setHref] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setTitle("");
    setBody("");
    setTone("info");
    setHref("");
    setExpiresInDays(0);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || title.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const result = await publishSystemNotice({
        title,
        body,
        tone,
        href,
        expiresInDays,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      // The list this sits above is now out of date by exactly one row.
      onPublished();
    } catch {
      setError("The message could not be published. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-dashed border-slate-200 dark:border-slate-700 px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:border-primary/40 hover:text-primary transition-colors"
      >
        <Megaphone className="h-3 w-3" />
        Broadcast a message to everyone
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mb-1.5 grid gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-2"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          <Megaphone className="h-3 w-3 text-primary" />
          New system message
        </span>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          aria-label="Discard message"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Scheduled maintenance on Sunday"
        maxLength={200}
        className="h-8 text-[11px]"
        autoFocus
      />

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What everybody needs to know, in a sentence or two."
        maxLength={2000}
        rows={3}
        className="text-[11px] min-h-16"
      />

      <div className="grid grid-cols-2 gap-1.5">
        <select
          aria-label="Tone"
          value={tone}
          onChange={(e) => setTone(e.target.value as typeof tone)}
          className={FIELD_CLASS}
        >
          {TONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="How long it stays up"
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Number(e.target.value) || 0)}
          className={FIELD_CLASS}
        >
          {EXPIRY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <Input
        value={href}
        onChange={(e) => setHref(e.target.value)}
        placeholder="Optional link — /dashboard/billing or https://…"
        maxLength={512}
        className="h-8 text-[11px]"
      />

      {error && <p className="text-[10px] font-medium text-destructive leading-snug">{error}</p>}

      <button
        type="submit"
        disabled={busy || title.trim().length < 3}
        className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        {busy ? "Publishing…" : "Publish to everyone"}
      </button>
    </form>
  );
}
