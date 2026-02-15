/**
 * Redis client with graceful degradation.
 * If Redis is unavailable, every operation returns a safe fallback value.
 * Rate limiting falls back to in-memory Map, cache operations return null.
 */
import Redis from 'ioredis';
import { getLog } from './logger.mjs';

let redis = null;

// In-memory fallback for rate limiting when Redis is down
const memLimiter = new Map();

/**
 * Connect to Redis. Non-blocking — logs status but never throws.
 * @param {string} url Redis connection URL
 */
export async function initRedis(url = 'redis://redis:6379') {
  try {
    const client = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 500, 3000);
      },
    });

    client.on('error', (err) => {
      // Suppress repeated connection errors — just log once
      if (!client._errorLogged) {
        getLog().error({ err: err.message }, 'redis error');
        client._errorLogged = true;
      }
    });

    client.on('ready', () => {
      getLog().info('redis connected');
      client._errorLogged = false;
    });

    redis = client;

    await redis.connect();
  } catch (err) {
    getLog().error({ err: err.message }, 'redis init failed, running without Redis');
    redis = null;
  }
}

/** @returns {Redis|null} */
export function getRedis() {
  return redis;
}

/** Graceful shutdown */
export async function shutdownRedis() {
  if (redis) {
    try { await redis.quit(); } catch {}
    redis = null;
  }
}

/**
 * Rate limit check using Redis INCR + EXPIRE.
 * Falls back to in-memory Map if Redis is unavailable.
 * @param {string} key Rate limit key (e.g. "rl:127.0.0.1")
 * @param {number} limit Max requests in window
 * @param {number} windowSec Window duration in seconds
 * @returns {Promise<{allowed: boolean, remaining: number}>}
 */
export async function checkRateLimit(key, limit, windowSec) {
  if (redis?.status === 'ready') {
    try {
      // Atomic: set TTL on every INCR to prevent orphaned keys without expiry
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, windowSec);
      const results = await pipeline.exec();
      const count = results[0][1]; // [err, value] from INCR
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    } catch {}
  }

  // Fallback: in-memory Map
  const now = Date.now();
  const entry = memLimiter.get(key);
  if (entry && now < entry.resetAt) {
    entry.count++;
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
  }
  memLimiter.set(key, { count: 1, resetAt: now + windowSec * 1000 });
  // Cleanup old entries periodically
  if (memLimiter.size > 1000) {
    for (const [k, v] of memLimiter) {
      if (now > v.resetAt) memLimiter.delete(k);
    }
    if (memLimiter.size > 5000) memLimiter.clear();
  }
  return { allowed: true, remaining: limit - 1 };
}

/**
 * Get cached value from Redis.
 * @param {string} key Cache key
 * @returns {Promise<any|null>} Parsed value or null
 */
export async function getCache(key) {
  if (redis?.status !== 'ready') return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Set cached value in Redis with TTL.
 * @param {string} key Cache key
 * @param {any} value Value to cache (will be JSON.stringified)
 * @param {number} ttlSec TTL in seconds
 */
export async function setCache(key, value, ttlSec) {
  if (redis?.status !== 'ready') return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch {}
}

/**
 * Increment BaaS provider monthly usage.
 * @param {string} provider Provider name
 * @param {number} credits Credits consumed
 */
export async function incrBaasUsage(provider, credits) {
  if (redis?.status !== 'ready') return;
  try {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    await redis.incrby(`baas:${provider}:${month}`, credits);
  } catch {}
}

/**
 * Get BaaS provider monthly usage.
 * @param {string} provider Provider name
 * @returns {Promise<number>} Credits used this month
 */
export async function getBaasUsage(provider) {
  if (redis?.status !== 'ready') return Infinity; // block BaaS when Redis is down
  try {
    const month = new Date().toISOString().slice(0, 7);
    const val = await redis.get(`baas:${provider}:${month}`);
    return parseInt(val || '0', 10);
  } catch {
    return Infinity; // block BaaS on Redis errors to prevent credit leaks
  }
}
