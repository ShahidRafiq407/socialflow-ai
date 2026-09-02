import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { DEFAULT_CHAT_SETTINGS, getChatSettings } from "@/lib/agents/controller/settings";
import { listSessions, loadSessionMessages } from "@/lib/agents/controller/session";
import { ChatWorkbench } from "@/components/chat/ChatWorkbench";
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

  const params = (await searchParams) || {};

  // Deep links like ?panel=settings / ?panel=requests open that panel on load.
  const PANELS = ["settings", "memory", "requests"] as const;
  const initialPanel = PANELS.includes(params.panel as (typeof PANELS)[number])
    ? (params.panel as (typeof PANELS)[number])
    : undefined;

  const workspace = await withTimeout(
    prisma.workspace.findFirst({
      where: { userId },
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

  const [settings, sessions] = await Promise.all([
    withTimeout<ChatSettings | null>(getChatSettings(workspace.id), null),
    withTimeout<ChatSessionSummary[]>(listSessions(workspace.id, { limit: 40 }), []),
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

  return (
    <div className="h-[calc(100vh-4.5rem)] w-full">
      <ChatWorkbench
        workspaceId={workspace.id}
        workspaceName={workspace.name || "your workspace"}
        initialSessionId={target?.id || null}
        initialMessages={initialMessages}
        initialSessions={sessions}
        initialSettings={settings || DEFAULT_CHAT_SETTINGS}
        initialPanel={initialPanel}
      />
    </div>
  );
}
