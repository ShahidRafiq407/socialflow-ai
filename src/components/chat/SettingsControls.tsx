"use client";

// ============================================================================
// SETTINGS CONTROLS
//
// The primitives the settings panel is built from. Kept separate so the panel
// itself reads as a list of settings rather than a wall of markup.
// ============================================================================

import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b mkt-border px-4 py-4 last:border-b-0">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider mkt-faint">{title}</h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium mkt-text">{label}</div>
          {hint && <div className="mt-0.5 text-[11.5px] leading-snug mkt-faint">{hint}</div>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
        checked
          ? "border-transparent bg-[color:var(--mkt-accent)]"
          : "mkt-border bg-[color:var(--mkt-bg2)]"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[16px] w-[16px] rounded-full transition-all ${
          checked ? "left-[19px] bg-black" : "left-[2px] bg-[color:var(--mkt-muted)]"
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border mkt-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2 py-1 text-[11.5px] capitalize transition-colors ${
            value === option.value ? "bg-[color:var(--mkt-accent)] font-medium text-black" : "mkt-muted hover:mkt-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-[color:var(--mkt-border)] accent-[color:var(--mkt-accent)]"
      />
      <span className="w-9 text-right font-mono text-[11.5px] mkt-muted">
        {format ? format(value) : value}
      </span>
    </div>
  );
}
