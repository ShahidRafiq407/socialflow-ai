"use client";

// ============================================================================
// CHAT WORKBENCH
//
// The Automate Task tab. Three columns: history, the conversation, and whichever
// panel is open (settings or memory). Everything the controller can do is
// reachable from here — that is the point of the tab.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Brain,
  Inbox,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import type { ChatMessage, ChatSessionSummary } from "@/lib/agents/controller/types";
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from "@/lib/agents/controller/settingsShape";
import { chatModelLabel } from "@/lib/agents/controller/models";
import type { ConnectedPlugin } from "@/lib/plugins/connected";
import { useChatStream, type PendingFile } from "./useChatStream";
import { MessageThread } from "./MessageThread";
import { Composer } from "./Composer";
import { SessionRail } from "./SessionRail";
import { SettingsPanel } from "./SettingsPanel";
import { MemoryPanel } from "./MemoryPanel";
import { RequestsPanel } from "./RequestsPanel";
import { EmptyState } from "./EmptyState";

interface ChatWorkbenchProps {
  workspaceId: string;
  workspaceName: string;
  initialSessionId: string | null;
  initialMessages: ChatMessage[];
  initialSessions: ChatSessionSummary[];
  initialSettings: ChatSettings;
  /** Plugins this workspace has connected, for one-tap mentions in the composer. */
  connectedPlugins: ConnectedPlugin[];
  /** Panel to open on load, from a `?panel=` deep link (e.g. open_tab → settings). */
  initialPanel?: SidePanel;
}

type SidePanel = "none" | "settings" | "memory" | "requests";

export function ChatWorkbench({
  workspaceId,
  workspaceName,
  initialSessionId,
  initialMessages,
  initialSessions,
  initialSettings,
  connectedPlugins,
  initialPanel,
}: ChatWorkbenchProps) {
  const router = useRouter();

  const [settings, setSettings] = useState<ChatSettings>(initialSettings || DEFAULT_CHAT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>(initialSessions);
  const [showArchived, setShowArchived] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [panel, setPanel] = useState<SidePanel>(initialPanel || "none");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [openedArtifacts, setOpenedArtifacts] = useState<Set<string>>(new Set());

  const refreshSessions = useCallback(
    async (archived = showArchived) => {
      try {
        const res = await fetch(
          `/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}&archived=${archived}`
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data.sessions)) setSessions(data.sessions);
      } catch {
        /* the rail is not worth an error banner */
      }
    },
    [workspaceId, showArchived]
  );

  const chat = useChatStream({
    workspaceId,
    initialSessionId,
    initialMessages,
    onSessionCreated: () => void refreshSessions(),
    // The session renamed itself from the conversation: show it immediately, and
    // let the refresh confirm it from the database.
    onTitle: (sessionId, title) => {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
      void refreshSessions();
    },
    onTurnComplete: () => void refreshSessions(),
  });

  // ---- settings -----------------------------------------------------------

  const updateSettings = useCallback(
    (patch: Partial<ChatSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      setSavingSettings(true);
      fetch("/api/chat/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, settings: patch }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.settings) setSettings(data.settings);
        })
        .catch(() => setLocalNotice("Could not save that setting — it applies to this session only."))
        .finally(() => setSavingSettings(false));
    },
    [workspaceId]
  );

  // ---- sessions -----------------------------------------------------------

  const openSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === chat.sessionId) return;
      setOpeningId(sessionId);
      try {
        const res = await fetch(
          `/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not open that chat");
        chat.loadSession(sessionId, Array.isArray(data.messages) ? data.messages : []);
        setOpenedArtifacts(new Set());
      } catch (err) {
        setLocalNotice(err instanceof Error ? err.message : "Could not open that chat");
      } finally {
        setOpeningId(null);
      }
    },
    [workspaceId, chat]
  );

  const patchSession = useCallback(
    async (sessionId: string, patch: { title?: string; pinned?: boolean; archived?: boolean }) => {
      setSessions((prev) =>
        patch.archived !== undefined && patch.archived !== showArchived
          ? prev.filter((s) => s.id !== sessionId)
          : prev.map((s) => (s.id === sessionId ? { ...s, ...patch } : s))
      );
      await fetch("/api/chat/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, sessionId, ...patch }),
      }).catch(() => undefined);
      void refreshSessions();
    },
    [workspaceId, showArchived, refreshSessions]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (sessionId === chat.sessionId) chat.loadSession(null, []);
      await fetch(
        `/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" }
      ).catch(() => undefined);
    },
    [workspaceId, chat]
  );

  const toggleArchived = useCallback(() => {
    const next = !showArchived;
    setShowArchived(next);
    void refreshSessions(next);
  }, [showArchived, refreshSessions]);

  // ---- sending ------------------------------------------------------------

  const send = useCallback(
    (text: string, files: PendingFile[]) => {
      setDraft("");
      setLocalNotice(null);
      void chat.send({ text, files, model: settings.model });
    },
    [chat, settings.model]
  );

  const retry = useCallback(
    (userMessage: ChatMessage | undefined) => {
      if (!userMessage || userMessage.role !== "user") return;
      void chat.send({ text: userMessage.content, model: settings.model });
    },
    [chat, settings.model]
  );

  // Jump to whatever the controller just created, when the user asked for that.
  useEffect(() => {
    if (!settings.autoOpenLinks || chat.streaming) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const target = (last.artifacts || []).find((a) => a.href?.startsWith("/dashboard/"));
    if (!target?.href || openedArtifacts.has(target.id)) return;
    setOpenedArtifacts((prev) => new Set(prev).add(target.id));
    router.push(target.href);
  }, [settings.autoOpenLinks, chat.streaming, chat.messages, openedArtifacts, router]);

  const activeTitle = useMemo(() => {
    const session = sessions.find((s) => s.id === chat.sessionId);
    return session?.title || (chat.messages.length > 0 ? "Current chat" : "New chat");
  }, [sessions, chat.sessionId, chat.messages.length]);

  const notice = localNotice
    ? { level: "warn" as const, message: localNotice }
    : chat.notice;

  const modelLabel = chatModelLabel(chat.activeModel || settings.model);

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* History rail */}
      <aside
        className={`hidden shrink-0 border-r mkt-border transition-all lg:block ${
          railOpen ? "w-[212px]" : "w-0 overflow-hidden"
        }`}
      >
        {railOpen && (
          <SessionRail
            sessions={sessions}
            activeSessionId={chat.sessionId}
            loadingId={openingId}
            showArchived={showArchived}
            onToggleArchived={toggleArchived}
            onNewChat={() => {
              chat.loadSession(null, []);
              setOpenedArtifacts(new Set());
              setDraft("");
            }}
            onOpen={(id) => void openSession(id)}
            onPatch={(id, patch) => void patchSession(id, patch)}
            onDelete={(id) => void deleteSession(id)}
          />
        )}
      </aside>

      {/* Conversation */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b mkt-border px-3 py-2.5">
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            title={railOpen ? "Hide history" : "Show history"}
            className="hidden h-8 w-8 items-center justify-center rounded-lg mkt-faint transition-colors hover:mkt-bg2 hover:mkt-text lg:flex"
          >
            {railOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[13.5px] font-semibold mkt-text">{activeTitle}</h1>
            <p className="truncate text-[11px] mkt-faint">
              {workspaceName} · {modelLabel}
              {settings.autonomy === "confirm" && " · asks before acting"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPanel((p) => (p === "memory" ? "none" : "memory"))}
            title="Memory"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:mkt-bg2 ${
              panel === "memory" ? "mkt-accent-text mkt-bg2" : "mkt-faint hover:mkt-text"
            }`}
          >
            <Brain className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "requests" ? "none" : "requests"))}
            title="Requests — what the chat couldn't do yet"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:mkt-bg2 ${
              panel === "requests" ? "mkt-accent-text mkt-bg2" : "mkt-faint hover:mkt-text"
            }`}
          >
            <Inbox className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "settings" ? "none" : "settings"))}
            title="Settings"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:mkt-bg2 ${
              panel === "settings" ? "mkt-accent-text mkt-bg2" : "mkt-faint hover:mkt-text"
            }`}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </header>

        {notice && (
          <div
            className={`flex shrink-0 items-start gap-2 border-b mkt-border px-4 py-2 text-[12px] ${
              notice.level === "warn" ? "text-amber-300" : "mkt-muted"
            }`}
          >
            {notice.level === "warn" ? (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span className="flex-1">{notice.message}</span>
            <button
              type="button"
              onClick={() => {
                setLocalNotice(null);
                chat.setNotice(null);
              }}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {chat.memoryFlash.length > 0 && chat.streaming && (
          <div className="flex shrink-0 items-center gap-2 border-b mkt-border px-4 py-1.5 text-[11.5px] mkt-faint">
            <Sparkles className="h-3 w-3 shrink-0 mkt-accent-text" />
            <span className="truncate">
              Recalling: {chat.memoryFlash.map((f) => f.content).join(" · ")}
            </span>
          </div>
        )}

        {chat.messages.length === 0 ? (
          <EmptyState
            workspaceName={workspaceName}
            busy={chat.streaming}
            onRun={(text) => send(text, [])}
          />
        ) : (
          <MessageThread
            messages={chat.messages}
            settings={settings}
            streaming={chat.streaming}
            onSuggestion={(text) => send(text, [])}
            onRetry={retry}
          />
        )}

        <Composer
          settings={settings}
          streaming={chat.streaming}
          status={chat.status}
          draft={draft}
          plugins={connectedPlugins}
          onDraftChange={setDraft}
          onSend={send}
          onStop={chat.stop}
          onSettingsChange={updateSettings}
          onNotice={setLocalNotice}
        />
      </main>

      {/* Settings / memory / requests */}
      {panel !== "none" && (
        <aside className="hidden w-[320px] shrink-0 border-l mkt-border xl:block">
          {renderPanel(panel)}
        </aside>
      )}

      {/* Same panels as an overlay on narrow screens */}
      {panel !== "none" && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 xl:hidden">
          <button
            type="button"
            aria-label="Close panel"
            className="flex-1"
            onClick={() => setPanel("none")}
          />
          <div className="h-full w-[min(340px,88vw)] mkt-bg shadow-2xl">{renderPanel(panel)}</div>
        </div>
      )}
    </div>
  );

  function renderPanel(which: SidePanel) {
    if (which === "settings") {
      return (
        <SettingsPanel
          settings={settings}
          saving={savingSettings}
          onChange={updateSettings}
          onClose={() => setPanel("none")}
        />
      );
    }
    if (which === "requests") {
      return <RequestsPanel workspaceId={workspaceId} onClose={() => setPanel("none")} />;
    }
    if (which === "memory") {
      return <MemoryPanel workspaceId={workspaceId} onClose={() => setPanel("none")} />;
    }
    return null;
  }
}
