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
  let activeScope: string | null = null;

  return {
    requestSkip(scope) {
      // A scope-less skip falls back to whatever is running. If nothing is running the
      // click is dropped on purpose: claiming it for the NEXT family would abandon work
      // the user never saw stall.
      const target = scope || activeScope;
      if (!target) return;
      requested.add(target);
      aborters.get(target)?.();
    },
    bindScope(scope, abort) {
      aborters.set(scope, abort);
      activeScope = scope;
    },
    releaseScope(scope) {
      aborters.delete(scope);
      if (activeScope === scope) activeScope = null;
    },
    isSkipRequested(scope) {
      return requested.has(scope);
    },
    skippedScopes() {
      return [...requested];
    },
  };
}
