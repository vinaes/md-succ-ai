import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleConvertUrl, handleExtractData, handleBatchConvert } from './mcp-tools.mjs';

describe('MCP tool: convert_url', () => {
  const mockConvert = async (url, _pool, opts) => ({
    title: 'Test Page',
    markdown: '# Test\n\nContent here.',
    tokens: 10,
    quality: { score: 0.9, grade: 'A' },
    tier: 'fetch',
    totalMs: 100,
    url,
    method: 'readability',
    fit_markdown: '# Test (trimmed)',
    fit_tokens: 5,
  });

  it('returns markdown for a valid URL', async () => {
    const result = await handleConvertUrl(
      { url: 'https://example.com' },
      { convertFn: mockConvert },
    );
    assert.ok(!result.isError);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('# Test'));
    assert.ok(result.content[0].text.includes('Content here.'));
  });

  it('returns fit_markdown when mode is fit', async () => {
    const result = await handleConvertUrl(
      { url: 'https://example.com', mode: 'fit' },
      { convertFn: mockConvert },
    );
    assert.ok(result.content[0].text.includes('# Test (trimmed)'));
  });

  it('includes metadata in response', async () => {
    const result = await handleConvertUrl(
      { url: 'https://example.com' },
      { convertFn: mockConvert },
    );
    assert.ok(result.content[0].text.includes('Title: Test Page'));
    assert.ok(result.content[0].text.includes('Tokens: 10'));
    assert.ok(result.content[0].text.includes('Tier: fetch'));
  });

  it('returns error for missing URL', async () => {
    const result = await handleConvertUrl({}, { convertFn: mockConvert });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('url is required'));
  });

  it('returns error for invalid URL', async () => {
    const result = await handleConvertUrl(
      { url: ':::invalid' },
      { convertFn: mockConvert },
    );
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('invalid URL'));
  });

  it('returns error when conversion fails', async () => {
    const failConvert = async () => { throw new Error('HTTP 404 Not Found'); };
    const result = await handleConvertUrl(
      { url: 'https://example.com/missing' },
      { convertFn: failConvert },
    );
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('404'));
  });

  it('auto-prefixes https for bare domains', async () => {
    let calledUrl;
    const spyConvert = async (url) => {
      calledUrl = url;
      return { title: '', markdown: 'ok', tokens: 1, quality: {}, tier: 'fetch', totalMs: 1, url };
    };
    await handleConvertUrl({ url: 'example.com' }, { convertFn: spyConvert });
    assert.equal(calledUrl, 'https://example.com');
  });
});

describe('MCP tool: extract_data', () => {
  it('returns extracted JSON data', async () => {
    const mockConvert = async () => ({
      markdown: '# Product\n\nPrice: $29.99',
      tokens: 20, quality: {}, tier: 'fetch', totalMs: 200, url: 'https://x.com',
    });
    const mockExtract = async () => ({
      data: { price: 29.99, name: 'Widget' },
      valid: true,
      errors: null,
    });

    const result = await handleExtractData(
      { url: 'https://x.com/product', schema: { price: 'number' } },
      { convertFn: mockConvert, extractSchemaFn: mockExtract },
    );
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.data.price, 29.99);
    assert.equal(parsed.valid, true);
  });

  it('returns error when schema is missing', async () => {
    const result = await handleExtractData(
      { url: 'https://x.com' },
      { convertFn: async () => ({}), extractSchemaFn: async () => ({}) },
    );
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('schema'));
  });

  it('returns error when URL is missing', async () => {
    const result = await handleExtractData(
      { schema: {} },
      { convertFn: async () => ({}), extractSchemaFn: async () => ({}) },
    );
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('url'));
  });
});

describe('MCP tool: batch_convert', () => {
  it('converts multiple URLs', async () => {
    let n = 0;
    const mockConvert = async (url) => {
      n++;
      return {
        title: `Page ${n}`, markdown: `# Page ${n}`,
        tokens: 10, quality: { score: 0.9, grade: 'A' },
        tier: 'fetch', totalMs: 50, url,
      };
    };

    const result = await handleBatchConvert(
      { urls: ['https://a.com', 'https://b.com'] },
      { convertFn: mockConvert },
    );
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.results.length, 2);
    assert.equal(parsed.total, 2);
    assert.equal(parsed.total_tokens, 20);
  });

  it('returns error for empty urls', async () => {
    const result = await handleBatchConvert(
      { urls: [] },
      { convertFn: async () => ({}) },
    );
    assert.ok(result.isError);
  });

  it('returns error for too many urls', async () => {
    const result = await handleBatchConvert(
      { urls: Array(21).fill('https://a.com') },
      { convertFn: async () => ({}) },
    );
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('20'));
  });

  it('handles partial failures', async () => {
    let n = 0;
    const mockConvert = async (url) => {
      n++;
      if (n === 2) throw new Error('Network error');
      return {
        title: 'OK', markdown: '# OK', tokens: 5,
        quality: {}, tier: 'fetch', totalMs: 30, url,
      };
    };

    const result = await handleBatchConvert(
      { urls: ['https://a.com', 'https://b.com', 'https://c.com'] },
      { convertFn: mockConvert },
    );
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.results.length, 3);
    assert.ok(parsed.results[0].content);
    assert.ok(parsed.results[1].error);
    assert.ok(parsed.results[2].content);
  });
});
