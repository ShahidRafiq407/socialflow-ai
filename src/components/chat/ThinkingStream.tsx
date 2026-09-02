"use client";

// ============================================================================
// THINKING STREAM
//
// Live reasoning, shown in a narrow gutter beside the answer while the model is
// still working — not a transcript revealed afterwards. While streaming it keeps
// the newest lines in view; once the turn ends it folds into a single line the
// user can reopen.
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

interface ThinkingStreamProps {
  reasoning: string;
  streaming: boolean;
  /** "live" keeps it open while working, "collapsed" always starts folded. */
  display: "live" | "collapsed" | "hidden";
  durationMs?: number;
}

export function ThinkingStream({ reasoning, streaming, display, durationMs }: ThinkingStreamProps) {
  const [open, setOpen] = useState(display === "live");
  const scrollRef = useRef<HTMLDivElement>(null);
  const trimmed = reasoning.trim();

  // Fold automatically the moment the answer is finished, so a completed turn
  // reads as prose instead of as a wall of reasoning.
  useEffect(() => {
    if (!streaming && display === "live") setOpen(false);
  }, [streaming, display]);

  useLayoutEffect(() => {
    if (open && streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reasoning, open, streaming]);

  if (display === "hidden" || !trimmed) return null;

  const seconds = durationMs ? Math.max(1, Math.round(durationMs / 1000)) : null;
  const label = streaming ? "Thinking" : seconds ? `Thought for ${seconds}s` : "Thought process";

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1.5 text-[12px] mkt-faint transition-colors hover:mkt-muted"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className={`h-3.5 w-3.5 ${streaming ? "animate-pulse mkt-accent-text" : ""}`} />
        <span className={streaming ? "mkt-accent-text" : ""}>{label}</span>
        {streaming && <span className="thinking-dots" aria-hidden />}
      </button>

      {open && (
        <div className="mt-2 flex gap-3">
          <div className="w-px shrink-0 self-stretch bg-[color:var(--mkt-border)]" aria-hidden />
          <div
            ref={scrollRef}
            className={`min-w-0 flex-1 overflow-y-auto pr-1 text-[12.5px] leading-[1.7] mkt-faint ${
              streaming ? "max-h-40" : "max-h-72"
            }`}
          >
            {trimmed.split(/\n{2,}/).map((para, i, arr) => (
              <p
                key={i}
                className={`whitespace-pre-wrap ${i > 0 ? "mt-2" : ""} ${
                  streaming && i === arr.length - 1 ? "mkt-muted" : ""
                }`}
              >
                {para}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
