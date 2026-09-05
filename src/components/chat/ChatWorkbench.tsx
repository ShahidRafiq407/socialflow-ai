"use client";

// ============================================================================
// CHAT WORKBENCH
//
// The Automate Task tab. Three columns: history, the conversation, and whichever
// panel is open (settings or memory). Everything the controller can do is
// reachable from here — that is the point of the tab.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { chatModelLabel, resolveChatModel, setChatModelCatalog, type ChatModelInfo } from "@/lib/agents/controller/models";
import type { ChatCataloguePayload } from "@/lib/agents/controller/catalogue";
import { CONFIG_REVISION_EVENT } from "@/components/dashboard/ConfigSync";
import type { ConnectedPlugin } from "@/lib/plugins/connected";
import { submitChatFeedback, getSessionFeedback } from "@/actions/chatFeedback";
import { useChatStream, type ChatNotice, type PendingFile } from "./useChatStream";
import { MessageThread, type FeedbackVotes } from "./MessageThread";
import { Composer } from "./Composer";
import { SessionRail } from "./SessionRail";
import { SettingsPanel, type ModelAvailability } from "./SettingsPanel";
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
  /**
   * The live model catalogue, resolved on the server for the first render.
   *
   * `models.ts` is compiled into this bundle, so the browser's copy of the
   * catalogue starts as the single model that shipped with the build — the admin's
   * additions only arrive once `loadCatalogue` has round-tripped. Seeding from a
   * prop makes the first paint correct and makes a failed fetch survivable.
   * Null when the server-side read timed out; the fetch below then fills it in.
   */
  initialCatalogue?: ChatCataloguePayload | null;
  /**
   * True when the server's settings read timed out and `initialSettings` is a
   * default rather than this workspace's stored row.
   *
   * The workbench then adopts the settings that come back with the catalogue
   * fetch, once, so a degraded first render heals itself instead of showing
   * someone else's defaults until they reload. Only once, and only in this case:
   * `loadCatalogue` re-runs on every config-revision event, and adopting there
   * unconditionally would overwrite an edit the user has in flight.
   */
  settingsDegraded?: boolean;
  /** Plugins this workspace has connected, for one-tap mentions in the composer. */
  connectedPlugins: ConnectedPlugin[];
  /** Panel to open on load, from a `?panel=` deep link (e.g. open_tab → settings). */
  initialPanel?: SidePanel;
}

type SidePanel = "none" | "settings" | "memory" | "requests";

/** The per-model facts the settings panel needs, keyed by id. */
function availabilityOf(models: Array<ChatModelInfo & { locked?: boolean }>): Record<string, ModelAvailability> {
  return Object.fromEntries(
    models.map((m) => [
      m.id,
      {
        chatCredits: m.chatCredits,
        locked: m.locked,
        minPlan: m.minPlan ?? null,
        provider: m.provider,
        contextWindow: m.contextWindow,
      },
    ])
  );
}

/**
 * Points the bundled catalogue singleton at the server's list.
 *
 * `includeBuiltIn: false` because the payload is already the authoritative
 * pickable set: re-seeding the shipped row here would put a model the admin has
 * disabled for chat back in the picker, unlocked, for a request the stream route
 * then refuses.
 */
function seedCatalogue(
  models: Array<ChatModelInfo & { locked?: boolean }>,
  defaultModelId?: string | null
): void {
  setChatModelCatalog(models, defaultModelId ?? null, { includeBuiltIn: false });
}

export function ChatWorkbench({
  workspaceId,
  workspaceName,
  initialSessionId,
  initialMessages,
  initialSessions,
  initialSettings,
  initialCatalogue,
  settingsDegraded,
  connectedPlugins,
  initialPanel,
}: ChatWorkbenchProps) {
  const router = useRouter();

  // Before the first paint, not in an effect: the composer label, the header and
  // the picker all read the module singleton during render.
  useMemo(() => {
    if (initialCatalogue?.models?.length) {
      seedCatalogue(initialCatalogue.models, initialCatalogue.defaultModelId);
    }
  }, [initialCatalogue]);

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
  const [feedbackOn, setFeedbackOn] = useState(initialCatalogue?.flags?.feedback ?? true);
  const [pickerOn, setPickerOn] = useState(initialCatalogue?.flags?.modelPicker ?? true);
  const [availability, setAvailability] = useState<Record<string, ModelAvailability>>(() =>
    initialCatalogue?.models?.length ? availabilityOf(initialCatalogue.models) : {}
  );
  const [catalogueVersion, setCatalogueVersion] = useState(0);
  const [defaultCredits, setDefaultCredits] = useState<number | undefined>(
    initialCatalogue?.defaultChatCredits
  );
  const [plan, setPlan] = useState<string | null>(initialCatalogue?.plan ?? null);

  /** One-shot latch for the degraded-render heal described on `settingsDegraded`. */
  const adoptedSettings = useRef(!settingsDegraded);

  // The live configuration the admin controls: which models the picker may show
  // (with this plan's locks and prices) and whether feedback is on. The browser's
  // catalogue is whatever the server last said, so a model added in the back
  // office appears here without a deploy — and `ConfigSync` re-runs this the
  // moment the admin changes anything, so an open tab never offers a stale list.
  const loadCatalogue = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/settings?workspaceId=${encodeURIComponent(workspaceId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success) return;

      if (Array.isArray(data.models)) {
        const models = data.models as Array<ChatModelInfo & { locked?: boolean }>;
        seedCatalogue(models, typeof data.defaultModelId === "string" ? data.defaultModelId : null);
        setAvailability(availabilityOf(models));
        setCatalogueVersion((v) => v + 1);
      }
      if (typeof data.defaultChatCredits === "number") setDefaultCredits(data.defaultChatCredits);
      if (typeof data.plan === "string") setPlan(data.plan);
      if (data.flags && typeof data.flags.feedback === "boolean") setFeedbackOn(data.flags.feedback);
      if (data.flags && typeof data.flags.modelPicker === "boolean") setPickerOn(data.flags.modelPicker);

      if (!adoptedSettings.current && data.settings) {
        adoptedSettings.current = true;
        setSettings(data.settings as ChatSettings);
      }
    } catch {
      // A stale catalogue is better than a broken chat tab.
    }
  }, [workspaceId]);

  useEffect(() => {
    // The prop already seeded the catalogue, so the mount fetch is only worth its
    // round trip when something the server should have sent is missing — a timed-out
    // catalogue, or a timed-out settings row this fetch can heal. `ConfigSync` drives
    // the rest.
    if (!initialCatalogue?.models?.length || !adoptedSettings.current) void loadCatalogue();
    const onConfigChange = () => void loadCatalogue();
    window.addEventListener(CONFIG_REVISION_EVENT, onConfigChange);
    return () => window.removeEventListener(CONFIG_REVISION_EVENT, onConfigChange);
  }, [loadCatalogue, initialCatalogue]);

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

  const notice: ChatNotice | null = localNotice
    ? { level: "warn", message: localNotice }
    : chat.notice;

  // Just the plan locks, so the composer can name the model that will serve the turn
  // without taking a dependency on the whole availability shape.
  const lockedModels = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [id, info] of Object.entries(availability)) out[id] = info.locked === true;
    return out;
  }, [availability]);

  // Re-read after the catalogue arrives, because the label lives in a module-level table.
  //
  // `activeModel` is what a turn reported actually serving it, so it wins outright.
  // With no turn yet, the saved pick is resolved rather than labelled straight: a model
  // the admin disabled, or one this plan lost, is not the one the next turn will use,
  // and the header said otherwise.
  const modelLabel = useMemo(
    () =>
      chat.activeModel
        ? chatModelLabel(chat.activeModel)
        : resolveChatModel(settings.model, (id) => lockedModels[id] === true).label,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.activeModel, settings.model, lockedModels, catalogueVersion]
  );

  // Votes already cast on this session, so the thumbs stay lit after a reload.
  // Keyed by session so switching chats never shows another chat's votes.
  const [voteState, setVoteState] = useState<{ sessionId: string | null; votes: FeedbackVotes }>({ sessionId: null, votes: {} });
  const votes = voteState.sessionId === chat.sessionId ? voteState.votes : {};
  useEffect(() => {
    if (!chat.sessionId || !feedbackOn) return;
    const sessionId = chat.sessionId;
    let cancelled = false;
    getSessionFeedback(sessionId)
      .then((loaded) => {
        if (!cancelled) setVoteState({ sessionId, votes: loaded });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chat.sessionId, feedbackOn]);

  const vote = useCallback(
    (message: ChatMessage, rating: 1 | -1, comment?: string) => {
      const sessionId = chat.sessionId;
      if (!sessionId) return;
      setVoteState((prev) => ({
        sessionId,
        votes: { ...(prev.sessionId === sessionId ? prev.votes : {}), [message.id]: rating },
      }));
      void submitChatFeedback({
        messageId: message.id,
        sessionId,
        workspaceId,
        rating,
        comment,
        model: message.model,
        messageExcerpt: message.content.slice(0, 600),
      }).then((result) => {
        if (!result.success) setLocalNotice(result.error);
      });
    },
    [chat.sessionId, workspaceId]
  );

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
            {notice.action && (
              <Link
                href={notice.action.href}
                className="shrink-0 rounded-md border mkt-border px-2 py-0.5 font-medium hover:bg-white/5"
              >
                {notice.action.label}
              </Link>
            )}
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
            feedback={feedbackOn ? { votes, onVote: vote } : undefined}
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
          lockedModels={lockedModels}
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
          availability={availability}
          pickerEnabled={pickerOn}
          defaultCredits={defaultCredits}
          plan={plan}
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
