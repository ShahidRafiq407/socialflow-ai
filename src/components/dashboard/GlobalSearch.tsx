"use client";

// ============================================================================
// GLOBAL SEARCH
//
// The header used to render two hardcoded rows ("Q3 LinkedIn Thought
// Leadership", "Generate AI Campaign") that did nothing, a ⌘K hint on Windows,
// and no keyboard shortcut behind it. This is the real thing: debounced search
// over the active workspace, navigable commands, working recents, and a shortcut
// that matches the platform it is shown on.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  Building2,
  Clock,
  ExternalLink,
  FileText,
  Hash,
  Loader2,
  Newspaper,
  Search,
  Share2,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { visibleSidebarLinks } from "@/components/dashboard/Sidebar";
import { searchWorkspace, type SearchHit } from "@/actions/search";
import { switchWorkspace } from "@/actions/workspaces";

const RECENTS_LIMIT = 5;
const DEBOUNCE_MS = 250;

/** Actions that are not just a page in the sidebar. */
const QUICK_ACTIONS: { label: string; sublabel: string; href: string; icon: LucideIcon }[] = [
  { label: "Generate content", sublabel: "Content Studio", href: "/dashboard/ai-studio", icon: Sparkles },
  { label: "Write an article", sublabel: "Article Writer", href: "/dashboard/article-writer", icon: Newspaper },
  { label: "Connect an account", sublabel: "Integrations", href: "/dashboard/integrations", icon: Share2 },
];

const HIT_ICONS: Record<SearchHit["kind"], LucideIcon> = {
  post: FileText,
  published: ExternalLink,
  article: Newspaper,
  chat: Bot,
  account: Share2,
  hashtags: Hash,
  workspace: Building2,
};

type Row =
  | { type: "command"; key: string; label: string; sublabel?: string; href: string; icon: LucideIcon }
  | { type: "hit"; key: string; hit: SearchHit };

/** Recents are per workspace: another brand's searches are not your history. */
function recentsKey(workspaceId: string | null): string {
  return `postloom-recent-searches:${workspaceId || "none"}`;
}

function readRecents(workspaceId: string | null): string[] {
  try {
    const raw = window.localStorage.getItem(recentsKey(workspaceId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").slice(0, RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

export interface GlobalSearchProps {
  activeWorkspaceId: string | null;
  /** From the admin's feature flags, so ⌘K cannot offer a disabled page. */
  affiliateEnabled?: boolean;
}

export function GlobalSearch({ activeWorkspaceId, affiliateEnabled = true }: GlobalSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [isMac, setIsMac] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.userAgent));
    setRecents(readRecents(activeWorkspaceId));
  }, [activeWorkspaceId]);

  // ⌘K on macOS, Ctrl+K everywhere else — the hint the header shows now matches
  // the key that actually works.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Debounced so a fast typist fires one query, not one per keystroke. The
  // sequence guard drops answers that arrive after a newer query was sent.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchWorkspace(term);
        if (!cancelled) setHits(results);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const commands = useMemo<Row[]>(() => {
    const term = query.trim().toLowerCase();
    const all: Row[] = [
      ...QUICK_ACTIONS.map((action) => ({
        type: "command" as const,
        key: `action:${action.href}:${action.label}`,
        label: action.label,
        sublabel: action.sublabel,
        href: action.href,
        icon: action.icon,
      })),
      ...visibleSidebarLinks(affiliateEnabled).map((link) => ({
        type: "command" as const,
        key: `nav:${link.href}`,
        label: link.name,
        sublabel: "Go to page",
        href: link.href,
        icon: link.icon as LucideIcon,
      })),
    ];

    if (!term) return all.slice(0, 6);
    return all
      .filter((row) => row.type === "command" && row.label.toLowerCase().includes(term))
      .slice(0, 5);
  }, [query, affiliateEnabled]);

  const hitRows = useMemo<Row[]>(
    () => hits.map((hit) => ({ type: "hit" as const, key: `${hit.kind}:${hit.id}`, hit })),
    [hits]
  );

  const rows = useMemo(() => [...commands, ...hitRows], [commands, hitRows]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, hits.length]);

  const rememberQuery = useCallback(
    (term: string) => {
      const value = term.trim();
      if (value.length < 2) return;
      const next = [value, ...recents.filter((r) => r.toLowerCase() !== value.toLowerCase())].slice(
        0,
        RECENTS_LIMIT
      );
      setRecents(next);
      try {
        window.localStorage.setItem(recentsKey(activeWorkspaceId), JSON.stringify(next));
      } catch {
        // A full or blocked storage quota must not break navigation.
      }
    },
    [recents, activeWorkspaceId]
  );

  const activate = useCallback(
    (row: Row) => {
      rememberQuery(query);
      setOpen(false);

      if (row.type === "command") {
        router.push(row.href);
        return;
      }

      const { hit } = row;

      // A workspace row is a switch, not a navigation: the id goes back to the
      // server action, which re-checks ownership before writing the cookie.
      if (hit.kind === "workspace") {
        startTransition(async () => {
          const result = await switchWorkspace(hit.id);
          if (result.success) router.refresh();
        });
        return;
      }

      if (hit.external && /^https?:\/\//i.test(hit.href)) {
        window.open(hit.href, "_blank", "noopener,noreferrer");
        return;
      }

      router.push(hit.href);
    },
    [query, rememberQuery, router, startTransition]
  );

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) activate(row);
    }
  }

  function clearRecents() {
    setRecents([]);
    try {
      window.localStorage.removeItem(recentsKey(activeWorkspaceId));
    } catch {
      // Nothing to do — the in-memory list is already empty.
    }
  }

  function renderRow(row: Row, index: number) {
    const isActive = index === activeIndex;
    const Icon = row.type === "command" ? row.icon : HIT_ICONS[row.hit.kind];
    const label = row.type === "command" ? row.label : row.hit.title;
    const sublabel = row.type === "command" ? row.sublabel : row.hit.subtitle;
    const badge = row.type === "hit" ? row.hit.badge : undefined;

    return (
      <button
        key={row.key}
        type="button"
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => activate(row)}
        className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
          isActive ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0">
            <span className="block truncate text-slate-800 dark:text-slate-200">{label}</span>
            {sublabel && (
              <span className="block truncate text-[10px] text-slate-400">{sublabel}</span>
            )}
          </span>
        </span>
        {badge ? (
          <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
            {badge}
          </Badge>
        ) : (
          <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
        )}
      </button>
    );
  }

  const term = query.trim();

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(Boolean(next))}>
      <PopoverTrigger
        aria-label="Search everything"
        className="flex h-8 items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-2 md:px-2.5 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none md:w-64 md:justify-between"
      >
        <span className="flex items-center gap-2 truncate">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline truncate">Search everything…</span>
        </span>
        <kbd className="hidden md:inline-flex items-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 font-sans text-[10px] text-slate-400 shrink-0">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        initialFocus={inputRef}
        className="w-[min(92vw,28rem)] gap-0 p-0 overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Posts, articles, tasks, accounts, workspaces…"
            aria-label="Search this workspace"
            className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {/* Recents only make sense on an empty box — once you are typing, the
              live results are the better answer. */}
          {!term && recents.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Clock className="h-3 w-3" />
                  Recent
                </span>
                <button
                  type="button"
                  onClick={clearRecents}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1 px-1">
                {recents.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => setQuery(recent)}
                    className="max-w-full truncate rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {recent}
                  </button>
                ))}
              </div>
            </div>
          )}

          {commands.length > 0 && (
            <div className="mb-1">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {term ? "Commands" : "Quick actions"}
              </p>
              {commands.map((row, index) => renderRow(row, index))}
            </div>
          )}

          {term.length >= 2 && (
            <div>
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                In this workspace
              </p>
              {hitRows.length > 0 ? (
                hitRows.map((row, index) => renderRow(row, commands.length + index))
              ) : searching ? (
                <p className="px-2 py-3 text-xs text-slate-400">Searching…</p>
              ) : (
                <p className="px-2 py-3 text-xs text-slate-400">
                  Nothing in this workspace matches “{term}”. Other workspaces are
                  searched separately — switch to one to look inside it.
                </p>
              )}
            </div>
          )}

          {term.length === 1 && (
            <p className="px-2 py-2 text-[11px] text-slate-400">
              Keep typing — search starts at two characters.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 text-[10px] text-slate-400">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span className="hidden sm:inline">esc close</span>
          <span className="ml-auto hidden sm:inline">Scoped to the active workspace</span>
        </div>

      </PopoverContent>
    </Popover>
  );
}






