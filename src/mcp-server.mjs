/**
 * MCP server entry point — Streamable HTTP transport via Hono.
 *
 * Exposes md.succ.ai conversion tools to AI agents via the Model Context Protocol.
 * Uses @hono/mcp StreamableHTTPTransport (MCP spec 2025-03-26, SSE deprecated).
 *
 * Endpoints:
 *   POST /mcp   — JSON-RPC requests (tool calls, initialize)
 *   GET  /mcp   — SSE stream for server-initiated messages
 *   DELETE /mcp — Session termination
 *   GET /health  — Docker health check
 *   GET /metrics — Prometheus metrics
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport, MemoryEventStore } from '@hono/mcp';
import { z } from 'zod';

import { convert, extractSchema } from './convert.mjs';
import { BrowserPool, parseBrowserMode } from './browser-pool.mjs';
import { getProxyPool } from './proxy-pool.mjs';
import { initRedis, shutdownRedis, getRedis } from './redis.mjs';
import { getLog } from './logger.mjs';
import { register } from './metrics.mjs';
import { handleConvertUrl, handleExtractData, handleBatchConvert } from './mcp-tools.mjs';

// ─── Infrastructure ─────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const BROWSER_MODE = parseBrowserMode(process.env.ENABLE_BROWSER);
const ENABLE_BROWSER = BROWSER_MODE !== 'off';
const proxyPool = getProxyPool();

const browserPool = ENABLE_BROWSER
  ? new BrowserPool({
      mode: BROWSER_MODE,
      wsEndpoint: process.env.BROWSER_WS_ENDPOINT || 'ws://md-browser:9222',
      proxyPool,
    })
  : null;

// ─── MCP Server ─────────────────────────────────────────────────────

const mcp = new McpServer(
  {
    name: 'md-succ-ai',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Shared deps for all tool handlers
const deps = {
  convertFn: convert,
  extractSchemaFn: extractSchema,
  browserPool,
};

// ─── Tool: convert_url ──────────────────────────────────────────────

mcp.tool(
  'convert_url',
  'Convert a URL to clean, readable Markdown. Supports articles, docs, blogs, and any web page.',
  {
    url: z.string().describe('URL to convert (e.g. "https://example.com" or "example.com")'),
    mode: z.enum(['full', 'fit']).optional().describe('Output mode: "full" (default) or "fit" (trimmed, fewer tokens)'),
    links: z.enum(['inline', 'citations']).optional().describe('Link style: "inline" (default) or "citations" (numbered references)'),
    max_tokens: z.number().positive().optional().describe('Maximum tokens in output (truncates if exceeded)'),
  },
  async (args) => handleConvertUrl(args, deps),
);

// ─── Tool: extract_data ─────────────────────────────────────────────

mcp.tool(
  'extract_data',
  'Extract structured data from a web page using a JSON schema. Fetches the page, converts to markdown, then extracts fields matching the schema via LLM.',
  {
    url: z.string().describe('URL to extract data from'),
    schema: z.record(z.any()).describe('JSON schema describing the data to extract (e.g. {"price": "number", "title": "string"})'),
  },
  async (args) => handleExtractData(args, deps),
);

// ─── Tool: batch_convert ────────────────────────────────────────────

mcp.tool(
  'batch_convert',
  'Convert multiple URLs to Markdown in parallel. Maximum 20 URLs per batch. Partial failures are reported per-URL.',
  {
    urls: z.array(z.string()).min(1).max(20).describe('Array of URLs to convert'),
    mode: z.enum(['full', 'fit']).optional().describe('Output mode for all URLs'),
    links: z.enum(['inline', 'citations']).optional().describe('Link style for all URLs'),
    max_tokens: z.number().positive().optional().describe('Maximum tokens per URL'),
  },
  async (args) => handleBatchConvert(args, deps),
);

// ─── Hono App ───────────────────────────────────────────────────────

const app = new Hono();

// MCP transport — one per session, stored in a map
const transports = new Map();

app.on(['POST', 'GET', 'DELETE'], '/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id');

  // Existing session
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId);
    const resp = await transport.handleRequest(c);
    if (resp) return resp;
    return c.text('', 202);
  }

  // New session (POST with initialize)
  if (c.req.method === 'POST') {
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      eventStore: new MemoryEventStore(),
      onsessioninitialized: (id) => {
        transports.set(id, transport);
        getLog().info({ sessionId: id }, 'mcp session created');
      },
      onsessionclosed: (id) => {
        transports.delete(id);
        getLog().info({ sessionId: id }, 'mcp session closed');
      },
    });

    await mcp.connect(transport);

    const resp = await transport.handleRequest(c);
    if (resp) return resp;
    return c.text('', 202);
  }

  // GET/DELETE without session — invalid
  return c.json(
    {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session' },
      id: null,
    },
    400,
  );
});

// Health check
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    server: 'mcp',
    browser: BROWSER_MODE,
    redis: getRedis()?.status === 'ready' ? 'connected' : 'unavailable',
  }),
);

// Prometheus metrics
app.get('/metrics', async (c) => {
  c.header('Content-Type', register.contentType);
  return c.text(await register.metrics());
});

// ─── Startup ────────────────────────────────────────────────────────

await initRedis(process.env.REDIS_URL || 'redis://redis:6379');

if (ENABLE_BROWSER) {
  browserPool.init().catch((err) => {
    getLog().error({ err: err.message }, 'failed to launch browser');
    getLog().info('running without browser fallback');
  });
}

serve({ fetch: app.fetch, port: PORT }, () => {
  const log = getLog();
  log.info({ port: PORT }, 'mcp server listening');
  log.info({ browser: BROWSER_MODE }, 'browser mode');
  log.info({ redis: getRedis()?.status === 'ready' ? 'connected' : 'unavailable' }, 'redis status');
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    getLog().info({ signal: sig }, 'shutting down mcp server');
    // Close all active MCP transports
    for (const [id, transport] of transports) {
      try { await transport.close(); } catch { /* ignore */ }
      transports.delete(id);
    }
    await Promise.all([browserPool?.close(), shutdownRedis()]);
    process.exit(0);
  });
}
