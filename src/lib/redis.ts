import Redis from 'ioredis';

// Initialize Redis only if keys are present (prevents crashing if env is missing)
const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl 
  ? new Redis(redisUrl)
  : null;

/**
 * Cache a value in Redis with an optional TTL (expiration in seconds)
 */
export async function cacheSet(key: string, value: any, ttlSeconds: number = 86400) {
  if (!redis) return null;
  try {
    return await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (error) {
    console.error(`[Redis] Failed to set cache for ${key}:`, error);
    return null;
  }
}

/**
 * Get a cached value from Redis
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return (typeof data === 'string' ? JSON.parse(data) : data) as T;
  } catch (error) {
    console.error(`[Redis] Failed to get cache for ${key}:`, error);
    return null;
  }
}
