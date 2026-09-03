/**
 * Live steering for a campaign that is already streaming.
 *
 * A run is one long HTTP stream, so the only way the user can steer it mid-flight is a
 * second request that finds the run by id and flips a flag. Cancellation already works
 * exactly this way (one AbortController per run). Skipping is the same idea at a finer
 * grain: abandon the single unit of work the run is stuck on, keep the run alive, and
 * move to the next one.
 *
 * A skip is deliberately NOT a cancel. Cancel throws the whole campaign away; skip has
 * to leave every finished family — and all the copy — intact, because the user is
 * trading one post's media for the rest of the campaign actually shipping.
 */
export interface RunControls {
  /**
   * Abandon a unit of work. With no scope this targets whatever is in flight right now,
   * which is all a "Skip this step" button can honestly promise: the client cannot know
   * for certain which family the server has reached by the time the click lands.
   */
  requestSkip(scope?: string): void;
  /**
   * Registers the scope that is running, plus how to interrupt it. Abandoning a scope
   * has to cut the request it is blocked on — otherwise a skip only takes effect once
   * the current image finally times out, minutes later, which is the exact wait the
   * button exists to end.
   */
  bindScope(scope: string, abort: () => void): void;
  /** Unregisters a finished scope so a later skip cannot abort a fresh request. */
  releaseScope(scope: string): void;
  /** True once the user asked for this scope to be abandoned. */
  isSkipRequested(scope: string): boolean;
  /** Every scope the user skipped, so the run summary can name them. */
  skippedScopes(): string[];
}

export function createRunControls(): RunControls {
  const requested = new Set<string>();
  const aborters = new Map<string, () => void>();
  const activeScopes = new Set<string>();

  return {
    requestSkip(scope) {
      // 1. Exact match
      if (scope && aborters.has(scope)) {
        requested.add(scope);
        aborters.get(scope)?.();
        return;
      }

      // 2. Fuzzy match if exact label had minor casing or whitespace difference
      if (scope) {
        const norm = scope.toLowerCase().trim();
        for (const [s, fn] of aborters.entries()) {
          const sNorm = s.toLowerCase().trim();
          if (sNorm.includes(norm) || norm.includes(sNorm)) {
            requested.add(s);
            fn();
            return;
          }
        }
      }

      // 3. Fallback: abort currently registered active scopes so a click never drops
      if (aborters.size > 0) {
        for (const [s, fn] of aborters.entries()) {
          requested.add(s);
          fn();
        }
      }
    },
    bindScope(scope, abort) {
      aborters.set(scope, abort);
      activeScopes.add(scope);
    },
    releaseScope(scope) {
      aborters.delete(scope);
      activeScopes.delete(scope);
    },
    isSkipRequested(scope) {
      if (requested.has(scope)) return true;
      const norm = scope.toLowerCase().trim();
      for (const req of requested) {
        if (norm.includes(req.toLowerCase().trim()) || req.toLowerCase().trim().includes(norm)) {
          return true;
        }
      }
      return false;
    },
    skippedScopes() {
      return [...requested];
    },
  };
}
