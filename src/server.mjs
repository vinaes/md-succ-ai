import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { convert } from './convert.mjs';
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

// Main endpoint: GET /:url
// Also handles: GET /https://example.com/path
app.get('/*', async (c) => {
  // Extract URL from path — everything after first /
  let targetUrl = c.req.path.slice(1);

  // Also check ?url= query param
  if (!targetUrl || targetUrl === '') {
    targetUrl = c.req.query('url') || '';
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
        description: 'HTML to clean Markdown API',
        usage: 'GET /https://example.com or GET /?url=https://example.com',
        headers: {
          'x-markdown-tokens': 'Token count in response',
          'x-conversion-tier': 'fetch | browser',
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
    const cacheKey = normalizeCacheKey(targetUrl);
    const cached = getCached(cacheKey);
    const isCacheHit = !!cached;
    let result;

    if (cached) {
      result = cached;
      console.log(`[hit] ${safeLog(targetUrl)} ${result.tokens}tok`);
    } else {
      console.log(`[req] ${safeLog(targetUrl)}`);
      const pool = ENABLE_BROWSER ? browserPool : null;
      result = await convert(targetUrl, pool);
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
      return c.json({
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
      });
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
