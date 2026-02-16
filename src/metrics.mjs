import client from 'prom-client';

const register = new client.Registry();

// Collect Node.js default metrics (CPU, memory, event loop, GC)
client.collectDefaultMetrics({ register });

// ─── HTTP metrics ────────────────────────────────────────────────────

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register],
});

// ─── Conversion metrics ──────────────────────────────────────────────

export const conversionTierTotal = new client.Counter({
  name: 'conversion_tier_total',
  help: 'Conversions by tier',
  labelNames: ['tier'],
  registers: [register],
});

export const conversionTokens = new client.Histogram({
  name: 'conversion_tokens',
  help: 'Token count per conversion',
  labelNames: ['tier'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 50000],
  registers: [register],
});

export const conversionQuality = new client.Histogram({
  name: 'conversion_quality',
  help: 'Quality score per conversion (0-1)',
  labelNames: ['tier'],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  registers: [register],
});

// ─── Cache metrics ───────────────────────────────────────────────────

export const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Cache hits by source',
  labelNames: ['source'],
  registers: [register],
});

export const cacheMissesTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Cache misses',
  registers: [register],
});

// ─── Rate limiting ───────────────────────────────────────────────────

export const rateLimitRejectionsTotal = new client.Counter({
  name: 'rate_limit_rejections_total',
  help: 'Rate limit rejections (429)',
  labelNames: ['route'],
  registers: [register],
});

// ─── Browser pool ────────────────────────────────────────────────────

export const browserPoolActive = new client.Gauge({
  name: 'browser_pool_active',
  help: 'Active browser contexts',
  registers: [register],
});

export const browserLaunchesTotal = new client.Counter({
  name: 'browser_launches_total',
  help: 'Total Chromium browser launches/restarts',
  registers: [register],
});

export const browserPageDuration = new client.Histogram({
  name: 'browser_page_duration_seconds',
  help: 'Time from newPage() to release()',
  buckets: [0.5, 1, 2.5, 5, 10, 15, 30, 60],
  registers: [register],
});

export const browserPoolExhaustedTotal = new client.Counter({
  name: 'browser_pool_exhausted_total',
  help: 'Times browser pool was exhausted',
  registers: [register],
});

// ─── Proxy pool ─────────────────────────────────────────────────────

export const proxyRequestsTotal = new client.Counter({
  name: 'proxy_requests_total',
  help: 'Proxy requests by result',
  labelNames: ['result'],  // 'success', 'fail', 'direct'
  registers: [register],
});

export const proxyPoolHealthy = new client.Gauge({
  name: 'proxy_pool_healthy',
  help: 'Number of healthy (non-cooldown) proxies',
  registers: [register],
});

// ─── Async jobs ──────────────────────────────────────────────────────

export const asyncJobsTotal = new client.Counter({
  name: 'async_jobs_total',
  help: 'Async jobs by status',
  labelNames: ['status'],
  registers: [register],
});

// ─── Webhooks ────────────────────────────────────────────────────────

export const webhookDeliveriesTotal = new client.Counter({
  name: 'webhook_deliveries_total',
  help: 'Webhook deliveries by result',
  labelNames: ['status'],
  registers: [register],
});

// ─── Registry export ─────────────────────────────────────────────────

export { register };
