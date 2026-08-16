import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

let redisClient: Redis | null = null;

function getRedisInstance(): Redis | null {
  if (!redisUrl) return null;
  
  if (!redisClient) {
    try {
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        enableOfflineQueue: false,
        retryStrategy: () => null, // Never hang or retry infinitely if Redis is offline
      });

      // Catch error event to prevent Node process from terminating during build or runtime
      redisClient.on('error', (err) => {
        // Non-fatal warning
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
    if (client.status === 'wait') {
      await client.connect().catch(() => null);
    }
    return await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
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
    if (client.status === 'wait') {
      await client.connect().catch(() => null);
    }
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

async function connectedClient(): Promise<Redis | null> {
  const client = getRedisInstance();
  if (!client) return null;
  if (client.status === 'wait') {
    await client.connect().catch(() => null);
  }
  return client.status === 'ready' ? client : null;
}

export async function scheduleEnqueue(postId: string, runAtMs: number): Promise<boolean> {
  try {
    const client = await connectedClient();
    if (!client) return false;
    await client.zadd(SCHEDULE_QUEUE_KEY, String(runAtMs), postId);
    return true;
  } catch {
    return false;
  }
}

export async function dequeueDueScheduleJobs(nowMs: number, limit = 100): Promise<string[]> {
  try {
    const client = await connectedClient();
    if (!client) return [];
    return await client.zrangebyscore(SCHEDULE_QUEUE_KEY, 0, nowMs, 'LIMIT', 0, limit);
  } catch {
    return [];
  }
}

export async function removeFromScheduleQueue(postId: string): Promise<void> {
  try {
    const client = await connectedClient();
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
    const client = await connectedClient();
    if (!client) return true;
    const res = await client.set(CRON_LOCK_KEY, String(Date.now()), 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  } catch {
    return true;
  }
}

export async function releaseCronLock(): Promise<void> {
  try {
    const client = await connectedClient();
    if (!client) return;
    await client.del(CRON_LOCK_KEY);
  } catch {
    // best-effort
  }
}
