"use client";

import React from "react";
import { AlertCircle, Check, ChevronDown, Plus } from "lucide-react";
import type { PluginCatalogEntry } from "@/lib/plugins/catalog";
import { PluginLogoTile } from "./BrandLogos";

// ============================================================================
// PLUGIN DIRECTORY
//
// The directory is a list, not a grid of cards: logo, name, one grey line, and a
// + on the right. Cards made ten plugins fill a screen and a half and buried the
// MCP servers below the fold; rows put the whole catalog in front of the user at
// once, which is the entire point of a directory.
//
// A row is a single <button>, so the + is a <span> that reacts to `group-hover`
// rather than a nested button that keyboard users would have to tab past.
// ============================================================================

export type PluginRowStatus = "connected" | "error" | "idle";

/** The trailing circle: a + to add, a tick once it is connected. */
function Affordance({ status }: { status: PluginRowStatus }) {
  if (status === "connected") {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <Check className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-colors group-hover:border-indigo-500 group-hover:bg-indigo-600 group-hover:text-white dark:border-slate-700 dark:text-slate-500">
      <Plus className="h-4 w-4" />
    </span>
  );
}

const ROW_BASE =
  "group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors";

const ROW_IDLE =
  "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-900/70";

const ROW_FOCUSED =
  "border-indigo-500 bg-indigo-500/[0.04] ring-2 ring-indigo-500/50 ring-offset-2 ring-offset-white dark:ring-offset-slate-950";

export function PluginRow({
  entry,
  status,
  focused = false,
  onOpen,
}: {
  entry: PluginCatalogEntry;
  status: PluginRowStatus;
  /** Ringed after a ?connector= deep link, so the user sees where they landed. */
  focused?: boolean;
  onOpen: (entry: PluginCatalogEntry) => void;
}) {
  return (
    <button
      type="button"
      id={`plugin-${entry.key}`}
      onClick={() => onOpen(entry)}
      aria-label={status === "connected" ? `Manage ${entry.name}` : `Connect ${entry.name}`}
      className={`${ROW_BASE} ${focused ? ROW_FOCUSED : ROW_IDLE}`}
    >
      <PluginLogoTile id={entry.logo} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {entry.name}
          </span>
          {status === "error" && (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
          {entry.blurb}
        </span>
      </span>
      <Affordance status={status} />
    </button>
  );
}

/** "See Zapier, Stripe and 3 more" — names first, because a count alone says nothing. */
function overflowLabel(entries: PluginCatalogEntry[]): string {
  const names = entries.slice(0, 2).map((entry) => entry.name);
  const rest = entries.length - names.length;
  if (rest <= 0) return `See ${names.join(" and ")}`;
  return `See ${names.join(", ")} and ${rest} more`;
}

/**
 * The last row of a long section. It keeps the row geometry so the two-column
 * grid stays even, and it stacks the hidden logos rather than hiding them behind
 * a bare "show more" — the point is to hint at what is in there.
 */
export function PluginOverflowRow({
  entries,
  onExpand,
}: {
  entries: PluginCatalogEntry[];
  onExpand: () => void;
}) {
  if (entries.length === 0) return null;

  return (
    <button type="button" onClick={onExpand} className={`${ROW_BASE} ${ROW_IDLE}`}>
      <span className="flex shrink-0 -space-x-2">
        {entries.slice(0, 3).map((entry) => (
          <PluginLogoTile
            key={entry.key}
            id={entry.logo}
            size="sm"
            className="ring-2 ring-white dark:ring-slate-950"
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
          {overflowLabel(entries)}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
          {entries.length} more in this category
        </span>
      </span>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-colors group-hover:border-slate-300 group-hover:text-slate-600 dark:border-slate-700 dark:text-slate-500">
        <ChevronDown className="h-4 w-4" />
      </span>
    </button>
  );
}

/**
 * One titled category: two columns of rows, capped, with the remainder folded
 * into an overflow row. `visible` is ignored while a search is running, because
 * hiding a match behind "see more" is how a search box loses a user's trust.
 */
export function PluginSection({
  title,
  entries,
  statusFor,
  focusedKey,
  visible,
  expanded,
  onExpand,
  onOpen,
}: {
  title: string;
  entries: PluginCatalogEntry[];
  statusFor: (entry: PluginCatalogEntry) => PluginRowStatus;
  focusedKey?: string | null;
  visible: number;
  expanded: boolean;
  onExpand: () => void;
  onOpen: (entry: PluginCatalogEntry) => void;
}) {
  if (entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, visible);
  const hidden = expanded ? [] : entries.slice(visible);

  return (
    <section>
      <h2 className="px-3 text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
      <div className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {shown.map((entry) => (
          <PluginRow
            key={entry.key}
            entry={entry}
            status={statusFor(entry)}
            focused={focusedKey === entry.key}
            onOpen={onOpen}
          />
        ))}
        <PluginOverflowRow entries={hidden} onExpand={onExpand} />
      </div>
    </section>
  );
}
