import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

/** Short SHA-256 hash for cache keys — collision-resistant, no poisoning */
const hashKey = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32);
import { cors } from 'hono/cors';
import { convert, extractSchema } from './convert.mjs';
import { BrowserPool } from './browser-pool.mjs';
import { initRedis, shutdownRedis, getRedis, checkRateLimit, getCache, setCache } from './redis.mjs';

const app = new Hono();
const browserPool = new BrowserPool();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ENABLE_BROWSER = process.env.ENABLE_BROWSER !== 'false';

// ─── In-memory result cache (fallback when Redis is down) ───────────
const memCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes
const CACHE_MAX = 200;

function getMemCached(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    memCache.delete(key);
    return null;
  }
  return entry.result;
}

function setMemCache(key, result) {
  if (memCache.size >= CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    memCache.delete(oldest);
  }
  memCache.set(key, { result, ts: Date.now() });
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
  setMemCache(cacheKey, result);
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

// CORS — allow all origins (public API)
app.use('*', cors());

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

// LLM schema extraction: POST /extract
// Rate-limited: max 10 requests per minute per IP (LLM calls are expensive)
const EXTRACT_RATE_LIMIT = 10;

app.post('/extract', async (c) => {
  // Body size guard (defense-in-depth — nginx should also limit)
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > 65536) {
    return c.json({ error: 'Request body too large (max 64KB)' }, 413);
  }

  // Rate limiting per IP — Cloudflare → nginx → forwarded-for fallback
  const ip = c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip')
    || c.req.header('x-forwarded-for')?.split(',').pop()?.trim()
    || 'unknown';

  const rl = await checkRateLimit(`rl:${ip}`, EXTRACT_RATE_LIMIT, 60);
  if (!rl.allowed) {
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
      console.log(`[extract] cache hit ${safeLog(targetUrl)}`);
      return c.json(cached);
    }

    console.log(`[extract] ${safeLog(targetUrl)}`);
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
      console.log(`[extract] empty result from ${converted.tier}${converted.cfChallenge ? ' (CF challenge)' : ''}, retrying with browser${retryOpts.skipFetch ? ' (skipFetch)' : ''}`);
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
    console.error(`[extract] ${safeLog(targetUrl)} — ${err.message}`);
    const status = err.message?.includes('Invalid schema') || err.message?.includes('must be') ? 400 : 500;
    return c.json({ error: sanitizeError(err.message), url: sanitizeUrl(targetUrl) }, status);
  }
});

// Main endpoint: GET /:url
// Also handles: GET /https://example.com/path
// Known API params — everything else belongs to the target URL
const API_PARAMS = new Set(['url', 'mode', 'links', 'max_tokens']);

app.get('/*', async (c) => {
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
        description: 'HTML to clean Markdown API — with fit mode, citations, YouTube transcripts, and LLM extraction',
        usage: 'GET /https://example.com or GET /?url=https://example.com',
        params: {
          mode: 'fit — pruned markdown optimized for LLMs (30-50% fewer tokens)',
          links: 'citations — numbered references with footer instead of inline links',
          max_tokens: 'truncate fit_markdown to N tokens',
        },
        endpoints: {
          'GET /': 'Convert URL to markdown',
          'POST /extract': 'Extract structured data via LLM (body: {url, schema})',
          'GET /health': 'Health check',
        },
        headers: {
          'x-markdown-tokens': 'Token count in response',
          'x-conversion-tier': 'fetch | browser | baas:provider | youtube',
          'x-conversion-time': 'Total conversion time in ms',
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
    const optionsSuffix = [apiMode, apiLinks, apiMaxTokens].filter(Boolean).join('|');
    const cacheKey = `cache:${hashKey(targetUrl + '|' + optionsSuffix)}`;
    const hit = await getCachedResult(cacheKey);
    const isCacheHit = !!hit;
    let result;

    if (hit) {
      result = hit.result;
      console.log(`[hit:${hit.source}] ${safeLog(targetUrl)} ${result.tokens}tok`);
    } else {
      console.log(`[req] ${safeLog(targetUrl)}`);
      const pool = ENABLE_BROWSER ? browserPool : null;
      const options = {
        links: apiLinks,
        mode: apiMode,
        maxTokens: apiMaxTokens,
      };
      result = await convert(targetUrl, pool, options);
      await setCachedResult(cacheKey, result, 300);
      const q = result.quality || { score: 0, grade: 'F' };
      console.log(`[ok]  ${result.tier} ${result.tokens}tok ${result.totalMs}ms ${q.grade}(${q.score}) ${result.method || 'unknown'}`);
    }

    const q = result.quality || { score: 0, grade: 'F' };

    // Response format based on Accept header
    const accept = c.req.header('accept') || '';

    // Set common headers
    c.header('x-markdown-tokens', String(result.tokens));
    c.header('x-conversion-tier', result.tier);
    c.header('x-conversion-time', String(result.totalMs));
    c.header('x-readability', result.readability ? 'true' : 'false');
    c.header('x-extraction-method', result.method || 'unknown');
    c.header('x-quality-score', String(q.score));
    c.header('x-quality-grade', q.grade);
    c.header('x-cache', isCacheHit ? 'hit' : 'miss');
    c.header('vary', 'accept');
    c.header('cache-control', 'public, max-age=300');

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
    console.error(`[err] ${safeLog(targetUrl)} — ${err.message}`);
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
    console.error('[server] Failed to launch browser:', err.message);
    console.log('[server] Running without browser fallback');
  });
}

// Start server
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[md.succ.ai] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[md.succ.ai] Browser fallback: ${ENABLE_BROWSER}`);
  console.log(`[md.succ.ai] Redis: ${getRedis()?.status === 'ready' ? 'connected' : 'unavailable (using memory fallback)'}`);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n[md.succ.ai] ${sig} received, shutting down...`);
    await Promise.all([browserPool.close(), shutdownRedis()]);
    process.exit(0);
  });
}
