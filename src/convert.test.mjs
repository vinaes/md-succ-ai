/**
 * Unit tests for convert.mjs — fetchHTML with mocked globalThis.fetch.
 * DNS resolution uses real resolver (public hostnames) or is skipped (IP addresses).
 */
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHTML, isBlockedUrl } from './convert.mjs';

// ─── Helpers ──────────────────────────────────────────────────────
function mockResponse(body, opts = {}) {
  const headers = new Map(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status: opts.status || 200,
    statusText: opts.statusText || 'OK',
    headers: { get: (k) => headers.get(k.toLowerCase()) || null },
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    body: { cancel: () => {} },
  };
}

describe('fetchHTML', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns html for a normal response', async () => {
    globalThis.fetch = mock.fn(async () => mockResponse(
      '<html><body>Hello</body></html>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    ));
    const result = await fetchHTML('https://example.com');
    assert.ok(result.html);
    assert.ok(result.html.includes('Hello'));
    assert.equal(result.status, 200);
  });

  it('throws for blocked URLs (private IPs)', async () => {
    await assert.rejects(
      () => fetchHTML('http://127.0.0.1/secret'),
      { message: /Blocked URL/ },
    );
  });

  it('throws for HTTP 404', async () => {
    globalThis.fetch = mock.fn(async () => mockResponse('', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'text/html' },
    }));
    await assert.rejects(
      () => fetchHTML('https://example.com/missing'),
      { message: /HTTP 404/ },
    );
  });

  it('throws for HTTP 500', async () => {
    globalThis.fetch = mock.fn(async () => mockResponse('', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'content-type': 'text/html' },
    }));
    await assert.rejects(
      () => fetchHTML('https://example.com/error'),
      { message: /HTTP 500/ },
    );
  });

  it('throws for unsupported content type', async () => {
    globalThis.fetch = mock.fn(async () => mockResponse('binary', {
      headers: { 'content-type': 'image/png' },
    }));
    await assert.rejects(
      () => fetchHTML('https://example.com/image.png'),
      { message: /Unsupported content type/ },
    );
  });

  it('detects RSS feed by content-type', async () => {
    const feedXml = '<?xml version="1.0"?><rss><channel><title>Test</title></channel></rss>';
    globalThis.fetch = mock.fn(async () => mockResponse(feedXml, {
      headers: { 'content-type': 'application/rss+xml' },
    }));
    const result = await fetchHTML('https://example.com/feed.xml');
    assert.ok(result.feed);
    assert.ok(result.feed.includes('<rss'));
  });

  it('follows redirects and returns final content', async () => {
    let callCount = 0;
    globalThis.fetch = mock.fn(async () => {
      callCount++;
      if (callCount === 1) {
        const redirHeaders = new Map([['location', 'https://example.com/final']]);
        return {
          status: 301,
          headers: { get: (k) => redirHeaders.get(k) || null },
          body: { cancel: () => {} },
        };
      }
      return mockResponse('<html><body>Final</body></html>', {
        headers: { 'content-type': 'text/html' },
      });
    });
    const result = await fetchHTML('https://example.com/old');
    assert.ok(result.html.includes('Final'));
    assert.equal(callCount, 2);
  });

  it('throws when redirect goes to private IP', async () => {
    const redirHeaders = new Map([['location', 'http://127.0.0.1/internal']]);
    globalThis.fetch = mock.fn(async () => ({
      status: 302,
      headers: { get: (k) => redirHeaders.get(k) || null },
      body: { cancel: () => {} },
    }));
    await assert.rejects(
      () => fetchHTML('https://example.com/redirect'),
      { message: /Blocked URL.*redirect/ },
    );
  });

  it('throws for too many redirects', async () => {
    globalThis.fetch = mock.fn(async () => {
      const redirHeaders = new Map([['location', `https://example.com/r/${Date.now()}`]]);
      return {
        status: 301,
        headers: { get: (k) => redirHeaders.get(k) || null },
        body: { cancel: () => {} },
      };
    });
    await assert.rejects(
      () => fetchHTML('https://example.com/loop'),
      { message: /Too many redirects/ },
    );
  });

  it('throws for page too large (content-length)', async () => {
    globalThis.fetch = mock.fn(async () => mockResponse('x', {
      headers: {
        'content-type': 'text/html',
        'content-length': String(10 * 1024 * 1024),
      },
    }));
    await assert.rejects(
      () => fetchHTML('https://example.com/huge'),
      { message: /too large/ },
    );
  });
});

describe('isBlockedUrl (integration)', () => {
  it('blocks metadata.google.internal', () => {
    assert.equal(isBlockedUrl('http://metadata.google.internal/v1/'), true);
  });

  it('allows public URLs', () => {
    assert.equal(isBlockedUrl('https://example.com'), false);
  });
});
