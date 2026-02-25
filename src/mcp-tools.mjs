/**
 * MCP tool handlers for md.succ.ai.
 * Exported with dependency injection for testability.
 *
 * Each handler returns MCP tool result format:
 *   { content: [{ type: 'text', text: string }], isError?: boolean }
 */

/**
 * Convert a URL to clean Markdown.
 * @param {object} args - { url, mode?, links?, max_tokens? }
 * @param {object} deps - { convertFn, browserPool? }
 */
export async function handleConvertUrl(args, deps = {}) {
  const { url, mode, links, max_tokens: maxTokens } = args;

  if (!url || typeof url !== 'string') {
    return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
  }

  const targetUrl = url.startsWith('http') ? url : `https://${url}`;
  try { new URL(targetUrl); } catch {
    return { content: [{ type: 'text', text: 'Error: invalid URL' }], isError: true };
  }

  try {
    const options = {};
    if (mode) options.mode = mode;
    if (links) options.links = links;
    if (maxTokens) options.maxTokens = maxTokens;

    const result = await deps.convertFn(targetUrl, deps.browserPool || null, options);

    const content = (mode === 'fit' && result.fit_markdown) ? result.fit_markdown : result.markdown;
    const meta = [
      `Title: ${result.title || 'Untitled'}`,
      `URL: ${result.url || targetUrl}`,
      `Tokens: ${(mode === 'fit' && result.fit_tokens) || result.tokens}`,
      `Tier: ${result.tier}`,
      `Quality: ${result.quality?.grade || 'N/A'} (${result.quality?.score || 0})`,
      `Time: ${result.totalMs}ms`,
    ].join('\n');

    return { content: [{ type: 'text', text: `${meta}\n\n${content}` }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error converting ${targetUrl}: ${err.message}` }],
      isError: true,
    };
  }
}

/**
 * Extract structured data from a URL via JSON schema.
 * @param {object} args - { url, schema }
 * @param {object} deps - { convertFn, extractSchemaFn, browserPool? }
 */
export async function handleExtractData(args, deps = {}) {
  const { url, schema } = args;

  if (!url || typeof url !== 'string') {
    return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
  }
  if (!schema || typeof schema !== 'object') {
    return { content: [{ type: 'text', text: 'Error: schema is required and must be an object' }], isError: true };
  }

  const targetUrl = url.startsWith('http') ? url : `https://${url}`;
  try { new URL(targetUrl); } catch {
    return { content: [{ type: 'text', text: 'Error: invalid URL' }], isError: true };
  }

  try {
    const converted = await deps.convertFn(targetUrl, deps.browserPool || null);
    const result = await deps.extractSchemaFn(converted.markdown, targetUrl, schema);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error extracting from ${targetUrl}: ${err.message}` }],
      isError: true,
    };
  }
}

/**
 * Batch convert multiple URLs to Markdown.
 * @param {object} args - { urls, mode?, links?, max_tokens? }
 * @param {object} deps - { convertFn, browserPool? }
 */
export async function handleBatchConvert(args, deps = {}) {
  const { urls, mode, links, max_tokens: maxTokens } = args;

  if (!Array.isArray(urls) || urls.length === 0) {
    return { content: [{ type: 'text', text: 'Error: urls must be a non-empty array' }], isError: true };
  }
  if (urls.length > 20) {
    return { content: [{ type: 'text', text: 'Error: maximum 20 URLs per batch' }], isError: true };
  }

  const options = {};
  if (mode) options.mode = mode;
  if (links) options.links = links;
  if (maxTokens) options.maxTokens = maxTokens;

  const results = await Promise.all(
    urls.map(async (rawUrl) => {
      const targetUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      try { new URL(targetUrl); } catch {
        return { url: targetUrl, error: 'Invalid URL' };
      }
      try {
        const result = await deps.convertFn(targetUrl, deps.browserPool || null, options);
        return {
          url: targetUrl,
          title: result.title,
          content: result.markdown,
          tokens: result.tokens,
          tier: result.tier,
          quality: result.quality,
          time_ms: result.totalMs,
        };
      } catch (err) {
        return { url: targetUrl, error: err.message };
      }
    }),
  );

  const totalTokens = results.reduce((sum, r) => sum + (r.tokens || 0), 0);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ results, total: urls.length, total_tokens: totalTokens }, null, 2),
    }],
  };
}
