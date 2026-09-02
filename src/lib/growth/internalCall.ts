/**
 * Proof that a call came from our own server code rather than from a browser.
 *
 * `src/actions/goals.ts` is a `"use server"` module, so every export in it is a
 * public HTTP endpoint that accepts a workspace id from the caller. Those calls
 * therefore have to prove the signed-in user owns the workspace. Two callers are
 * legitimately not a signed-in user — the autopilot cron (authenticated with
 * CRON_SECRET) and the SSE execute route (which has already authenticated the
 * user and resolved their workspace itself) — so they pass this token instead.
 *
 * The value is generated once per server instance and only ever read by server
 * modules, so it never reaches the client bundle and a crafted request cannot
 * guess it. A plain `internal: true` flag would be worthless, because server
 * action arguments always originate in the browser.
 */
export const INTERNAL_CALL_TOKEN: string =
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;

export function isInternalCall(token?: string | null): boolean {
  return typeof token === "string" && token.length > 16 && token === INTERNAL_CALL_TOKEN;
}
