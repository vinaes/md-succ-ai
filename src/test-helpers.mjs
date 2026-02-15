/**
 * Shared test utilities for E2E route tests.
 *
 * createTestApp() returns a Hono app with all external deps mocked.
 * Tests use app.request() for in-process HTTP testing — no server, no port.
 */
import { createApp } from './app.mjs';

/** Default mock convert result — looks like a real successful conversion */
export function mockConvertResult(overrides = {}) {
  return {
    title: 'Test Page',
    markdown: '# Test Page\n\nThis is test content with enough text to pass quality scoring.',
    tokens: 42,
    readability: true,
    excerpt: 'Test excerpt',
    byline: 'Test Author',
    siteName: 'Test Site',
    htmlLength: 1000,
    method: 'readability',
    quality: { score: 0.85, grade: 'A' },
    url: 'https://example.com',
    tier: 'fetch',
    totalMs: 150,
    fit_markdown: '# Test Page\n\nThis is test content.',
    fit_tokens: 30,
    ...overrides,
  };
}

/**
 * Create a test app with all external deps mocked.
 * Override any dep by passing it in overrides.
 */
export function createTestApp(overrides = {}) {
  const defaultConvert = async () => mockConvertResult();
  const defaultExtractSchema = async () => ({
    data: { title: 'Extracted' },
    valid: true,
    errors: null,
    url: 'https://example.com',
    time_ms: 100,
  });

  return createApp({
    browserPool: { active: 0 },
    enableBrowser: false,
    convertFn: overrides.convertFn ?? defaultConvert,
    extractSchemaFn: overrides.extractSchemaFn ?? defaultExtractSchema,
    checkRateLimitFn: overrides.checkRateLimitFn ?? (async () => ({ allowed: true, remaining: 59 })),
    getRedisFn: overrides.getRedisFn ?? (() => null),
    getCacheFn: overrides.getCacheFn ?? (async () => null),
    setCacheFn: overrides.setCacheFn ?? (async () => {}),
    createJobFn: overrides.createJobFn ?? (async (url) => ({ id: 'test-job-123', status: 'processing', url })),
    getJobFn: overrides.getJobFn ?? (async () => null),
    completeJobFn: overrides.completeJobFn ?? (async () => {}),
    failJobFn: overrides.failJobFn ?? (async () => {}),
    ...overrides,
  });
}

/** Helper: make a JSON POST request */
export function jsonPost(app, path, body, headers = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
