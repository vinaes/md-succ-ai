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
  <img src="https://img.shields.io/badge/vulnerabilities-0-3fb950?style=flat-square" alt="0 vulnerabilities">
</p>

<p align="center">
  <a href="#api">API</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#supported-formats">Formats</a> •
  <a href="#self-hosting">Self-Hosting</a> •
  <a href="#security">Security</a>
</p>

---

> Convert any webpage or document to clean, readable Markdown. Supports HTML, PDF, DOCX, XLSX, CSV, and YouTube transcripts. Citation-style links, LLM-optimized output, and structured data extraction. Redis-backed caching, multi-provider anti-bot bypass, headless browser rendering. Built for AI agents, MCP tools, and RAG pipelines. Powered by [succ](https://succ.ai).

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

# Documents
curl https://md.succ.ai/https://example.com/report.pdf
curl https://md.succ.ai/https://example.com/data.xlsx

# YouTube transcript
curl https://md.succ.ai/https://youtube.com/watch?v=dQw4w9WgXcQ

# Citation-style links (numbered references)
curl "https://md.succ.ai/?url=https://en.wikipedia.org/wiki/Markdown&links=citations"

# LLM-optimized output (pruned boilerplate)
curl "https://md.succ.ai/?url=https://htmx.org/docs/&mode=fit"

# Token limit
curl "https://md.succ.ai/?url=https://example.com&mode=fit&max_tokens=4000"
```

### Query Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `url` | URL | Target URL (alternative to path format) |
| `links` | `citations` | Convert inline links to numbered references with footer |
| `mode` | `fit` | Prune boilerplate sections for smaller LLM context |
| `max_tokens` | number | Truncate output to N tokens (use with `mode=fit`) |

### Structured Data Extraction

```bash
curl -X POST https://md.succ.ai/extract \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/trending",
    "schema": {
      "type": "object",
      "properties": {
        "repositories": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "author": { "type": "string" },
              "description": { "type": "string" },
              "stars_today": { "type": "number" }
            }
          }
        }
      }
    }
  }'
```

Returns structured JSON matching the provided schema, extracted by LLM. Automatically retries with headless browser for SPA/JS-heavy sites when initial extraction returns empty data.

### Response Headers

| Header | Description |
|--------|-------------|
| `x-markdown-tokens` | Token count (cl100k_base) |
| `x-conversion-tier` | `fetch`, `browser`, `baas:scrapfly`, `llm`, `youtube`, `document:pdf`, etc. |
| `x-conversion-time` | Total conversion time in ms |
| `x-extraction-method` | Extraction pass used (`readability`, `defuddle`, `browser-raw`, etc.) |
| `x-quality-score` | Quality score 0-1 |
| `x-quality-grade` | Quality grade A-F |
| `x-readability` | `true` if Readability extracted clean content |
| `x-cache` | `hit` or `miss` (Redis-backed) |

### JSON Response

```json
{
  "title": "Example Domain",
  "url": "https://example.com",
  "content": "# Example Domain\n\nThis domain is for use in...",
  "excerpt": "This domain is for use in documentation examples...",
  "tokens": 33,
  "tier": "fetch",
  "readability": true,
  "method": "readability",
  "quality": { "score": 0.85, "grade": "A" },
  "time_ms": 245
}
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{url}` | Convert URL to Markdown |
| `GET` | `/?url={url}` | Same, query param format |
| `POST` | `/extract` | Structured data extraction (JSON schema) |
| `GET` | `/health` | Health check (includes Redis status) |
| `GET` | `/` | API info |

## How It Works

Multi-tier conversion pipeline with 9-pass content extraction, quality scoring, anti-bot bypass, and Redis caching:

```
URL ──→ Cache hit? ──→ Return cached result (Redis, 5min/1hr TTL)
         │
         ├─ YouTube? ──→ Transcript extraction (innertube API)
         │
         ├─ Document? (PDF, DOCX, XLSX, CSV)
         │   └─→ Document converter → Markdown
         │
         ├─ Tier 1: HTTP fetch + 9-pass extraction
         │   1. Readability (Mozilla)
         │   2. Defuddle (Obsidian team)
         │   3. Article Extractor
         │   4. Readability on cleaned HTML
         │   5. CSS content selectors
         │   6. Schema.org / JSON-LD
         │   7. Open Graph / meta tags
         │   8. Text density analysis
         │   9. Cleaned body fallback
         │   Quality ratio check after each pass (< 15% = skip)
         │
         ├─ Tier 2: Patchright headless browser (SPA/JS-heavy)
         │   └─→ Same 9-pass pipeline on rendered DOM
         │   └─→ browser-raw fallback (light cleanup + Turndown)
         │
         ├─ Tier 2.5: LLM extraction (quality < B)
         │   └─→ nano-gpt API → content extraction
         │
         └─ Tier 3: BaaS anti-bot bypass (CF Turnstile / quality < D)
             └─→ ScrapFly → ZenRows → ScrapingBee (rotation)
             └─→ Same 9-pass pipeline on returned HTML
```

Each tier only activates if the previous one produced insufficient quality. Cloudflare challenge pages are detected automatically and trigger appropriate retry strategies. Post-processing applies citation conversion and fit_markdown pruning when requested.

### Caching

Two-layer cache system backed by Redis 7:

| Cache | TTL | Key | What's cached |
|-------|-----|-----|---------------|
| Markdown | 5 min | `cache:{hash(url+options)}` | Full conversion result |
| Extract | 1 hr | `extract:{hash(url)}:{hash(schema)}` | LLM extraction result |

Cache keys use SHA-256 hashes to prevent poisoning via long/malicious URLs. Falls back to in-memory Map when Redis is unavailable.

## Supported Formats

| Format | Content-Type | Method |
|--------|-------------|--------|
| HTML | `text/html` | 9-pass extraction + Turndown |
| PDF | `application/pdf` | Text extraction via unpdf |
| DOCX | `application/vnd...wordprocessingml` | mammoth → HTML → Turndown |
| XLSX/XLS | `application/vnd...spreadsheetml` | SheetJS → Markdown tables |
| CSV | `text/csv` | SheetJS → Markdown table |
| YouTube | `youtube.com`, `youtu.be` | Transcript extraction with timestamps |

Documents are also detected by URL extension (`.pdf`, `.docx`, `.xlsx`, `.csv`) when `Content-Type` is `application/octet-stream`.

### Stack

| Component | Role |
|-----------|------|
| [Mozilla Readability](https://github.com/mozilla/readability) | Primary content extraction |
| [Defuddle](https://github.com/nicedoc/defuddle) | Obsidian team's content extraction |
| [@extractus/article-extractor](https://github.com/nicedoc/extractus) | Alternative extraction heuristics |
| [Turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown conversion |
| [linkedom](https://github.com/WebReflection/linkedom) | Lightweight DOM parser |
| [Patchright](https://github.com/nicedoc/patchright) | Patched Chromium for anti-detection |
| [Redis](https://redis.io) | Cache and rate limiting |
| [ioredis](https://github.com/redis/ioredis) | Redis client for Node.js |
| [unpdf](https://github.com/unjs/unpdf) | PDF text extraction |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML conversion |
| [SheetJS](https://sheetjs.com) | XLSX/XLS/CSV parsing |
| [Ajv](https://ajv.js.org) | JSON Schema validation for /extract |
| [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) | cl100k_base token counting |
| [Hono](https://hono.dev) | HTTP framework |

## Self-Hosting

### Docker (recommended)

```bash
git clone https://github.com/vinaes/md-succ-ai.git
cd md-succ-ai
cp .env.example .env  # edit with your API keys
docker compose up -d
```

This starts two containers:
- **md-succ-ai** — API server with Patchright browser on port 3100
- **md-succ-redis** — Redis 7 for caching and rate limiting

The API will be available at `http://localhost:3100`.

### Local (without Docker)

```bash
npm install
npx patchright install chromium
npm start
```

Note: Redis is optional for local development. Without Redis, caching and rate limiting fall back to in-memory Map.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ENABLE_BROWSER` | `true` | Enable Patchright browser fallback |
| `NODE_ENV` | `production` | Node environment |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `NANOGPT_API_KEY` | — | nano-gpt API key for LLM tier and /extract |
| `NANOGPT_MODEL` | `meta-llama/llama-3.3-70b-instruct` | LLM model for content extraction (Tier 2.5) |
| `NANOGPT_EXTRACT_MODEL` | same as `NANOGPT_MODEL` | LLM model for `/extract` endpoint |
| `SCRAPFLY_API_KEY` | — | [ScrapFly](https://scrapfly.io) anti-bot bypass (1000 credits/mo free) |
| `ZENROWS_API_KEY` | — | [ZenRows](https://zenrows.com) anti-bot bypass (1000 credits trial) |
| `SCRAPINGBEE_API_KEY` | — | [ScrapingBee](https://scrapingbee.com) anti-bot bypass (1000 credits one-time) |

BaaS providers are optional. When configured, they activate as Tier 3 for Cloudflare-protected sites. Providers are tried in order; if one hits rate limits, the next is used automatically.

### Nginx Reverse Proxy

An example nginx config is in `nginx/md.succ.ai.conf`:

- Rate limiting: 10 req/s per IP, burst 20
- Connection limit: 10 concurrent per IP
- Proxy timeouts: 60s read (for browser renders)
- Dedicated `/extract` location with 64KB body limit
- Security headers (nosniff, X-Frame-Options, Referrer-Policy)

## Security

- **SSRF protection**: URL validation, DNS resolution checks (IPv4 + IPv6), redirect validation per hop, Patchright route blocking
- **Private IP blocking**: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, CGNAT, cloud metadata hostnames, hex/octal IP formats
- **Input limits**: 5MB response size, 5 max redirects, content-type validation, 64KB body limit on /extract
- **Output sanitization**: Error messages stripped of internal paths/stack traces, URLs sanitized in responses
- **Cache security**: SHA-256 hashed keys (no URL poisoning), Redis LRU eviction (128MB cap), no persistence (pure cache)
- **API key safety**: BaaS API keys only used in outbound requests, never logged or exposed in responses
- **LLM hardening**: Prompt injection protection (HTML sanitization, document delimiters, output validation), schema field whitelist
- **Rate limiting**: Per-IP via Redis INCR+EXPIRE (atomic pipeline), CF-Connecting-IP support, in-memory fallback
- **CF challenge detection**: Cloudflare challenge pages detected and handled without wasting browser/BaaS credits
- **0 CVE**: All dependencies patched, monitored via Dependabot

## Architecture

```
┌──────────────┐     ┌──────────────┐
│  md-succ-ai  │────→│  Redis 7     │
│  (Node 22)   │     │  (cache/rl)  │
│              │     └──────────────┘
│  Hono API    │
│  Patchright  │────→ target websites
│  BaaS client │────→ ScrapFly / ZenRows / ScrapingBee
└──────────────┘
```

## License

[FSL-1.1-Apache-2.0](LICENSE) — Free for non-competitive use. Apache 2.0 after 2 years.

## Credits

Part of the [succ](https://succ.ai) ecosystem.
