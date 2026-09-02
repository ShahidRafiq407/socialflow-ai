/**
 * Tiny promise concurrency limiter.
 *
 * The campaign pipeline runs copy-writing and media-rendering stages in parallel,
 * but Vertex AI enforces per-minute request limits per model. Firing every family
 * at once trips 429s; running them one at a time wastes the whole point of the
 * parallel pipeline. A bounded limiter keeps N in flight and queues the rest.
 *
 * Bounds come from env so a project with a higher quota can raise them without a
 * code change (nothing about the ceiling is intrinsic to the pipeline).
 */

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Waits, but gives up the moment the campaign is cancelled. Every wait in the
 * pipeline — slide spacing, retry backoff, quota window — has to be interruptible,
 * or pressing Stop leaves the run sleeping for another minute before it notices.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
    signal?.addEventListener("abort", finish, { once: true });
  });
}

export function createLimiter(concurrency: number): Limiter {
  const max = Math.max(1, Math.floor(concurrency) || 1);
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= max) return;
    const run = queue.shift();
    if (!run) return;
    active += 1;
    run();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}

/**
 * Reads an integer from env, clamped to a sane range, falling back when unset or
 * unparseable. Retry counts and timeouts belong to the deployment's quota, not to the
 * pipeline, so they are read here instead of being written into the code as literals.
 */
export function envInt(
  name: string,
  fallback: number,
  bounds: { min?: number; max?: number } = {}
): number {
  const min = bounds.min ?? 1;
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER;
  const raw = process.env[name];
  const parsed = Number(raw);
  const value = !raw || !Number.isFinite(parsed) ? fallback : Math.floor(parsed);
  return Math.min(max, Math.max(min, value));
}

/** Reads a positive integer from env, falling back when unset/invalid. */
export function envConcurrency(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}
