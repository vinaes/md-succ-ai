import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { convert } from './convert.mjs';
import { BrowserPool } from './browser-pool.mjs';

const app = new Hono();
const browserPool = new BrowserPool();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ENABLE_BROWSER = process.env.ENABLE_BROWSER !== 'false';

// CORS — allow all origins (public API)
app.use('*', cors());

// Health check
app.get('/health', (c) =>
  c.json({ status: 'ok', browser: ENABLE_BROWSER, uptime: process.uptime() }),
);

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
    return c.json({ error: 'Invalid URL', url: targetUrl }, 400);
  }

  try {
    console.log(`[req] ${targetUrl}`);
    const pool = ENABLE_BROWSER ? browserPool : null;
    const result = await convert(targetUrl, pool);
    const q = result.quality || { score: 0, grade: 'F' };
    console.log(`[ok]  ${result.tier} ${result.tokens}tok ${result.totalMs}ms ${q.grade}(${q.score}) ${result.method || 'unknown'}`);

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
    console.error(`[err] ${targetUrl} — ${err.message}`);
    return c.json(
      { error: err.message || 'Conversion failed', url: targetUrl },
      500,
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
