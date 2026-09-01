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

/** Reads a positive integer from env, falling back when unset/invalid. */
export function envConcurrency(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}
