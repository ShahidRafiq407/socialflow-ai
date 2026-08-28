import { Redis } from '@upstash/redis';

// Upstash Redis uses a REST (HTTPS) endpoint + token, NOT the raw TCP protocol
// that ioredis expects. We read the standard Upstash env vars (and fall back to
// generic REDIS_URL / REDIS_TOKEN names for compatibility).
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_URL ||
  '';

const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_TOKEN ||
  '';

let redisClient: Redis | null = null;

function getRedisInstance(): Redis | null {
  if (!redisUrl || !redisToken) return null;

  if (!redisClient) {
    try {
      redisClient = new Redis({
        url: redisUrl,
        token: redisToken,
        // Fail fast instead of hanging the request when Redis is unreachable.
        retry: { retries: 0 },
      });
    } catch (e) {
      redisClient = null;
    }
  }

  return redisClient;
}

export const redis = getRedisInstance();

/**
 * Cache a value in Redis with an optional TTL (expiration in seconds)
 */
export async function cacheSet(key: string, value: any, ttlSeconds: number = 86400) {
  try {
    const client = getRedisInstance();
    if (!client) return null;
    return await client.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    return null;
  }
}

/**
 * Get a cached value from Redis
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisInstance();
    if (!client) return null;
    const data = await client.get(key);
    if (!data) return null;
    return (typeof data === 'string' ? JSON.parse(data) : data) as T;
  } catch (error) {
    return null;
  }
}

// ── SCHEDULED-POST QUEUE (sorted set) ────────────────────────────────────────
// Score = publish timestamp (ms), member = post id. Lets the cron worker pull
// only the DUE jobs instead of scanning the whole Post table, so scheduling
// stays fast and never gets stuck as user volume grows. Prisma remains the
// source of truth — the queue is an accelerator, and everything below is
// best-effort (returns quietly when Redis is not configured).

const SCHEDULE_QUEUE_KEY = 'socialflow:schedule:queue';

export async function scheduleEnqueue(postId: string, runAtMs: number): Promise<boolean> {
  try {
    const client = getRedisInstance();
    if (!client) return false;
    await client.zadd(SCHEDULE_QUEUE_KEY, { score: runAtMs, member: postId });
    return true;
  } catch {
    return false;
  }
}

export async function dequeueDueScheduleJobs(nowMs: number, limit = 100): Promise<string[]> {
  try {
    const client = getRedisInstance();
    if (!client) return [];
    // Upstash exposes score-range queries via zrange with byScore: true.
    const members = await client.zrange(SCHEDULE_QUEUE_KEY, 0, nowMs, {
      byScore: true,
      offset: 0,
      count: limit,
    });
    return members as string[];
  } catch {
    return [];
  }
}

export async function removeFromScheduleQueue(postId: string): Promise<void> {
  try {
    const client = getRedisInstance();
    if (!client) return;
    await client.zrem(SCHEDULE_QUEUE_KEY, postId);
  } catch {
    // best-effort
  }
}

// ── DISTRIBUTED CRON LOCK ────────────────────────────────────────────────────
// Prevents two overlapping cron runs from double-processing the same posts when
// the project scales across instances. Without Redis the lock is a no-op (the
// SCHEDULED → PUBLISHING status guard still prevents double publishing).

const CRON_LOCK_KEY = 'socialflow:cron:lock';

export async function acquireCronLock(ttlSeconds = 240): Promise<boolean> {
  try {
    const client = getRedisInstance();
    if (!client) return true;
    // SET key value NX EX ttl — returns "OK" only if the key did not already exist.
    const res = await client.set(CRON_LOCK_KEY, String(Date.now()), { nx: true, ex: ttlSeconds });
    return res === 'OK';
  } catch {
    return true;
  }
}

export async function releaseCronLock(): Promise<void> {
  try {
    const client = getRedisInstance();
    if (!client) return;
    await client.del(CRON_LOCK_KEY);
  } catch {
    // best-effort
  }
}
