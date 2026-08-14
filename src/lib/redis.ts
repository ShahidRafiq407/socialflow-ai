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
