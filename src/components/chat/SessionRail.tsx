"use client";

// ============================================================================
// SESSION RAIL
//
// Conversation history: pin the ones that matter, rename, archive, delete. Every
// action hits /api/chat/sessions, which scopes by workspace.
// ============================================================================

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  MessageSquarePlus,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { ChatSessionSummary } from "@/lib/agents/controller/types";

interface SessionRailProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  loadingId: string | null;
  showArchived: boolean;
  onToggleArchived: () => void;
  onNewChat: () => void;
  onOpen: (sessionId: string) => void;
  onPatch: (sessionId: string, patch: { title?: string; pinned?: boolean; archived?: boolean }) => void;
  onDelete: (sessionId: string) => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SessionRail({
  sessions,
  activeSessionId,
  loadingId,
  showArchived,
  onToggleArchived,
  onNewChat,
  onOpen,
  onPatch,
  onDelete,
}: SessionRailProps) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = query.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
    : sessions;

  const commitRename = (sessionId: string) => {
    const title = renameValue.trim();
    if (title) onPatch(sessionId, { title });
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl border mkt-border mkt-surface px-3 py-2 text-[13px] font-medium mkt-text transition-colors hover:border-[color:var(--mkt-accent)]/60 hover:mkt-accent-text"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>

        <div className="flex items-center gap-2 rounded-xl border mkt-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 mkt-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-[12.5px] mkt-text outline-none placeholder:mkt-faint"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="shrink-0 mkt-faint hover:mkt-text">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] mkt-faint">
            {showArchived ? "Nothing archived." : query ? "No matching chats." : "No chats yet."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <li key={session.id} className="group relative">
                  {renamingId === session.id ? (
                    <div className="flex items-center gap-1 rounded-lg border border-[color:var(--mkt-accent)]/60 px-2 py-1.5">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(session.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="w-full bg-transparent text-[12.5px] mkt-text outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => commitRename(session.id)}
                        className="shrink-0 mkt-accent-text"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpen(session.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                        active ? "mkt-bg2 mkt-text" : "mkt-muted hover:mkt-bg2 hover:mkt-text"
                      }`}
                    >
                      {session.pinned && <Pin className="h-3 w-3 shrink-0 mkt-accent-text" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] leading-tight">{session.title}</span>
                        <span className="mt-0.5 block text-[10.5px] mkt-faint">
                          {relativeTime(session.updatedAt)}
                          {session.messageCount > 0 && ` · ${session.messageCount} msg`}
                          {loadingId === session.id && " · opening…"}
                        </span>
                      </span>
                    </button>
                  )}

                  {renamingId !== session.id && (
                    <div className="absolute right-1 top-1.5 hidden items-center gap-0.5 rounded-lg mkt-surface px-1 py-0.5 group-hover:flex">
                      <button
                        type="button"
                        title={session.pinned ? "Unpin" : "Pin"}
                        onClick={() => onPatch(session.id, { pinned: !session.pinned })}
                        className="flex h-6 w-6 items-center justify-center rounded mkt-faint hover:mkt-text"
                      >
                        {session.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        title="Rename"
                        onClick={() => {
                          setRenamingId(session.id);
                          setRenameValue(session.title);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded mkt-faint hover:mkt-text"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title={session.archived ? "Restore" : "Archive"}
                        onClick={() => onPatch(session.id, { archived: !session.archived })}
                        className="flex h-6 w-6 items-center justify-center rounded mkt-faint hover:mkt-text"
                      >
                        {session.archived ? (
                          <ArchiveRestore className="h-3 w-3" />
                        ) : (
                          <Archive className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        title={confirmId === session.id ? "Click again to delete" : "Delete"}
                        onClick={() => {
                          if (confirmId === session.id) {
                            onDelete(session.id);
                            setConfirmId(null);
                          } else {
                            setConfirmId(session.id);
                            setTimeout(() => setConfirmId((v) => (v === session.id ? null : v)), 3000);
                          }
                        }}
                        className={`flex h-6 w-6 items-center justify-center rounded ${
                          confirmId === session.id ? "text-red-400" : "mkt-faint hover:text-red-400"
                        }`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t mkt-border p-2">
        <button
          type="button"
          onClick={onToggleArchived}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] mkt-faint transition-colors hover:mkt-muted"
        >
          <Archive className="h-3 w-3" />
          {showArchived ? "Back to active chats" : "Archived chats"}
        </button>
      </div>
    </div>
  );
}
