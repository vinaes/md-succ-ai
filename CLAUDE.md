# md.succ.ai

HTML to clean Markdown API. Part of the [succ](https://succ.ai) ecosystem.

## Architecture

- **src/server.mjs** — Hono HTTP server, routing, content negotiation
- **src/convert.mjs** — Two-tier conversion pipeline (fetch → Camoufox browser fallback)
- **src/browser-pool.mjs** — Singleton Camoufox (Firefox) browser pool with auto-restart + resource/ad blocking
- **src/mcp-server.mjs** — MCP server (Streamable HTTP transport via @hono/mcp)
- **src/mcp-tools.mjs** — MCP tool handlers (convert_url, extract_data, batch_convert) with DI
- **src/ua-pool.mjs** — Browser profiles (Chrome/Firefox/Edge/Safari) with TLS fingerprint impersonation
- **src/proxy-pool.mjs** — Proxy rotation with Chrome TLS cipher ordering
- **Dockerfile** — API + MCP runtime image (Node.js 22, no browser)
- **Dockerfile.browser** — Camoufox Firefox sidecar image + system deps
- **docker-compose.yml** — Production config (md-api:3100, md-mcp:3300, md-browser, redis, prometheus, grafana)
- **nginx/** — Reverse proxy config with rate limiting, /mcp endpoint with SSE support

## Stack

- Node.js 22, ESM modules (.mjs)
- Hono + @hono/node-server
- Mozilla Readability (content extraction)
- Turndown (HTML → Markdown)
- linkedom (DOM parsing)
- Camoufox (Firefox fork with C++ anti-detection)
- @modelcontextprotocol/sdk + @hono/mcp (MCP Streamable HTTP)
- undici (HTTP client with TLS cipher control)
- gpt-tokenizer (cl100k_base token counting)

## MCP Server

Endpoint: `https://md.succ.ai/mcp` (Streamable HTTP transport, MCP spec 2025-03-26)

Tools:
- `convert_url` — Convert URL to Markdown (mode, links, max_tokens)
- `extract_data` — Extract structured data via JSON schema
- `batch_convert` — Batch convert up to 20 URLs

Docker service `md-mcp` on port 3300, same Dockerfile with `command: ["node", "src/mcp-server.mjs"]`.

## Deployment

See `.env.deploy` (gitignored) for server credentials and deploy commands.

## Conventions

- All source files use .mjs extension (ESM)
- No build step — source runs directly
- Commit messages follow succ format (see main succ repo)
- Docker-first deployment, no PM2/systemd
- Tests use node:test + node:assert/strict
