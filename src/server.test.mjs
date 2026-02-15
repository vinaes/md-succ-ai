import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, mockConvertResult, jsonPost } from './test-helpers.mjs';

// ─── GET /health ────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = createTestApp();
    const res = await app.request('/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.redis, 'boolean');
  });

  it('reports redis false when unavailable', async () => {
    const app = createTestApp({ getRedisFn: () => null });
    const res = await app.request('/health');
    const body = await res.json();
    assert.equal(body.redis, false);
  });

  it('reports redis true when ready', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await app.request('/health');
    const body = await res.json();
    assert.equal(body.redis, true);
  });
});

// ─── GET / (root info) ──────────────────────────────────────────────────

describe('GET / (API info)', () => {
  it('returns API info when no URL provided', async () => {
    const app = createTestApp();
    const res = await app.request('/');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'md.succ.ai');
    assert.ok(body.endpoints);
    assert.ok(body.params);
    assert.ok(body.usage);
  });
});

// ─── Security headers ───────────────────────────────────────────────────

describe('Security headers', () => {
  it('includes security headers on responses', async () => {
    const app = createTestApp();
    const res = await app.request('/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(res.headers.get('permissions-policy')?.includes('camera=()'));
  });

  it('includes x-request-id header', async () => {
    const app = createTestApp();
    const res = await app.request('/health');
    const reqId = res.headers.get('x-request-id');
    assert.ok(reqId);
    assert.equal(reqId.length, 8);
  });
});

// ─── GET /openapi.json ──────────────────────────────────────────────────

describe('GET /openapi.json', () => {
  it('returns valid OpenAPI spec', async () => {
    const app = createTestApp();
    const res = await app.request('/openapi.json');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.openapi, '3.1.0');
    assert.ok(body.paths);
    assert.equal(body.info.title, 'md.succ.ai');
  });
});

// ─── GET /docs ──────────────────────────────────────────────────────────

describe('GET /docs', () => {
  it('returns HTML with Scalar API reference', async () => {
    const app = createTestApp();
    const res = await app.request('/docs');
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
    const html = await res.text();
    assert.ok(html.includes('api-reference'));
    assert.ok(html.includes('scalar'));
  });
});

// ─── Main conversion endpoint ───────────────────────────────────────────

describe('GET /<url> — conversion', () => {
  it('returns markdown with correct headers', async () => {
    const app = createTestApp();
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/markdown'));
    assert.equal(res.headers.get('x-markdown-tokens'), '42');
    assert.equal(res.headers.get('x-conversion-tier'), 'fetch');
    assert.ok(res.headers.get('x-conversion-time'));
    assert.equal(res.headers.get('x-quality-score'), '0.85');
    assert.equal(res.headers.get('x-quality-grade'), 'A');
    assert.equal(res.headers.get('x-cache'), 'miss');
    assert.ok(res.headers.get('etag')?.startsWith('W/"'));
    assert.ok(res.headers.get('cache-control')?.startsWith('public'));
    assert.ok(res.headers.get('vary')?.includes('accept'));
    const text = await res.text();
    assert.ok(text.includes('Title: Test Page'));
    assert.ok(text.includes('URL Source: https://example.com'));
  });

  it('returns JSON when Accept: application/json', async () => {
    const app = createTestApp();
    const res = await app.request('/https://example.com', {
      headers: { Accept: 'application/json' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.title, 'Test Page');
    assert.ok(body.content);
    assert.equal(body.tokens, 42);
    assert.equal(body.tier, 'fetch');
    assert.equal(body.quality.score, 0.85);
    assert.equal(body.quality.grade, 'A');
    assert.equal(body.time_ms, 150);
    assert.equal(body.method, 'readability');
    assert.equal(body.url, 'https://example.com');
  });

  it('works with ?url= query param', async () => {
    let capturedUrl;
    const app = createTestApp({
      convertFn: async (url) => { capturedUrl = url; return mockConvertResult(); },
    });
    const res = await app.request('/?url=https://example.com');
    assert.equal(res.status, 200);
    assert.equal(capturedUrl, 'https://example.com');
  });

  it('auto-prepends https://', async () => {
    let capturedUrl;
    const app = createTestApp({
      convertFn: async (url) => { capturedUrl = url; return mockConvertResult(); },
    });
    const res = await app.request('/example.com');
    assert.equal(res.status, 200);
    assert.equal(capturedUrl, 'https://example.com');
  });

  it('returns 404 for upstream HTTP 404', async () => {
    const app = createTestApp({
      convertFn: async () => { throw new Error('Fetch failed: HTTP_404'); },
    });
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 404);
  });

  it('returns 403 for blocked URL', async () => {
    const app = createTestApp({
      convertFn: async () => { throw new Error('Blocked URL: private address'); },
    });
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 403);
  });

  it('returns 415 for unsupported content type', async () => {
    const app = createTestApp({
      convertFn: async () => { throw new Error('Unsupported content type: application/zip'); },
    });
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 415);
  });

  it('returns 413 for page too large', async () => {
    const app = createTestApp({
      convertFn: async () => { throw new Error('Page too large: 6.2MB'); },
    });
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 413);
  });

  it('returns 503 for browser pool exhausted', async () => {
    const app = createTestApp({
      convertFn: async () => { throw new Error('Browser pool exhausted'); },
    });
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 503);
  });

  it('returns 500 with sanitized error for generic errors', async () => {
    const app = createTestApp({
      convertFn: async () => { throw new Error('crash at /app/src/convert.mjs:123:45'); },
    });
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.ok(!body.error.includes('/app/src/'));
  });

  it('returns 304 when If-None-Match matches etag', async () => {
    const app = createTestApp();
    const first = await app.request('/https://example.com');
    const etag = first.headers.get('etag');
    assert.ok(etag);

    const second = await app.request('/https://example.com', {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(second.status, 304);
  });

  it('passes mode option to convert', async () => {
    let capturedOpts;
    const app = createTestApp({
      convertFn: async (url, pool, opts) => { capturedOpts = opts; return mockConvertResult(); },
    });
    await app.request('/https://example.com?mode=fit');
    assert.equal(capturedOpts.mode, 'fit');
  });

  it('passes links option to convert', async () => {
    let capturedOpts;
    const app = createTestApp({
      convertFn: async (url, pool, opts) => { capturedOpts = opts; return mockConvertResult(); },
    });
    await app.request('/https://example.com?links=citations');
    assert.equal(capturedOpts.links, 'citations');
  });

  it('returns 429 when rate limited', async () => {
    const app = createTestApp({
      checkRateLimitFn: async () => ({ allowed: false, remaining: 0 }),
    });
    const res = await app.request('/https://example.com');
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('x-ratelimit-remaining'), '0');
  });
});

// ─── POST /batch ────────────────────────────────────────────────────────

describe('POST /batch', () => {
  it('converts multiple URLs', async () => {
    let callCount = 0;
    const app = createTestApp({
      convertFn: async (url) => {
        callCount++;
        return mockConvertResult({ url, title: `Page ${callCount}` });
      },
    });
    const res = await jsonPost(app, '/batch', {
      urls: ['https://a.com', 'https://b.com'],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.results.length, 2);
    assert.equal(body.total, 2);
    assert.equal(typeof body.total_tokens, 'number');
    assert.ok(body.results[0].url);
    assert.ok(body.results[0].content);
    assert.ok(body.results[0].tokens);
  });

  it('returns 400 for empty urls array', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/batch', { urls: [] });
    assert.equal(res.status, 400);
  });

  it('returns 400 for missing urls', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/batch', {});
    assert.equal(res.status, 400);
  });

  it('returns 400 for > 50 URLs', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/batch', {
      urls: Array(51).fill('https://example.com'),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('50'));
  });

  it('returns 400 for non-string URL element', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/batch', { urls: [123] });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('string'));
  });

  it('includes error for failed URLs alongside successes', async () => {
    let callIdx = 0;
    const app = createTestApp({
      convertFn: async () => {
        callIdx++;
        if (callIdx === 2) throw new Error('Fetch failed: HTTP_500');
        return mockConvertResult();
      },
    });
    const res = await jsonPost(app, '/batch', {
      urls: ['https://good.com', 'https://bad.com'],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.results[0].content);
    assert.ok(body.results[1].error);
  });

  it('marks invalid URLs as validation errors', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/batch', {
      urls: [':::invalid', 'https://good.com'],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.results[0].error);
    assert.ok(body.results[1].content);
  });

  it('passes options to convert', async () => {
    let capturedOpts;
    const app = createTestApp({
      convertFn: async (url, pool, opts) => { capturedOpts = opts; return mockConvertResult(); },
    });
    await jsonPost(app, '/batch', {
      urls: ['https://a.com'],
      options: { mode: 'fit', links: 'citations' },
    });
    assert.equal(capturedOpts.mode, 'fit');
    assert.equal(capturedOpts.links, 'citations');
  });

  it('returns 429 when rate limited', async () => {
    const app = createTestApp({
      checkRateLimitFn: async () => ({ allowed: false, remaining: 0 }),
    });
    const res = await jsonPost(app, '/batch', { urls: ['https://a.com'] });
    assert.equal(res.status, 429);
  });
});

// ─── POST /async ────────────────────────────────────────────────────────

describe('POST /async', () => {
  it('returns 202 with job details', async () => {
    const app = createTestApp({
      getRedisFn: () => ({ status: 'ready' }),
    });
    const res = await jsonPost(app, '/async', { url: 'https://example.com' });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.job_id, 'test-job-123');
    assert.equal(body.status, 'processing');
    assert.equal(body.poll_url, '/job/test-job-123');
  });

  it('returns 400 for missing url', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await jsonPost(app, '/async', {});
    assert.equal(res.status, 400);
  });

  it('returns 503 when Redis unavailable', async () => {
    const app = createTestApp({ getRedisFn: () => null });
    const res = await jsonPost(app, '/async', { url: 'https://example.com' });
    assert.equal(res.status, 503);
  });

  it('returns 503 when Redis not ready', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'connecting' }) });
    const res = await jsonPost(app, '/async', { url: 'https://example.com' });
    assert.equal(res.status, 503);
  });

  it('rejects non-https callback URL', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await jsonPost(app, '/async', {
      url: 'https://example.com',
      callback_url: 'http://webhook.com/hook',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('https'));
  });

  it('rejects localhost callback', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await jsonPost(app, '/async', {
      url: 'https://example.com',
      callback_url: 'https://localhost/hook',
    });
    assert.equal(res.status, 400);
  });

  it('rejects private IP callback (10.x)', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await jsonPost(app, '/async', {
      url: 'https://example.com',
      callback_url: 'https://10.0.0.1/hook',
    });
    assert.equal(res.status, 400);
  });

  it('rejects private IP callback (192.168.x)', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await jsonPost(app, '/async', {
      url: 'https://example.com',
      callback_url: 'https://192.168.1.1/hook',
    });
    assert.equal(res.status, 400);
  });

  it('rejects metadata service callback', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await jsonPost(app, '/async', {
      url: 'https://example.com',
      callback_url: 'https://metadata.google.internal/hook',
    });
    assert.equal(res.status, 400);
  });

  it('accepts valid public https callback', async () => {
    const app = createTestApp({ getRedisFn: () => ({ status: 'ready' }) });
    const res = await jsonPost(app, '/async', {
      url: 'https://example.com',
      callback_url: 'https://webhook.myserver.com/hook',
    });
    assert.equal(res.status, 202);
  });

  it('returns 429 when rate limited', async () => {
    const app = createTestApp({
      checkRateLimitFn: async () => ({ allowed: false, remaining: 0 }),
    });
    const res = await jsonPost(app, '/async', { url: 'https://example.com' });
    assert.equal(res.status, 429);
  });
});

// ─── GET /job/:id ───────────────────────────────────────────────────────

describe('GET /job/:id', () => {
  it('returns job when found', async () => {
    const app = createTestApp({
      getJobFn: async () => ({
        id: 'abc', status: 'completed',
        result: { title: 'X', content: '...' },
      }),
    });
    const res = await app.request('/job/abc');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, 'abc');
    assert.equal(body.status, 'completed');
    assert.ok(body.result);
  });

  it('returns 404 for unknown job', async () => {
    const app = createTestApp({ getJobFn: async () => null });
    const res = await app.request('/job/unknown');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.error.includes('not found'));
  });

  it('strips internal fields from response', async () => {
    const app = createTestApp({
      getJobFn: async () => ({
        id: 'abc', status: 'completed',
        callbackUrl: 'https://secret.com/hook',
        options: { mode: 'fit' },
        result: { title: 'X' },
      }),
    });
    const res = await app.request('/job/abc');
    const body = await res.json();
    assert.equal(body.callbackUrl, undefined);
    assert.equal(body.options, undefined);
    assert.ok(body.id);
    assert.ok(body.result);
  });
});

// ─── POST /extract ──────────────────────────────────────────────────────

describe('POST /extract', () => {
  it('returns 400 for missing url', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/extract', { schema: { title: 'string' } });
    assert.equal(res.status, 400);
  });

  it('returns 400 for missing schema', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/extract', { url: 'https://example.com' });
    assert.equal(res.status, 400);
  });

  it('returns 400 for array schema', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/extract', {
      url: 'https://example.com',
      schema: ['title'],
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('object'));
  });

  it('returns 400 for invalid URL', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/extract', {
      url: 'not valid',
      schema: { title: 'string' },
    });
    assert.equal(res.status, 400);
  });

  it('returns 429 when rate limited', async () => {
    const app = createTestApp({
      checkRateLimitFn: async () => ({ allowed: false, remaining: 0 }),
    });
    const res = await jsonPost(app, '/extract', {
      url: 'https://example.com',
      schema: { title: 'string' },
    });
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('x-ratelimit-limit'), '10');
  });

  it('returns extracted data on success', async () => {
    const app = createTestApp();
    const res = await jsonPost(app, '/extract', {
      url: 'https://example.com',
      schema: { title: 'string' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.title, 'Extracted');
    assert.equal(body.valid, true);
  });
});

// ─── GET /metrics ───────────────────────────────────────────────────────

describe('GET /metrics', () => {
  it('returns Prometheus-format metrics', async () => {
    const app = createTestApp();
    const res = await app.request('/metrics');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('http_requests_total') || text.includes('http_request_duration'));
  });
});
