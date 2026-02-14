<p align="center">
  <img src="https://img.shields.io/badge/●%20md.succ.ai-3fb950?style=for-the-badge&labelColor=0d1117" alt="md.succ.ai">
  <br/>
  <em>html to markdown</em>
  <br/><br/>
  Clean Markdown from any URL. Fast, accurate, agent-friendly.
</p>

<p align="center">
  <a href="https://md.succ.ai/health"><img src="https://img.shields.io/badge/status-live-3fb950?style=flat-square" alt="status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-FSL--1.1-blue?style=flat-square" alt="license"></a>
  <a href="https://hub.docker.com"><img src="https://img.shields.io/badge/docker-node%2022--slim-2496ED?style=flat-square" alt="docker"></a>
</p>

<p align="center">
  <a href="#api">API</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#self-hosting">Self-Hosting</a> •
  <a href="#comparison">Comparison</a>
</p>

---

> Convert any webpage to clean, readable Markdown. Built for AI agents, MCP tools, and RAG pipelines. Powered by [succ](https://succ.ai).

## API

**Base URL:** `https://md.succ.ai`

### Convert a URL

```bash
# Markdown output (default)
curl https://md.succ.ai/https://example.com

# JSON output
curl -H "Accept: application/json" https://md.succ.ai/https://example.com

# Query param format
curl https://md.succ.ai/?url=https://example.com
```

### Response Headers

| Header | Description |
|--------|-------------|
| `x-markdown-tokens` | Token count (cl100k_base) |
| `x-conversion-tier` | `fetch` or `browser` |
| `x-conversion-time` | Conversion time in ms |
| `x-readability` | `true` if Readability extracted clean content |

### JSON Response

```json
{
  "title": "Example Domain",
  "url": "https://example.com",
  "content": "# Example Domain\n\nThis domain is for use in...",
  "excerpt": "This domain is for use in documentation examples...",
  "byline": "",
  "siteName": "",
  "tokens": 33,
  "tier": "fetch",
  "readability": true,
  "time_ms": 245
}
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{url}` | Convert URL to Markdown |
| `GET` | `/?url={url}` | Same, query param format |
| `GET` | `/health` | Health check + uptime |
| `GET` | `/` | API info |

## How It Works

Two-tier conversion pipeline:

```
URL ──→ Tier 1: fetch + Readability + Turndown (200-500ms)
         │
         ├─ Success → clean Markdown
         │
         └─ SPA / JS-heavy page?
              │
              └─→ Tier 2: Playwright headless Chromium (3-15s)
                    │
                    └─→ Readability + Turndown → clean Markdown
```

### Stack

| Component | Role |
|-----------|------|
| [Mozilla Readability](https://github.com/mozilla/readability) | Content extraction (strips nav, sidebar, footer, ads) |
| [Turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown conversion |
| [linkedom](https://github.com/WebReflection/linkedom) | Lightweight DOM parser |
| [Playwright](https://playwright.dev) | Headless Chromium for SPA/JS-heavy sites |
| [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) | cl100k_base token counting |
| [Hono](https://hono.dev) | HTTP framework |

## Self-Hosting

### Docker (recommended)

```bash
git clone https://github.com/vinaes/md-succ-ai.git
cd md-succ-ai
docker compose up -d
```

The API will be available at `http://localhost:3100`.

### Local

```bash
npm install
npx playwright install chromium
npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ENABLE_BROWSER` | `true` | Enable Playwright fallback |
| `NODE_ENV` | `production` | Node environment |

### Nginx Reverse Proxy

An example nginx config is in `nginx/md.succ.ai.conf`. Key points:

- Rate limiting: 30 req/s per IP, burst 50
- Proxy timeouts: 60s read (for Playwright renders)
- `proxy_buffering off` for streaming

## Comparison

| Feature | md.succ.ai | markdown.new | r.jina.ai |
|---------|-----------|--------------|-----------|
| Content extraction | Readability | Cloudflare | Custom |
| SPA support | Playwright | No | Limited |
| Token counting | cl100k_base | No | Custom |
| Rate limit | 30 req/s | 200 req/month | Generous |
| Self-hostable | Yes | No | No |
| Latency (static) | 200-500ms | 200-800ms | 500-2000ms |
| Latency (SPA) | 3-15s | N/A | 5-15s |
| Clean output | Readability strips cruft | Includes nav/sidebar | Includes nav/sidebar |

## License

[FSL-1.1-Apache-2.0](LICENSE) — Free for non-competitive use. Apache 2.0 after 2 years.

## Credits

Part of the [succ](https://succ.ai) ecosystem.
