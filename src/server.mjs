/**
 * Server entry point — initializes infrastructure and starts serving.
 *
 * All route logic lives in app.mjs. This file only handles:
 * - Redis initialization
 * - Browser pool initialization
 * - HTTP server startup
 * - Graceful shutdown
 */
import { serve } from '@hono/node-server';
import { createApp } from './app.mjs';
import { convert, extractSchema } from './convert.mjs';
import { BrowserPool, parseBrowserMode } from './browser-pool.mjs';
import { getProxyPool } from './proxy-pool.mjs';
import { initRedis, shutdownRedis, getRedis, checkRateLimit, getCache, setCache } from './redis.mjs';
import { getLog } from './logger.mjs';
import { createJob, getJob, completeJob, failJob } from './jobs.mjs';

const PORT = parseInt(process.env.PORT || '3000', 10);
const BROWSER_MODE = parseBrowserMode(process.env.ENABLE_BROWSER);
const ENABLE_BROWSER = BROWSER_MODE !== 'off';
const proxyPool = getProxyPool();

const browserPool = ENABLE_BROWSER
  ? new BrowserPool({
      mode: BROWSER_MODE,
      wsEndpoint: process.env.BROWSER_WS_ENDPOINT || 'ws://md-browser:9222',
      proxyPool,
    })
  : null;

const app = createApp({
  browserPool,
  enableBrowser: ENABLE_BROWSER,
  convertFn: convert,
  extractSchemaFn: extractSchema,
  checkRateLimitFn: checkRateLimit,
  getRedisFn: getRedis,
  getCacheFn: getCache,
  setCacheFn: setCache,
  createJobFn: createJob,
  getJobFn: getJob,
  completeJobFn: completeJob,
  failJobFn: failJob,
});

// Initialize Redis (non-blocking, graceful if unavailable)
await initRedis(process.env.REDIS_URL || 'redis://redis:6379');

// Initialize browser if enabled
if (ENABLE_BROWSER) {
  browserPool.init().catch((err) => {
    getLog().error({ err: err.message }, 'failed to launch browser');
    getLog().info('running without browser fallback');
  });
}

// Start server
serve({ fetch: app.fetch, port: PORT }, () => {
  const log = getLog();
  log.info({ port: PORT }, 'listening');
  log.info({ browser: BROWSER_MODE }, 'browser mode');
  log.info({ redis: getRedis()?.status === 'ready' ? 'connected' : 'unavailable' }, 'redis status');
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    getLog().info({ signal: sig }, 'shutting down');
    await Promise.all([browserPool?.close(), shutdownRedis()]);
    process.exit(0);
  });
}
