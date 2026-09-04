"use client";

// ============================================================================
// ACTIVE WORKSPACE — THE CLIENT HALF
//
// The server already resolves one active workspace for every page, action and
// route handler. This is the other half: the browser's own copy of that id, and
// the guarantee that nothing the previous workspace left behind is still on
// screen after a switch.
//
// Two separate problems live here, and switching was broken by both:
//
//   1. Page bodies seed their state from server props. `useState(initialData)`
//      reads its argument once and never again, so a refreshed layout handed
//      new workspace data to components that had already made up their minds —
//      the header changed, the dashboard under it did not. DashboardShell keys
//      the page subtree on the id this provider carries; a new id remounts the
//      subtree, a remount re-runs every initialiser. That is the whole fix.
//
//   2. Some state never came from the server at all: the AI Studio draft
//      session in sessionStorage and its rendered media in IndexedDB. A remount
//      does not touch either, so they are purged explicitly when the id
//      changes. The marker is written next to them, which means a hard
//      navigation — deleting a workspace, closing an account — is caught on the
//      next load as well as in-place switches.
// ============================================================================

import { createContext, useContext, useEffect, useRef } from "react";

/** Which workspace the caches in this tab were filled for. */
const SCOPE_KEY = "postloom:workspace-scope";

/** sessionStorage entries that belong to one workspace and must not outlive it. */
const SCOPED_SESSION_KEYS = [
  "socialflow:ai-studio-session", // zustand persist — drafts, captions, media
  "socialflow:openInStudio", // hand-off payload from a post card
];

const ActiveWorkspaceContext = createContext<string | null>(null);

/**
 * The workspace every server read on this page was scoped to. Client components
 * that key caches or storage per workspace should use this rather than passing
 * the id down through props they do not otherwise need.
 */
export function useActiveWorkspaceId(): string | null {
  return useContext(ActiveWorkspaceContext);
}

function readScope(): string | null {
  try {
    return window.sessionStorage.getItem(SCOPE_KEY);
  } catch {
    return null;
  }
}

function writeScope(id: string): void {
  try {
    window.sessionStorage.setItem(SCOPE_KEY, id);
  } catch {
    // Blocked storage only costs the purge-on-reload path; the in-place switch
    // still works because the id is in memory.
  }
}

/**
 * Drops everything the previous workspace left in the browser.
 *
 * In-memory first: the zustand store hydrates from sessionStorage when its
 * module is evaluated, which can happen before this runs, so removing the key
 * alone would leave the old workspace's drafts on screen until a reload. Both
 * imports are dynamic so the AI Studio store and the IndexedDB helper stay out
 * of the bundle of every other dashboard page.
 */
async function purgeWorkspaceScopedClientState(): Promise<void> {
  for (const key of SCOPED_SESSION_KEYS) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Nothing to do — a browser that refuses storage has nothing stale in it.
    }
  }

  await Promise.all([
    import("@/lib/stores/aiStudioSession")
      .then((m) => m.useAIStudioSessionStore.getState().resetSession())
      .catch(() => {}),
    import("@/lib/indexedDbMedia")
      .then((m) => m.clearAllMediaFromIndexedDB())
      .catch(() => {}),
  ]);
}

export function ActiveWorkspaceProvider({
  activeWorkspaceId,
  children,
}: {
  activeWorkspaceId: string | null;
  children: React.ReactNode;
}) {
  // A ref rather than state: the purge is a side effect of the id changing, and
  // re-rendering afterwards would only throw the page away a second time.
  const scopedTo = useRef<string | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (scopedTo.current === activeWorkspaceId) return;

    const previous = scopedTo.current ?? readScope();
    scopedTo.current = activeWorkspaceId;
    writeScope(activeWorkspaceId);

    // The first paint of a fresh tab is not a switch: there is nothing from
    // another workspace to clear, and clearing would wipe the draft the user
    // reloaded the page to get back to.
    if (previous && previous !== activeWorkspaceId) {
      void purgeWorkspaceScopedClientState();
    }
  }, [activeWorkspaceId]);

  return (
    <ActiveWorkspaceContext.Provider value={activeWorkspaceId}>
      {children}
    </ActiveWorkspaceContext.Provider>
  );
}
