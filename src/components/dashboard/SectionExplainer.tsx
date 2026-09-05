"use client";

import React, { useState, useRef, useEffect } from "react";
import { HelpCircle, Lightbulb, X, Sparkles } from "lucide-react";

interface SectionExplainerProps {
  /** The visible title text or heading element */
  title: string;
  /** The hidden explanation revealed on cursor hover (PC) or tap (Mobile) */
  explanation: string;
  /** Optional secondary pro-tip or actionable note */
  tip?: string;
  /** Optional category badge */
  badge?: string;
  /** Optional custom heading level/style (default h1 styling) */
  headingClassName?: string;
  /** Optional container class */
  className?: string;
  /** Alignment of popover relative to title */
  align?: "left" | "right" | "center";
}

export function SectionExplainer({
  title,
  explanation,
  tip,
  badge,
  headingClassName = "text-lg sm:text-xl font-bold tracking-tight text-foreground",
  className = "",
  align = "left",
}: SectionExplainerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Desktop hover handlers with smooth micro-debounce
  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  // Mobile / Touch click toggle
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  // Outside click listener for mobile dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Interactive Title Trigger: Cursor hover on PC, tap on mobile */}
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={isOpen}
        aria-label={`${title} - Click or hover for section explanation`}
        className="group inline-flex items-center gap-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg transition-colors"
      >
        <span
          className={`cursor-help decoration-dotted decoration-muted-foreground/50 underline-offset-4 group-hover:underline group-hover:text-primary transition-colors ${headingClassName}`}
        >
          {title}
        </span>
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all">
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* Popover Card (Hidden by default, shown on cursor hover or mobile tap) */}
      {isOpen && (
        <div
          role="tooltip"
          className={`absolute top-full z-50 mt-2 w-[85vw] max-w-sm sm:max-w-md rounded-xl border border-border bg-card p-4 text-left shadow-xl backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-150 ${
            align === "right"
              ? "right-0"
              : align === "center"
              ? "left-1/2 -translate-x-1/2"
              : "left-0"
          }`}
        >
          {/* Header row */}
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                {title} Guide
              </span>
              {badge && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                  {badge}
                </span>
              )}
            </div>
            {/* Close button for touch / mobile */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
              aria-label="Close explanation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Explanation body */}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground font-normal">
            {explanation}
          </p>

          {/* Optional Pro Tip */}
          {tip && (
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-300">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <span className="leading-snug">{tip}</span>
            </div>
          )}

          {/* Mobile dismissal hint */}
          <div className="mt-2 text-right sm:hidden">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[10px] font-semibold text-primary hover:underline"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
