"use client";

// ============================================================================
// CONFIG SYNC — THE BRIDGE FROM AN ADMIN WRITE TO AN OPEN TAB
//
// The server is never more than a cache TTL behind the back office. The browser
// used to be behind forever: the chat model catalogue is fetched once when a
// workspace mounts, so a tab left open all afternoon kept offering the model list
// from whenever it loaded, and a plan the admin changed at 2pm still rendered its
// old limits at 5pm.
//
// This component closes that gap with the cheapest possible question. It polls
// `/api/runtime/revision` — two aggregates behind a memo, no session or plan
// lookup — and does nothing at all unless the token differs from the one it
// holds. When it does differ:
//
//   1. it dispatches `marketing:config-revision` on `window`, which every client
//      surface holding admin-derived state listens for (the chat settings panel
//      re-fetches its catalogue, credit prices and flags), and
//   2. it calls `router.refresh()`, so the server-rendered shell — sidebar plan
//      badge, credit counter, maintenance banner — comes back with new HTML.
//
// Two things keep the cost near zero: the poll stops entirely while the tab is
// hidden (and fires once immediately on becoming visible again, so a tab the user
// comes back to is correct before they read it), and the first response only
// seeds the token rather than triggering a reload.
// ============================================================================

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** How often a visible tab asks. Cheap enough that this is not the hot path. */
const POLL_MS = 20_000;

/** Fired on `window` whenever admin configuration changed. */
export const CONFIG_REVISION_EVENT = "marketing:config-revision";

export function ConfigSync() {
  const router = useRouter();
  // Refs, not state: nothing here renders, and a re-render would restart the timer.
  const revision = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (cancelled || inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/runtime/revision", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { revision?: string };
        const next = typeof data.revision === "string" ? data.revision : null;
        if (!next || cancelled) return;

        // The first answer is the baseline, not a change.
        if (revision.current === null) {
          revision.current = next;
          return;
        }
        if (revision.current === next) return;

        revision.current = next;
        window.dispatchEvent(new CustomEvent(CONFIG_REVISION_EVENT, { detail: { revision: next } }));
        router.refresh();
      } catch {
        // Offline, or the route is down. Silence is correct: the next tick retries.
      } finally {
        inFlight.current = false;
      }
    };

    const loop = () => {
      timer = setTimeout(async () => {
        await check();
        if (!cancelled) loop();
      }, POLL_MS);
    };

    // A tab coming back into view is the moment staleness is most visible.
    const onVisible = () => {
      if (!document.hidden) void check();
    };

    void check();
    loop();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
