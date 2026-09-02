"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Check,
  CircleSlash,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  Play,
  Save,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

/**
 * Shared building blocks for Lead Goal HQ.
 *
 * Two rules the whole tab follows:
 *  - Only `primary` and `secondary` are used for colour. Status semantics reuse
 *    `destructive` and `muted` from the theme, never raw indigo/slate.
 *  - Every action has its counterpart. `ActionButton` renders Run↔Stop from one
 *    prop pair, and `ConfirmButton` never destroys anything on a single click.
 */

// ============================================================================
// Run ↔ Stop
// ============================================================================

export function ActionButton({
  running,
  onRun,
  onStop,
  label,
  runningLabel,
  stopLabel = "Stop",
  icon,
  disabled,
  variant = "primary",
  size = "default",
  className = "",
  title,
}: {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  label: string;
  runningLabel?: string;
  stopLabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "default";
  className?: string;
  title?: string;
}) {
  const base =
    size === "sm" ? "h-8 px-3 text-xs gap-1.5 rounded-lg" : "h-10 px-4 text-sm gap-2 rounded-xl";

  if (running) {
    return (
      <button
        type="button"
        onClick={onStop}
        title={stopLabel}
        className={`inline-flex items-center justify-center font-semibold border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors ${base} ${className}`}
      >
        <Square className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} fill="currentColor" />
        {runningLabel || stopLabel}
      </button>
    );
  }

  const tone =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90 border border-primary"
      : variant === "secondary"
        ? "bg-secondary text-secondary-foreground hover:bg-secondary/90 border border-secondary"
        : "bg-transparent border border-primary/30 text-primary hover:bg-primary/10";

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={disabled}
      title={title || label}
      className={`inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${base} ${tone} ${className}`}
    >
      {icon ?? <Play className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />}
      {label}
    </button>
  );
}

// ============================================================================
// Destructive with confirm
// ============================================================================

export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "Sure?",
  icon,
  busy,
  size = "sm",
  className = "",
}: {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  icon?: React.ReactNode;
  busy?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const base =
    size === "sm" ? "h-8 px-3 text-xs gap-1.5 rounded-lg" : "h-10 px-4 text-sm gap-2 rounded-xl";

  if (busy) {
    return (
      <span
        className={`inline-flex items-center justify-center font-semibold border border-border text-muted-foreground ${base} ${className}`}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Working…
      </span>
    );
  }

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            if (timer.current) clearTimeout(timer.current);
            onConfirm();
          }}
          className={`inline-flex items-center justify-center font-semibold bg-destructive text-white hover:bg-destructive/90 ${base}`}
        >
          <Check className="w-3 h-3" />
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            if (timer.current) clearTimeout(timer.current);
          }}
          title="Cancel"
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:bg-muted"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 4000);
      }}
      className={`inline-flex items-center justify-center font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors ${base} ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// Toasts (with Undo)
// ============================================================================

export interface ToastMessage {
  id: string;
  tone: "success" | "error" | "info";
  text: string;
  undo?: () => void;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur bg-card/95 ${
            t.tone === "error"
              ? "border-destructive/40"
              : t.tone === "success"
                ? "border-primary/40"
                : "border-secondary/40"
          }`}
        >
          {t.tone === "error" ? (
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          ) : t.tone === "success" ? (
            <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
          )}
          <p className="text-xs leading-relaxed text-foreground flex-1">{t.text}</p>
          {t.undo && (
            <button
              type="button"
              onClick={() => {
                t.undo?.();
                onDismiss(t.id);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline shrink-0"
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const push = (tone: ToastMessage["tone"], text: string, undo?: () => void) => {
    const id = `t${++counter.current}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, text, undo }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), undo ? 9000 : 5500);
  };

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return { toasts, push, dismiss };
}

// ============================================================================
// Layout atoms
// ============================================================================

export function SectionCard({
  title,
  subtitle,
  icon,
  accent = "primary",
  actions,
  children,
  className = "",
  info,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "secondary";
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** "What is this section for?" — shown behind the "i" next to the title. */
  info?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <span
              className={`inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${
                accent === "primary" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
              }`}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              {title}
              {info && <InfoDot text={info} />}
            </h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 rounded-xl border border-dashed border-border py-10 px-6">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
        {icon ?? <Info className="w-5 h-5" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Small labelled chip. `tone="muted"` is used for anything unmeasured. */
export function Chip({
  children,
  tone = "primary",
  icon,
  title,
}: {
  children: React.ReactNode;
  tone?: "primary" | "secondary" | "muted" | "danger";
  icon?: React.ReactNode;
  title?: string;
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    secondary: "bg-secondary/10 text-secondary border-secondary/20",
    muted: "bg-muted text-muted-foreground border-border",
    danger: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function StatusChip({ status }: { status?: string | null }) {
  const s = (status || "").toUpperCase();
  if (s === "PUBLISHED") return <Chip tone="primary" icon={<Check className="w-3 h-3" />}>Published</Chip>;
  if (s === "FAILED") return <Chip tone="danger" icon={<AlertTriangle className="w-3 h-3" />}>Failed</Chip>;
  if (s === "SCHEDULED") return <Chip tone="secondary">Scheduled</Chip>;
  if (s === "PUBLISHING") return <Chip tone="secondary">Publishing…</Chip>;
  if (s === "GENERATING") return <Chip tone="secondary">Generating…</Chip>;
  if (s === "APPROVED") return <Chip tone="primary">Ready</Chip>;
  if (s === "PENDING_APPROVAL") return <Chip tone="muted">Not generated</Chip>;
  if (!s) return null;
  return <Chip tone="muted">{s.replace(/_/g, " ").toLowerCase()}</Chip>;
}

/**
 * Honest metric tile. `measured={false}` renders the "estimate" note instead of
 * pretending the number came from a platform API.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  accent = "primary",
  measured = true,
  onClick,
  info,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "secondary";
  measured?: boolean;
  onClick?: () => void;
  /** Plain answer to "where does this number come from?". */
  info?: string;
}) {
  // Always a div, never a <button>: the tile carries its own "i" button and a
  // button inside a button is invalid markup. Keyboard support is wired by hand
  // so a clickable tile still behaves like one.
  return (
    <div
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={`text-left rounded-2xl border border-border bg-card p-4 flex flex-col gap-1 ${
        onClick ? "cursor-pointer hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary" : ""
      }`}
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon && (
          <span className={accent === "primary" ? "text-primary" : "text-secondary"}>{icon}</span>
        )}
        {label}
        {info && (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <InfoDot text={info} />
          </span>
        )}
      </span>
      <span className="text-2xl font-bold text-foreground leading-none">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground leading-snug">{hint}</span>}
      {!measured && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
          Estimate — not measured
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Explain-anything
// ============================================================================

/**
 * The little "i" next to a label. Every number, toggle and button on this screen
 * carries one, because the fastest way to make an automation trustworthy is to
 * let the user ask "what is this?" without leaving the page.
 *
 * Click to open (not hover) so it works on a phone, closes on Escape or an
 * outside click.
 */
export function InfoDot({
  text,
  align = "left",
  className = "",
}: {
  text: string;
  /** Which edge of the popover lines up with the button. */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="What is this?"
        title={text}
        className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full border text-[9px] font-bold leading-none transition-colors ${
          open
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
        }`}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-6 z-30 w-64 rounded-xl border border-border bg-card p-3 text-[11px] font-normal normal-case tracking-normal leading-relaxed text-foreground shadow-lg ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** A form label with its own explanation attached. */
export function FieldLabel({
  children,
  info,
  icon,
  className = "",
}: {
  children: React.ReactNode;
  info?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-foreground ${className}`}>
      {icon}
      {children}
      {info && <InfoDot text={info} />}
    </span>
  );
}

// ============================================================================
// Inner rail + connection status
// ============================================================================

/** Secondary rail inside a channel tab. Same grammar as the main rail. */
export function SubRail<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; icon?: React.ReactNode; count?: number; info?: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <span key={t.key} className="inline-flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={on ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                on
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
              {typeof t.count === "number" && t.count > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold ${
                    on ? "bg-primary-foreground/20 text-primary-foreground" : "bg-border text-foreground"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
            {t.info && <InfoDot text={t.info} className="ml-0.5 mr-1" />}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Connection status for a channel. Connecting itself happens in Integrations or
 * Plugins — this only reports the truth and points there, so there is exactly
 * one place in the app where an account is linked.
 */
export function ConnectionStrip({
  connected,
  label,
  connectedNote,
  warning,
  href,
  hrefLabel,
  info,
  extra,
}: {
  connected: boolean;
  label: string;
  connectedNote?: string;
  warning: string;
  href: string;
  hrefLabel: string;
  info?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
        connected ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        {connected ? (
          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
            {label}
            {info && <InfoDot text={info} />}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {connected ? connectedNote : warning}
          </p>
          {extra && <div className="flex flex-wrap items-center gap-1.5 mt-1.5">{extra}</div>}
        </div>
      </div>
      <a
        href={href}
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold shrink-0 ${
          connected
            ? "border border-border text-foreground hover:bg-muted"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {hrefLabel}
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

// ============================================================================
// CTA destination
// ============================================================================

/**
 * One "where should this link send people?" row, with Save ↔ Remove.
 *
 * Shared by the Goal tab (the default link) and the Social tab (a per-platform
 * override), because a link saved in one place has to mean the same thing in
 * the other.
 */
export function DestinationRow({
  label,
  value,
  placeholder,
  info,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  info?: string;
  onSave: (value: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const dirty = draft.trim() !== value.trim();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const run = async (next: string) => {
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 last:mb-0">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Link2 className="w-3 h-3 text-muted-foreground" />
        {label}
        {info && <InfoDot text={info} />}
      </span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-[14rem] h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => run(draft)}
          disabled={busy || !dirty}
          title={dirty ? "Save this link" : "Nothing changed yet"}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              void run("");
            }}
            disabled={busy}
            title="Remove this link"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Media
// ============================================================================

export function MediaPreview({
  url,
  mediaType,
  className = "",
}: {
  url?: string | null;
  mediaType?: string | null;
  className?: string;
}) {
  const isVideo = mediaType === "video" || /\.(mp4|mov|webm)$/i.test(url || "");

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground ${className}`}
      >
        <ImageIcon className="w-4 h-4" />
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        src={url}
        muted
        loop
        playsInline
        className={`rounded-xl object-cover bg-black ${className}`}
        onMouseEnter={(e) => void (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
        onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`rounded-xl object-cover bg-muted ${className}`} />;
}

/** Real live link only — never a platform feed stand-in. */
export function LiveLink({ url, label = "Open live post" }: { url?: string | null; label?: string }) {
  if (!url) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title="The platform did not return a direct link for this post, so there is nothing to open."
      >
        <CircleSlash className="w-3 h-3" />
        No link returned
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — the value is visible on screen anyway */
        }
      }}
      className={`inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors ${className}`}
    >
      {copied ? <Check className="w-3 h-3 text-primary" /> : <FileText className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ChannelIcon({ channel, className = "w-4 h-4" }: { channel?: string; className?: string }) {
  return channel === "WEBSITE" ? (
    <Globe className={`${className} text-secondary`} />
  ) : (
    <ImageIcon className={`${className} text-primary`} />
  );
}

/** Downloads a generated CSV without leaving the page. */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fmtDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayBucket(value: string): string {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export { Button };
