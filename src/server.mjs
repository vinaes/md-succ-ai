import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { convert, fetchHTML, extractSchema } from './convert.mjs';
import { BrowserPool } from './browser-pool.mjs';

const app = new Hono();
const browserPool = new BrowserPool();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ENABLE_BROWSER = process.env.ENABLE_BROWSER !== 'false';

// ─── In-memory result cache (anti-amplification) ──────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes
const CACHE_MAX = 200;             // ~200 entries, realistic ~10-50MB

function getCached(url) {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(url);
    return null;
  }
  return entry.result;
}

function setCache(url, result) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(url, { result, ts: Date.now() });
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

// Health check (minimal — no config/uptime leaks)
app.get('/health', (c) => c.json({ status: 'ok' }));

// LLM schema extraction: POST /extract
// Rate-limited: max 10 requests per minute per IP (LLM calls are expensive)
const extractLimiter = new Map(); // ip → {count, resetAt}
const EXTRACT_RATE_LIMIT = 10;
const EXTRACT_RATE_WINDOW = 60_000;

app.post('/extract', async (c) => {
  // Body size guard (defense-in-depth — nginx should also limit)
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > 65536) {
    return c.json({ error: 'Request body too large (max 64KB)' }, 413);
  }

  // Rate limiting per IP — prefer x-real-ip (set by nginx, not spoofable)
  const ip = c.req.header('x-real-ip')
    || c.req.header('x-forwarded-for')?.split(',').pop()?.trim()
    || 'unknown';
  const now = Date.now();
  const limiter = extractLimiter.get(ip);
  if (limiter && now < limiter.resetAt) {
    if (limiter.count >= EXTRACT_RATE_LIMIT) {
      return c.json({ error: 'Rate limited: max 10 extract requests per minute' }, 429);
    }
    limiter.count++;
  } else {
    extractLimiter.set(ip, { count: 1, resetAt: now + EXTRACT_RATE_WINDOW });
  }
  // Cleanup old entries periodically + hard cap against memory exhaustion
  if (extractLimiter.size > 1000) {
    for (const [k, v] of extractLimiter) {
      if (now > v.resetAt) extractLimiter.delete(k);
    }
    // Nuclear option: if still too large after cleanup, clear all
    if (extractLimiter.size > 5000) extractLimiter.clear();
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
    console.log(`[extract] ${safeLog(targetUrl)}`);
    const fetched = await fetchHTML(targetUrl);
    if (fetched.buffer) {
      return c.json({ error: 'Schema extraction only works with HTML pages' }, 415);
    }
    const result = await extractSchema(fetched.html, targetUrl, schema);
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
          'x-conversion-tier': 'fetch | browser | youtube',
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
    const cacheKey = normalizeCacheKey(targetUrl) + (optionsSuffix ? `|${optionsSuffix}` : '');
    const cached = getCached(cacheKey);
    const isCacheHit = !!cached;
    let result;

    if (cached) {
      result = cached;
      // LRU: move to end so frequently accessed entries survive eviction
      cache.delete(cacheKey);
      cache.set(cacheKey, { result: cached, ts: Date.now() });
      console.log(`[hit] ${safeLog(targetUrl)} ${result.tokens}tok`);
    } else {
      console.log(`[req] ${safeLog(targetUrl)}`);
      const pool = ENABLE_BROWSER ? browserPool : null;
      const options = {
        links: apiLinks,
        mode: apiMode,
        maxTokens: apiMaxTokens,
      };
      result = await convert(targetUrl, pool, options);
      setCache(cacheKey, result);
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
    const status = err.message?.includes('Blocked URL') ? 403
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
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n[md.succ.ai] ${sig} received, shutting down...`);
    await browserPool.close();
    process.exit(0);
  });
}
