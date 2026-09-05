import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { getChatSettings, liveDefaults } from "@/lib/agents/controller/settings";
import { chatCataloguePayload, type ChatCataloguePayload } from "@/lib/agents/controller/catalogue";
import { listSessions, loadSessionMessages } from "@/lib/agents/controller/session";
import { listConnectedPlugins, type ConnectedPlugin } from "@/lib/plugins/connected";
import { ChatWorkbench } from "@/components/chat/ChatWorkbench";
import LockedSurface from "@/components/billing/LockedSurface";
import { surfaceAccess } from "@/lib/billing/access.server";
import type { ChatMessage, ChatSessionSummary } from "@/lib/agents/controller/types";
import type { ChatSettings } from "@/lib/agents/controller/settings";

export const dynamic = "force-dynamic";

/** Nothing on this page is worth a spinner-forever, so every query has a floor. */
function withTimeout<T>(promise: Promise<T>, fallback: T, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]).catch(() => fallback);
}

export default async function AutomateTaskPage({
  searchParams,
}: {
  searchParams?: Promise<{ session?: string; panel?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Before the workspace read, and before the sessions and plugin lists: this whole
  // tab is the CEO chat, so a plan without it has nothing here to load. It used to
  // render the full workbench on Free and refuse at the first message, after the
  // person had typed one.
  const gate = await surfaceAccess(userId, "chat.message");
  if (!gate.allowed) {
    return (
      <LockedSurface
        access={gate}
        title="Automate Task"
        purpose="A chat that runs the account: it reads your workspace, drafts and schedules posts, and reports back — using your connected tools when you let it."
      />
    );
  }

  const params = (await searchParams) || {};

  // Deep links like ?panel=settings / ?panel=requests open that panel on load.
  const PANELS = ["settings", "memory", "requests"] as const;
  const initialPanel = PANELS.includes(params.panel as (typeof PANELS)[number])
    ? (params.panel as (typeof PANELS)[number])
    : undefined;

  const workspace = await withTimeout(
    prisma.workspace.findFirst({
      ...(await activeWorkspaceQuery(userId)),
      select: { id: true, name: true },
    }),
    null
  );

  if (!workspace) {
    return (
      <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-[15px] font-semibold mkt-text">Workspace not ready</h1>
          <p className="mt-2 text-[13px] leading-relaxed mkt-muted">
            We could not load your workspace. Refresh the page — if it keeps happening, finish
            onboarding first and the controller will have something to work with.
          </p>
        </div>
      </div>
    );
  }

  const [settings, sessions, connectedPlugins, catalogue] = await Promise.all([
    withTimeout<ChatSettings | null>(getChatSettings(workspace.id), null),
    withTimeout<ChatSessionSummary[]>(listSessions(workspace.id, { limit: 40 }), []),
    withTimeout<ConnectedPlugin[]>(listConnectedPlugins(workspace.id), []),
    // Sent with the first render so the picker, the composer label and the credit
    // warning are right on paint. Without it the browser starts on the one model
    // compiled into the bundle and only becomes correct once a `useEffect` has
    // round-tripped — so every model the admin added was missing for a beat, and
    // missing for the whole session if that fetch failed.
    withTimeout<ChatCataloguePayload | null>(chatCataloguePayload(userId), null),
  ]);

  // Reopen whatever was last worked on — a pinned chat sorts first in the rail
  // but "most recent" is what the user expects to land in.
  const requested = params.session
    ? sessions.find((s) => s.id === params.session)
    : undefined;
  const mostRecent = sessions.reduce<ChatSessionSummary | undefined>(
    (latest, s) => (!latest || s.updatedAt > latest.updatedAt ? s : latest),
    undefined
  );
  const target = requested || mostRecent;

  let initialMessages: ChatMessage[] = [];
  if (target) {
    const loaded = await withTimeout(loadSessionMessages(workspace.id, target.id), {
      session: null,
      messages: [] as ChatMessage[],
    });
    initialMessages = loaded.messages;
  }

  // `liveDefaults()` rather than the shipped `DEFAULT_CHAT_SETTINGS`: the read above
  // is raced against a 3s timeout, and on a slow cold instance — the one case where
  // this fallback is reached — handing the browser the build-time model id is the
  // exact staleness the back office's "default chat brain" switch is meant to fix.
  // Safe to read synchronously here: `surfaceAccess` at the top of this function
  // already awaited `ensureRuntimeConfig()` via `getPlanContext`.
  const initialSettings = settings || liveDefaults();

  return (
    <div className="h-[calc(100vh-4.5rem)] w-full">
      <ChatWorkbench
        workspaceId={workspace.id}
        workspaceName={workspace.name || "your workspace"}
        initialSessionId={target?.id || null}
        initialMessages={initialMessages}
        initialSessions={sessions}
        initialSettings={initialSettings}
        initialCatalogue={catalogue}
        settingsDegraded={settings === null}
        connectedPlugins={connectedPlugins}
        initialPanel={initialPanel}
      />
    </div>
  );
}
