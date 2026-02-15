import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';

/** Short SHA-256 hash for cache keys — collision-resistant, no poisoning */
const hashKey = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32);
import { cors } from 'hono/cors';
import { convert, extractSchema } from './convert.mjs';
import { BrowserPool } from './browser-pool.mjs';
import { initRedis, shutdownRedis, getRedis, checkRateLimit, getCache, setCache } from './redis.mjs';
import { withRequestContext, getLog } from './logger.mjs';
import { createJob, getJob, completeJob, failJob } from './jobs.mjs';
import {
  register, httpRequestsTotal, httpRequestDuration,
  conversionTierTotal, conversionTokens, conversionQuality,
  cacheHitsTotal, cacheMissesTotal, rateLimitRejectionsTotal,
  browserPoolActive, asyncJobsTotal, webhookDeliveriesTotal,
} from './metrics.mjs';

const app = new Hono();
const browserPool = new BrowserPool();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ENABLE_BROWSER = process.env.ENABLE_BROWSER !== 'false';

// ─── In-memory result cache (fallback when Redis is down) ───────────
const memCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes (default)
const CACHE_MAX = 200;

function getMemCached(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  const ttl = entry.ttl || CACHE_TTL;
  if (Date.now() - entry.ts > ttl) {
    memCache.delete(key);
    return null;
  }
  return entry.result;
}

function setMemCache(key, result, ttlMs = CACHE_TTL) {
  if (memCache.size >= CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    memCache.delete(oldest);
  }
  memCache.set(key, { result, ts: Date.now(), ttl: ttlMs });
}

// ─── Dual-layer cache: Redis → in-memory fallback ──────────────────
async function getCachedResult(cacheKey) {
  // Try Redis first
  const redisResult = await getCache(cacheKey);
  if (redisResult) return { result: redisResult, source: 'redis' };

  // Fallback to in-memory
  const memResult = getMemCached(cacheKey);
  if (memResult) return { result: memResult, source: 'memory' };

  return null;
}

async function setCachedResult(cacheKey, result, ttlSec = 300) {
  // Write to both layers
  await setCache(cacheKey, result, ttlSec);
  setMemCache(cacheKey, result, ttlSec * 1000);
}

// ─── Cache TTL by conversion tier ───────────────────────────────────
function getTtlForTier(tier) {
  if (tier === 'youtube') return 3600;                              // 1 hour — transcripts rarely change
  if (tier?.startsWith('document:')) return 7200;                   // 2 hours — PDFs/DOCX immutable
  if (tier === 'browser' || tier?.includes('browser')) return 600;  // 10 min — SPA content
  return 300;                                                       // 5 min — fetch/llm/baas
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Extract client IP — Cloudflare → nginx → forwarded-for (leftmost = original client) */
function getClientIp(c) {
  return c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

/**
 * Strip internal paths and stack traces from error messages
 */
function sanitizeError(msg) {
  if (!msg) return 'Conversion failed';
  return msg
    .replace(/\/app\/[^\s,)]+/g, '[internal]')
    .replace(/[A-Z]:\\[^\s,)]+/g, '[internal]')
    .replace(/\s*at\s+.+\(.*:\d+:\d+\)/g, '')
    .trim() || 'Conversion failed';
}

/**
 * Normalize URL for cache key — strip tracking params, sort, remove fragment
 */
function normalizeCacheKey(url) {
  try {
    const u = new URL(url);
    const TRACKING = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
                      'fbclid','gclid','mc_cid','mc_eid'];
    for (const p of TRACKING) u.searchParams.delete(p);
    u.searchParams.sort();
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

/**
 * Sanitize string for safe logging (prevent log injection)
 */
function safeLog(str) {
  return String(str).replace(/[\n\r\x1b\x00-\x1f]/g, '').slice(0, 500);
}

/**
 * Sanitize URL for error responses (strip query/fragment)
 */
function sanitizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.slice(0, 2048);
  } catch {
    return '[invalid URL]';
  }
}

// ─── Middleware ──────────────────────────────────────────────────────

// CORS — allow all origins (public API)
app.use('*', cors());

// Gzip compression
app.use('*', compress());

// Request context — injects reqId into every log line via AsyncLocalStorage
app.use('*', async (c, next) => {
  const reqId = nanoid(8);
  c.set('requestId', reqId);
  c.header('x-request-id', reqId);
  await withRequestContext({ reqId, ip: getClientIp(c) }, () => next());
});

// Prometheus request timing (skip /metrics to avoid self-instrumentation)
app.use('*', async (c, next) => {
  if (c.req.path === '/metrics' || c.req.path === '/health') return next();
  const end = httpRequestDuration.startTimer();
  await next();
  const route = c.req.routePath || c.req.path;
  const labels = { method: c.req.method, route, status: String(c.res.status) };
  end(labels);
  httpRequestsTotal.inc(labels);
});

// Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  c.header('x-frame-options', 'DENY');
  c.header('referrer-policy', 'no-referrer');
  c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
});

// Health check
app.get('/health', (c) => {
  const redisOk = getRedis()?.status === 'ready';
  return c.json({ status: 'ok', redis: redisOk });
});

// Check if LLM extract returned mostly empty data (arrays empty, values null)
function isExtractEmpty(result) {
  if (!result?.valid || !result?.data) return true;
  const data = result.data;
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && val.length > 0) return false;
    if (val !== null && val !== undefined && val !== '' && !Array.isArray(val)) return false;
  }
  return true;
}

// ─── POST /extract — LLM schema extraction ─────────────────────────
// Rate-limited: max 10 requests per minute per IP (LLM calls are expensive)
const EXTRACT_RATE_LIMIT = 10;

app.post('/extract', async (c) => {
  // Body size guard (defense-in-depth — nginx should also limit)
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > 65536) {
    return c.json({ error: 'Request body too large (max 64KB)' }, 413);
  }

  const ip = getClientIp(c);
  const rl = await checkRateLimit(`rl:extract:${ip}`, EXTRACT_RATE_LIMIT, 60);

  // Rate limit headers
  c.header('x-ratelimit-limit', String(EXTRACT_RATE_LIMIT));
  c.header('x-ratelimit-remaining', String(rl.remaining));
  c.header('x-ratelimit-reset', String(Math.ceil(Date.now() / 1000) + 60));

  if (!rl.allowed) {
    rateLimitRejectionsTotal.inc({ route: '/extract' });
    return c.json({ error: 'Rate limited: max 10 extract requests per minute' }, 429);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { url: targetUrl, schema } = body || {};
  if (!targetUrl || !schema) {
    return c.json({ error: 'Required: url (string) and schema (object)' }, 400);
  }
  if (typeof schema !== 'object' || Array.isArray(schema)) {
    return c.json({ error: 'Schema must be a JSON object' }, 400);
  }

  try {
    new URL(targetUrl);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  try {
    // Check extract cache (URL + schema hash → LLM result, 1hr TTL)
    const schemaHash = hashKey(JSON.stringify(schema));
    const extractCacheKey = `extract:${hashKey(targetUrl)}:${schemaHash}`;
    const cached = await getCache(extractCacheKey);
    if (cached) {
      getLog().info({ url: safeLog(targetUrl) }, 'extract cache hit');
      return c.json(cached);
    }

    getLog().info({ url: safeLog(targetUrl) }, 'extract');
    const pool = ENABLE_BROWSER ? browserPool : null;
    const converted = await convert(targetUrl, pool);
    let result = await extractSchema(converted.markdown, targetUrl, schema);

    // Retry with Playwright if LLM returned mostly empty data (SPA / CF challenge)
    if (pool && isExtractEmpty(result)) {
      const retryOpts = { forceBrowser: true };
      // CF challenge: fetch poisoned the IP, skip it so browser is the ONLY request
      if (converted.cfChallenge) {
        retryOpts.skipFetch = true;
      }
      // Already tried browser but still empty (SPA content not in smart extraction) — use skipFetch + forceBrowser for raw fallback
      if (converted.tier?.includes('browser')) {
        retryOpts.skipFetch = true;
      }
      getLog().info({ tier: converted.tier, cfChallenge: !!converted.cfChallenge, skipFetch: !!retryOpts.skipFetch }, 'extract empty, retrying with browser');
      const browserConverted = await convert(targetUrl, pool, retryOpts);
      if (browserConverted.markdown.length > converted.markdown.length) {
        result = await extractSchema(browserConverted.markdown, targetUrl, schema);
      }
    }

    // Cache successful non-empty results for 1 hour
    if (!isExtractEmpty(result)) {
      await setCache(extractCacheKey, result, 3600);
    }

    return c.json(result);
  } catch (err) {
    getLog().error({ url: safeLog(targetUrl), err: err.message }, 'extract failed');
    const status = err.message?.includes('Invalid schema') || err.message?.includes('must be') ? 400 : 500;
    return c.json({ error: sanitizeError(err.message), url: sanitizeUrl(targetUrl) }, status);
  }
});

// ─── POST /batch — batch URL conversion ─────────────────────────────
const BATCH_RATE_LIMIT = 5;
const BATCH_MAX_URLS = 50;
const BATCH_CONCURRENCY = 10;

app.post('/batch', async (c) => {
  const ip = getClientIp(c);

  const rl = await checkRateLimit(`rl:batch:${ip}`, BATCH_RATE_LIMIT, 60);
  c.header('x-ratelimit-limit', String(BATCH_RATE_LIMIT));
  c.header('x-ratelimit-remaining', String(rl.remaining));
  c.header('x-ratelimit-reset', String(Math.ceil(Date.now() / 1000) + 60));

  if (!rl.allowed) {
    rateLimitRejectionsTotal.inc({ route: '/batch' });
    return c.json({ error: 'Rate limited: max 5 batch requests per minute' }, 429);
  }

  // Body size guard
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > 131072) {
    return c.json({ error: 'Request body too large (max 128KB)' }, 413);
  }

  let body;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { urls, options } = body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return c.json({ error: 'Required: urls (non-empty array of strings)' }, 400);
  }
  if (urls.length > BATCH_MAX_URLS) {
    return c.json({ error: `Max ${BATCH_MAX_URLS} URLs per batch` }, 400);
  }

  for (const u of urls) {
    if (typeof u !== 'string') {
      return c.json({ error: 'Each url must be a string' }, 400);
    }
  }

  const pool = ENABLE_BROWSER ? browserPool : null;
  const convertOpts = {
    mode: options?.mode,
    links: options?.links,
    maxTokens: options?.max_tokens ? parseInt(String(options.max_tokens), 10) : undefined,
  };

  // Validate all URLs upfront (same checks as main endpoint)
  const validatedUrls = [];
  for (let i = 0; i < urls.length; i++) {
    let targetUrl = urls[i].startsWith('http') ? urls[i] : `https://${urls[i]}`;
    try {
      const u = new URL(targetUrl);
      // Only allow http(s) — block file://, javascript://, ftp:// etc.
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        validatedUrls.push({ i, url: targetUrl, error: 'Only http/https URLs are supported' });
        continue;
      }
      validatedUrls.push({ i, url: targetUrl });
    } catch {
      validatedUrls.push({ i, url: targetUrl, error: 'Invalid URL' });
    }
  }

  // Process with concurrency limit (work-stealing queue)
  // Per-URL timeout: 60s to prevent single URL from blocking the batch
  const PER_URL_TIMEOUT = 60_000;
  const results = new Array(urls.length);
  let nextIdx = 0;
  const workers = [];

  // Pre-fill validation errors
  for (const v of validatedUrls) {
    if (v.error) {
      results[v.i] = { url: v.url, error: v.error };
    }
  }

  const validItems = validatedUrls.filter(v => !v.error);

  for (let w = 0; w < Math.min(BATCH_CONCURRENCY, validItems.length); w++) {
    workers.push((async () => {
      while (nextIdx < validItems.length) {
        const idx = nextIdx++;
        if (idx >= validItems.length) break;
        const { i, url: targetUrl } = validItems[idx];
        try {
          const result = await Promise.race([
            convert(targetUrl, pool, convertOpts),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Conversion timeout')), PER_URL_TIMEOUT)),
          ]);
          const q = result.quality || { score: 0, grade: 'F' };
          results[i] = {
            url: targetUrl,
            title: result.title,
            content: result.markdown,
            tokens: result.tokens,
            tier: result.tier,
            quality: q,
            time_ms: result.totalMs,
          };
        } catch (err) {
          results[i] = {
            url: targetUrl,
            error: sanitizeError(err.message),
          };
        }
      }
    })());
  }

  await Promise.all(workers);

  const totalTokens = results.reduce((sum, r) => sum + (r.tokens || 0), 0);
  return c.json({ results, total: urls.length, total_tokens: totalTokens });
});

// ─── POST /async — async conversion with optional webhook ───────────
const ASYNC_RATE_LIMIT = 10;

app.post('/async', async (c) => {
  const ip = getClientIp(c);
  const rl = await checkRateLimit(`rl:async:${ip}`, ASYNC_RATE_LIMIT, 60);

  c.header('x-ratelimit-limit', String(ASYNC_RATE_LIMIT));
  c.header('x-ratelimit-remaining', String(rl.remaining));
  c.header('x-ratelimit-reset', String(Math.ceil(Date.now() / 1000) + 60));

  if (!rl.allowed) {
    rateLimitRejectionsTotal.inc({ route: '/async' });
    return c.json({ error: 'Rate limited: max 10 async requests per minute' }, 429);
  }

  // Require Redis for job storage
  if (getRedis()?.status !== 'ready') {
    return c.json({ error: 'Async processing unavailable (Redis required)' }, 503);
  }

  let body;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { url: targetUrl, options, callback_url: callbackUrl } = body || {};
  if (!targetUrl || typeof targetUrl !== 'string') {
    return c.json({ error: 'Required: url (string)' }, 400);
  }

  // Validate URL
  let validUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
  try {
    const u = new URL(validUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return c.json({ error: 'Only http/https URLs are supported' }, 400);
    }
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  // Validate callback URL (must be https, no private/internal addresses)
  if (callbackUrl) {
    try {
      const u = new URL(callbackUrl);
      if (u.protocol !== 'https:') {
        return c.json({ error: 'callback_url must use https' }, 400);
      }
      const host = u.hostname.toLowerCase();
      // Block private/internal/metadata IPs
      if (host === 'localhost' || host === '[::1]' || host === '' || host.startsWith('[')) {
        return c.json({ error: 'callback_url cannot target private addresses' }, 400);
      }
      const parts = host.split('.').map(Number);
      if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) {
        const [a, b] = parts;
        if (a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) {
          return c.json({ error: 'callback_url cannot target private addresses' }, 400);
        }
      }
      const METADATA_HOSTS = ['metadata.google.internal', 'metadata.goog', 'instance-data.ec2.internal'];
      if (METADATA_HOSTS.includes(host.replace(/\.$/, ''))) {
        return c.json({ error: 'callback_url cannot target metadata services' }, 400);
      }
    } catch {
      return c.json({ error: 'Invalid callback_url' }, 400);
    }
  }

  const job = await createJob(validUrl, options || {}, callbackUrl);
  const log = getLog();
  const reqCtx = { reqId: c.get('requestId'), ip: getClientIp(c) };
  asyncJobsTotal.inc({ status: 'created' });
  log.info({ jobId: job.id, url: validUrl, callback: !!callbackUrl }, 'async job created');

  // Process in background — wrap with request context so downstream getLog() retains reqId
  withRequestContext(reqCtx, async () => {
    try {
      const pool = ENABLE_BROWSER ? browserPool : null;
      const result = await convert(validUrl, pool, options || {});
      await completeJob(job.id, result);
      asyncJobsTotal.inc({ status: 'completed' });
      log.info({ jobId: job.id, tokens: result.tokens, tier: result.tier }, 'async job completed');
    } catch (err) {
      try {
        await failJob(job.id, sanitizeError(err.message));
      } catch {}
      asyncJobsTotal.inc({ status: 'failed' });
      log.error({ jobId: job.id, err: err.message }, 'async job failed');
    }
  }).catch((err) => log.error({ jobId: job.id, err: err.message }, 'async job unhandled error'));

  return c.json({
    job_id: job.id,
    status: 'processing',
    poll_url: `/job/${job.id}`,
  }, 202);
});

// ─── GET /job/:id — poll async job status ────────────────────────────
app.get('/job/:id', async (c) => {
  const id = c.req.param('id');
  const job = await getJob(id);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  // Strip internal fields from response
  const { callbackUrl, options, ...safeJob } = job;
  return c.json(safeJob);
});

// ─── OpenAPI spec + docs ─────────────────────────────────────────────
const openapiSpec = JSON.parse(readFileSync(new URL('./openapi.json', import.meta.url), 'utf8'));

app.get('/openapi.json', (c) => c.json(openapiSpec));

app.get('/docs', (c) => {
  return c.html(`<!DOCTYPE html>
<html>
<head><title>md.succ.ai API Reference</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`);
});

// ─── GET /metrics — Prometheus metrics ───────────────────────────────
app.get('/metrics', async (c) => {
  // Update browser pool gauge
  browserPoolActive.set(browserPool.active || 0);
  c.header('content-type', register.contentType);
  return c.body(await register.metrics());
});

// ─── GET /* — main conversion endpoint ──────────────────────────────
// Also handles: GET /https://example.com/path
// Known API params — everything else belongs to the target URL
const API_PARAMS = new Set(['url', 'mode', 'links', 'max_tokens']);

// Rate limit: 60 req/min per IP
const MAIN_RATE_LIMIT = 60;

app.get('/*', async (c) => {
  // Rate limiting
  const ip = getClientIp(c);
  const rl = await checkRateLimit(`rl:main:${ip}`, MAIN_RATE_LIMIT, 60);

  c.header('x-ratelimit-limit', String(MAIN_RATE_LIMIT));
  c.header('x-ratelimit-remaining', String(rl.remaining));
  c.header('x-ratelimit-reset', String(Math.ceil(Date.now() / 1000) + 60));

  if (!rl.allowed) {
    rateLimitRejectionsTotal.inc({ route: '/*' });
    return c.json({ error: 'Rate limited: max 60 requests per minute' }, 429);
  }

  // Extract our API params before reconstructing target URL
  const apiMode = c.req.query('mode') || undefined;
  const apiLinks = c.req.query('links') || undefined;
  const apiMaxTokens = parseInt(c.req.query('max_tokens') || '0', 10) || undefined;

  // Build target URL from path + non-API query params
  // When requesting /https://youtube.com/watch?v=xxx&mode=fit,
  // Hono parses ?v=xxx&mode=fit as request query params.
  // We need to reconstruct the target URL with its original query string.
  let targetUrl = c.req.path.slice(1);

  // Collect query params that belong to the target URL (not our API)
  const targetParams = new URLSearchParams();
  const rawUrl = new URL(c.req.url);
  for (const [key, value] of rawUrl.searchParams) {
    if (!API_PARAMS.has(key)) {
      targetParams.append(key, value);
    }
  }

  // If path is empty, check ?url= param
  if (!targetUrl || targetUrl === '') {
    targetUrl = c.req.query('url') || '';
  } else {
    // Re-attach target query params to the URL from path
    const qs = targetParams.toString();
    if (qs) targetUrl += (targetUrl.includes('?') ? '&' : '?') + qs;
  }

  // Decode URI components
  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch {
    // keep as-is if decode fails
  }

  if (!targetUrl) {
    return c.json(
      {
        name: 'md.succ.ai',
        description: 'URL to Markdown API — with fit mode, citations, YouTube transcripts, RSS/Atom feeds, batch conversion, async+webhooks, and LLM extraction',
        usage: 'GET /https://example.com or GET /?url=https://example.com',
        params: {
          mode: 'fit — pruned markdown optimized for LLMs (30-50% fewer tokens)',
          links: 'citations — numbered references with footer instead of inline links',
          max_tokens: 'truncate fit_markdown to N tokens',
        },
        endpoints: {
          'GET /': 'Convert URL to markdown',
          'POST /extract': 'Extract structured data via LLM (body: {url, schema})',
          'POST /batch': 'Batch convert URLs (body: {urls, options?})',
          'POST /async': 'Async conversion with optional webhook (body: {url, options?, callback_url?})',
          'GET /job/:id': 'Poll async job status',
          'GET /health': 'Health check',
          'GET /openapi.json': 'OpenAPI 3.1 spec',
          'GET /docs': 'API reference (Scalar UI)',
        },
        headers: {
          'x-markdown-tokens': 'Token count in response',
          'x-conversion-tier': 'fetch | browser | baas:provider | youtube',
          'x-conversion-time': 'Total conversion time in ms',
          'x-ratelimit-remaining': 'Requests remaining in current window',
        },
        source: 'https://github.com/vinaes/md-succ-ai',
        powered_by: 'https://succ.ai',
      },
      200,
    );
  }

  // Ensure URL has protocol
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  // Validate URL
  try {
    new URL(targetUrl);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  try {
    // Check cache first (anti-amplification)
    // Include options in cache key — different mode/links/maxTokens = different result
    // Use normalizeCacheKey to strip tracking params (utm_*, fbclid, gclid)
    const optionsSuffix = [apiMode, apiLinks, apiMaxTokens].filter(Boolean).join('|');
    const cacheKey = `cache:${hashKey(normalizeCacheKey(targetUrl) + '|' + optionsSuffix)}`;
    const hit = await getCachedResult(cacheKey);
    const isCacheHit = !!hit;
    let result;

    if (hit) {
      result = hit.result;
      cacheHitsTotal.inc({ source: hit.source });
      getLog().info({ url: safeLog(targetUrl), tokens: result.tokens, cache: hit.source }, 'cache hit');
    } else {
      cacheMissesTotal.inc();
      getLog().info({ url: safeLog(targetUrl) }, 'request');
      const pool = ENABLE_BROWSER ? browserPool : null;
      const options = {
        links: apiLinks,
        mode: apiMode,
        maxTokens: apiMaxTokens,
      };
      result = await convert(targetUrl, pool, options);

      // Dynamic TTL based on conversion tier
      const ttl = getTtlForTier(result.tier);
      await setCachedResult(cacheKey, result, ttl);

      const q = result.quality || { score: 0, grade: 'F' };
      conversionTierTotal.inc({ tier: result.tier });
      conversionTokens.observe({ tier: result.tier }, result.tokens);
      conversionQuality.observe({ tier: result.tier }, q.score);
      getLog().info({ tier: result.tier, tokens: result.tokens, ms: result.totalMs, grade: q.grade, score: q.score, method: result.method || 'unknown' }, 'ok');
    }

    const q = result.quality || { score: 0, grade: 'F' };
    const ttl = getTtlForTier(result.tier);

    // Response format based on Accept header
    const accept = c.req.header('accept') || '';

    // Set common headers (before ETag check — 304 must include these)
    c.header('x-markdown-tokens', String(result.tokens));
    c.header('x-conversion-tier', result.tier);
    c.header('x-conversion-time', String(result.totalMs));
    c.header('x-readability', result.readability ? 'true' : 'false');
    c.header('x-extraction-method', result.method || 'unknown');
    c.header('x-quality-score', String(q.score));
    c.header('x-quality-grade', q.grade);
    c.header('x-cache', isCacheHit ? 'hit' : 'miss');
    c.header('vary', 'accept, accept-encoding');
    c.header('cache-control', `public, max-age=${ttl}`);

    // ETag from content hash
    const etag = `W/"${hashKey(result.markdown)}"`;
    c.header('etag', etag);

    // 304 Not Modified
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch === etag) {
      return c.body(null, 304);
    }

    // JSON response
    if (accept.includes('application/json')) {
      const json = {
        title: result.title,
        url: result.url,
        content: result.markdown,
        excerpt: result.excerpt,
        byline: result.byline,
        siteName: result.siteName,
        tokens: result.tokens,
        tier: result.tier,
        readability: result.readability,
        method: result.method || 'unknown',
        quality: q,
        time_ms: result.totalMs,
      };
      // Include fit_markdown when available
      if (result.fit_markdown) {
        json.fit_markdown = result.fit_markdown;
        json.fit_tokens = result.fit_tokens;
      }
      // Include escalation trace when tiers were escalated
      if (result.escalation?.length) {
        json.escalation = result.escalation;
      }
      return c.json(json);
    }

    // Default: Markdown response
    c.header('content-type', 'text/markdown; charset=utf-8');

    const header = [
      `Title: ${result.title}`,
      `URL Source: ${result.url}`,
      result.byline ? `Author: ${result.byline}` : '',
      result.excerpt ? `Description: ${result.excerpt}` : '',
      '',
      'Markdown Content:',
    ]
      .filter(Boolean)
      .join('\n');

    return c.body(`${header}\n${result.markdown}`);
  } catch (err) {
    getLog().error({ url: safeLog(targetUrl), err: err.message }, 'conversion failed');
    // Forward upstream HTTP errors (e.g. "Fetch failed: HTTP_404" → 404)
    const upstreamMatch = err.message?.match?.(/HTTP[_ ](\d{3})/);
    const status = upstreamMatch ? parseInt(upstreamMatch[1], 10)
      : err.message?.includes('Blocked URL') ? 403
      : err.message?.includes('too large') ? 413
      : err.message?.includes('Unsupported content type') ? 415
      : err.message?.includes('Too many redirects') ? 502
      : err.message?.includes('pool exhausted') ? 503
      : 500;
    return c.json(
      { error: sanitizeError(err.message), url: sanitizeUrl(targetUrl) },
      status,
    );
  }
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
  log.info({ browser: ENABLE_BROWSER }, 'browser fallback');
  log.info({ redis: getRedis()?.status === 'ready' ? 'connected' : 'unavailable' }, 'redis status');
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    getLog().info({ signal: sig }, 'shutting down');
    await Promise.all([browserPool.close(), shutdownRedis()]);
    process.exit(0);
  });
}
