"use client";

// ============================================================================
// MEMORY PANEL
//
// What the controller actually knows, editable by hand. Pinned facts load on
// every single turn regardless of relevance — that is the "never forgets"
// guarantee, and this panel is where the user controls it.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";

interface MemoryFact {
  id: string;
  category: string;
  content: string;
  importance: number;
  pinned: boolean;
  source: string;
  createdAt: string;
}

interface MemoryPanelProps {
  workspaceId: string;
  onClose: () => void;
}

export function MemoryPanel({ workspaceId, onClose }: MemoryPanelProps) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (search?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ workspaceId, limit: "80" });
        if (search?.trim()) params.set("query", search.trim());
        const res = await fetch(`/api/chat/memory?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not load memory");
        setFacts(Array.isArray(data.facts) ? data.facts : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load memory");
      } finally {
        setLoading(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    setAdding(true);
    try {
      const res = await fetch("/api/chat/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, content, pinned: true, importance: 5, category: "user" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save that");
      setDraft("");
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    } finally {
      setAdding(false);
    }
  };

  const togglePin = async (fact: MemoryFact) => {
    setFacts((prev) => prev.map((f) => (f.id === fact.id ? { ...f, pinned: !f.pinned } : f)));
    await fetch("/api/chat/memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, id: fact.id, pinned: !fact.pinned }),
    }).catch(() => undefined);
  };

  const remove = async (id: string) => {
    setFacts((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/chat/memory?workspaceId=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b mkt-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 mkt-accent-text" />
          <h2 className="text-[13px] font-semibold mkt-text">Memory</h2>
          <span className="text-[11px] mkt-faint">{facts.length}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg mkt-faint transition-colors hover:mkt-bg2 hover:mkt-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 space-y-2 border-b mkt-border px-3 py-3">
        <div className="flex items-center gap-2 rounded-xl border mkt-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 mkt-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load(query)}
            placeholder="Search what it knows"
            className="w-full bg-transparent text-[12.5px] mkt-text outline-none placeholder:mkt-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                void load();
              }}
              className="shrink-0 mkt-faint hover:mkt-text"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex items-start gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Teach it something it should never forget…"
            className="w-full resize-none rounded-xl border mkt-border bg-transparent px-2.5 py-2 text-[12.5px] leading-snug mkt-text outline-none placeholder:mkt-faint focus:border-[color:var(--mkt-accent)]/60"
          />
          <button
            type="button"
            onClick={add}
            disabled={adding || !draft.trim()}
            title="Remember this"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--mkt-accent)] text-black transition-opacity disabled:opacity-35"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error && <p className="mb-2 text-[12px] text-red-400">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] mkt-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading
          </div>
        ) : facts.length === 0 ? (
          <p className="py-8 text-center text-[12px] leading-relaxed mkt-faint">
            Nothing stored yet. Tell the chat something about your brand and it will remember it — or add it here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {facts.map((fact) => (
              <li key={fact.id} className="group rounded-xl border mkt-border px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-[1.6] mkt-text">{fact.content}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[10.5px] mkt-faint">
                      <span className="rounded border mkt-border px-1 py-px">{fact.category}</span>
                      <span>importance {fact.importance}</span>
                      {fact.source === "user" && <span>· added by you</span>}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      title={fact.pinned ? "Unpin" : "Pin — always load this"}
                      onClick={() => void togglePin(fact)}
                      className={`flex h-6 w-6 items-center justify-center rounded ${
                        fact.pinned ? "mkt-accent-text" : "mkt-faint hover:mkt-text"
                      }`}
                    >
                      {fact.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      title="Forget this"
                      onClick={() => void remove(fact.id)}
                      className="flex h-6 w-6 items-center justify-center rounded mkt-faint hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>

                  {fact.pinned && (
                    <Pin className="h-3 w-3 shrink-0 mkt-accent-text group-hover:hidden" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
