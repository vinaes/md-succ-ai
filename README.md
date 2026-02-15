<p align="center">
  <img src="https://img.shields.io/badge/●%20md.succ.ai-html%20to%20markdown-3fb950?style=for-the-badge&labelColor=0d1117" alt="md.succ.ai">
  <br/><br/>
  <em>Clean Markdown from any URL. Fast, accurate, agent-friendly.</em>
</p>

<p align="center">
  <a href="https://md.succ.ai/health"><img src="https://img.shields.io/badge/status-live-3fb950?style=flat-square" alt="status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-FSL--1.1-blue?style=flat-square" alt="license"></a>
  <a href="https://hub.docker.com"><img src="https://img.shields.io/badge/docker-node%2022--slim-2496ED?style=flat-square" alt="docker"></a>
  <a href="https://md.succ.ai/docs"><img src="https://img.shields.io/badge/docs-OpenAPI-6BA539?style=flat-square" alt="API docs"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#api">API</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#self-hosting">Self-Hosting</a> •
  <a href="#monitoring">Monitoring</a> •
  <a href="#security">Security</a>
</p>

---

> Convert any webpage, document, feed, or video to clean, readable Markdown. Built for AI agents, MCP tools, and RAG pipelines. Powered by [succ](https://succ.ai).

## Quick Start

```bash
# Markdown output
curl https://md.succ.ai/https://example.com

# JSON output
curl -H "Accept: application/json" https://md.succ.ai/https://example.com

# Documents (PDF, DOCX, XLSX, CSV)
curl https://md.succ.ai/https://example.com/report.pdf

# YouTube transcript
curl https://md.succ.ai/https://youtube.com/watch?v=dQw4w9WgXcQ

# RSS/Atom feed
curl https://md.succ.ai/https://blog.example.com/feed.xml

# LLM-optimized (30-50% fewer tokens)
curl "https://md.succ.ai/https://example.com?mode=fit"

# Batch convert
curl -X POST https://md.succ.ai/batch \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com", "https://httpbin.org/html"]}'
```

> **That's it.** No API key, no signup, no SDK. Just prepend `https://md.succ.ai/` to any URL.

## Features

| Feature | Description |
|---------|-------------|
| **9-Pass Extraction** | Readability, Defuddle, Article Extractor, CSS selectors, Schema.org, Open Graph, text density, cleaned body — quality-checked at each step |
| **7 Formats** | HTML, PDF, DOCX, XLSX, CSV, YouTube transcripts, RSS/Atom feeds |
| **4-Tier Pipeline** | HTTP fetch → headless browser → LLM extraction → BaaS anti-bot bypass |
| **Batch Conversion** | Convert up to 50 URLs in one request with concurrent processing |
| **Async + Webhooks** | Submit long conversions and get results via polling or webhook callback |
| **Structured Extraction** | `/extract` — JSON schema in, structured data out (LLM-powered) |
| **Quality Scoring** | Each conversion scored 0-1 with A-F grade |
| **Fit Mode** | LLM-optimized output — pruned boilerplate, 30-50% fewer tokens |
| **Citation Links** | Numbered references with footer instead of inline links |
| **Redis Cache** | Two-layer caching (Redis + in-memory fallback), SHA-256 hashed keys |
| **Rate Limiting** | Per-IP via Redis atomic pipeline, CF-Connecting-IP aware |
| **Prometheus + Grafana** | 11 custom metrics, pre-provisioned dashboard, auto-scraped |
| **Structured Logging** | JSON logs via Pino, per-request correlation IDs |
| **OpenAPI Docs** | Interactive API reference at `/docs` (Scalar UI) |

<details>
<summary>Supported formats</summary>

| Format | Content-Type | Method |
|--------|-------------|--------|
| HTML | `text/html` | 9-pass extraction + Turndown |
| PDF | `application/pdf` | Text extraction via unpdf |
| DOCX | `application/vnd...wordprocessingml` | mammoth → HTML → Turndown |
| XLSX/XLS | `application/vnd...spreadsheetml` | SheetJS → Markdown tables |
| CSV | `text/csv` | SheetJS → Markdown table |
| YouTube | `youtube.com`, `youtu.be` | Transcript extraction via innertube API |
| RSS/Atom | `application/rss+xml`, `application/atom+xml` | Feed parsing with item metadata |

Documents are also detected by URL extension (`.pdf`, `.docx`, `.xlsx`, `.csv`) when `Content-Type` is `application/octet-stream`.

</details>

## API

**Base URL:** `https://md.succ.ai`
**Docs:** [`/docs`](https://md.succ.ai/docs) (interactive Scalar UI) | [`/openapi.json`](https://md.succ.ai/openapi.json) (OpenAPI 3.1 spec)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{url}` | Convert URL to Markdown |
| `GET` | `/?url={url}` | Same, query param format |
| `POST` | `/extract` | Structured data extraction via LLM (JSON schema) |
| `POST` | `/batch` | Batch convert up to 50 URLs |
| `POST` | `/async` | Async conversion with optional webhook |
| `GET` | `/job/:id` | Poll async job status |
| `GET` | `/health` | Health check (includes Redis status) |
| `GET` | `/docs` | Interactive API reference |
| `GET` | `/openapi.json` | OpenAPI 3.1 spec |

### Query Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `url` | URL | Target URL (alternative to path format) |
| `links` | `citations` | Convert inline links to numbered references with footer |
| `mode` | `fit` | Prune boilerplate sections for smaller LLM context |
| `max_tokens` | number | Truncate output to N tokens (use with `mode=fit`) |

### Response Headers

| Header | Description |
|--------|-------------|
| `x-request-id` | Unique request correlation ID |
| `x-markdown-tokens` | Token count (cl100k_base) |
| `x-conversion-tier` | `fetch`, `browser`, `baas:scrapfly`, `llm`, `youtube`, `feed`, `document:pdf`, etc. |
| `x-conversion-time` | Total conversion time in ms |
| `x-extraction-method` | Extraction pass used (`readability`, `defuddle`, `browser-raw`, etc.) |
| `x-quality-score` | Quality score 0-1 |
| `x-quality-grade` | Quality grade A-F |
| `x-readability` | `true` if Readability extracted clean content |
| `x-cache` | `hit` or `miss` (Redis-backed) |
| `x-ratelimit-limit` | Max requests per window |
| `x-ratelimit-remaining` | Requests remaining in current window |
| `x-ratelimit-reset` | Window reset timestamp (Unix seconds) |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| `GET /*` | 60 req/min per IP |
| `POST /extract` | 10 req/min per IP |
| `POST /batch` | 5 req/min per IP |
| `POST /async` | 10 req/min per IP |

<details>
<summary>JSON response format</summary>

```json
{
  "title": "Example Domain",
  "url": "https://example.com",
  "content": "# Example Domain\n\nThis domain is for use in...",
  "fit_markdown": "# Example Domain\n\nThis domain is...",
  "fit_tokens": 20,
  "excerpt": "This domain is for use in documentation examples...",
  "tokens": 33,
  "tier": "fetch",
  "readability": true,
  "method": "readability",
  "quality": { "score": 0.85, "grade": "A" },
  "time_ms": 245
}
```

</details>

<details>
<summary>Batch conversion</summary>

```bash
curl -X POST https://md.succ.ai/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example.com",
      "https://httpbin.org/html",
      "https://github.com"
    ],
    "options": {
      "mode": "fit",
      "links": "citations"
    }
  }'
```

Returns an array of results. Up to 50 URLs, processed with 10-way concurrency. Per-URL 60s timeout.

</details>

<details>
<summary>Async conversion with webhook</summary>

```bash
# Submit async job
curl -X POST https://md.succ.ai/async \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "callback_url": "https://your-server.com/webhook"
  }'
# → {"job_id": "abc12345", "status": "processing", "poll_url": "/job/abc12345"}

# Poll for result
curl https://md.succ.ai/job/abc12345
```

Webhook delivers JSON `POST` to `callback_url` on completion/failure. HTTPS required, 3 retries with exponential backoff. Private/internal addresses blocked (SSRF-safe).

</details>

<details>
<summary>Structured data extraction</summary>

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

</details>

<details>
<summary>More examples</summary>

```bash
# Citation-style links (numbered references)
curl "https://md.succ.ai/?url=https://en.wikipedia.org/wiki/Markdown&links=citations"

# LLM-optimized output (pruned boilerplate)
curl "https://md.succ.ai/?url=https://htmx.org/docs/&mode=fit"

# Token limit
curl "https://md.succ.ai/?url=https://example.com&mode=fit&max_tokens=4000"

# RSS feed as markdown
curl https://md.succ.ai/https://hnrss.org/frontpage
```

</details>

## How It Works

4-tier conversion pipeline — each tier only activates if the previous one produced insufficient quality:

```
URL ──→ Cache hit? ──→ Return cached result (Redis, dynamic TTL)
         │
         ├─ YouTube? ──→ Transcript extraction (innertube API)
         │
         ├─ RSS/Atom feed? ──→ Feed parsing with item metadata
         │
         ├─ Document? (PDF, DOCX, XLSX, CSV)
         │   └─→ Document converter → Markdown
         │
         ├─ Tier 1: HTTP fetch + 9-pass extraction
         │   └─→ Readability → Defuddle → Article Extractor → CSS selectors
         │       → Schema.org → Open Graph → Text density → Body fallback
         │
         ├─ Tier 2: Patchright headless browser (SPA/JS-heavy)
         │   └─→ Same 9-pass pipeline on rendered DOM
         │
         ├─ Tier 2.5: LLM extraction (quality < B)
         │   └─→ nano-gpt API → content extraction
         │
         └─ Tier 3: BaaS anti-bot bypass (CF Turnstile / quality < D)
             └─→ ScrapFly → ZenRows → ScrapingBee (rotation)
             └─→ Same 9-pass pipeline on returned HTML
```

Cloudflare challenge pages are detected automatically. When fetch gets a CF challenge, browser is skipped (saves IP), and BaaS providers handle the bypass.

When both LLM and BaaS are needed, they race in parallel — saves 30-45s vs sequential.

<details>
<summary>Caching</summary>

Two-layer cache system backed by Redis 7:

| Content | TTL | Key |
|---------|-----|-----|
| HTML pages | 5 min | `cache:{sha256(url+options)}` |
| Browser renders | 10 min | Same |
| YouTube transcripts | 1 hr | Same |
| Documents | 2 hr | Same |
| /extract results | 1 hr | `extract:{sha256(url)}:{sha256(schema)}` |

Cache keys use SHA-256 hashes to prevent poisoning via long/malicious URLs. Tracking parameters (UTM, fbclid, gclid, etc.) are stripped before hashing. Falls back to in-memory Map when Redis is unavailable.

</details>

<details>
<summary>Stack</summary>

| Component | Role |
|-----------|------|
| [Hono](https://hono.dev) | HTTP framework |
| [Pino](https://getpino.io) | Structured JSON logging |
| [Mozilla Readability](https://github.com/mozilla/readability) | Primary content extraction |
| [Defuddle](https://github.com/nicedoc/defuddle) | Obsidian team's content extraction |
| [@extractus/article-extractor](https://github.com/nicedoc/extractus) | Alternative extraction heuristics |
| [Turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown conversion |
| [linkedom](https://github.com/WebReflection/linkedom) | Lightweight DOM parser |
| [Patchright](https://github.com/nicedoc/patchright) | Patched Chromium for anti-detection |
| [Redis](https://redis.io) + [ioredis](https://github.com/redis/ioredis) | Cache, rate limiting, job storage |
| [prom-client](https://github.com/siimon/prom-client) | Prometheus metrics |
| [unpdf](https://github.com/unjs/unpdf) | PDF text extraction |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML conversion |
| [SheetJS](https://sheetjs.com) | XLSX/XLS/CSV parsing |
| [NanoGPT](https://nano-gpt.com) | LLM API for Tier 2.5 and /extract |
| [Ajv](https://ajv.js.org) | JSON Schema validation for /extract |
| [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) | cl100k_base token counting |
| [nanoid](https://github.com/ai/nanoid) | Request/job IDs |

</details>

## Self-Hosting

### Docker (recommended)

```bash
git clone https://github.com/vinaes/md-succ-ai.git
cd md-succ-ai
cp .env.example .env  # edit with your API keys and passwords
docker compose up -d
```

This starts four containers:

| Container | Purpose | Port |
|-----------|---------|------|
| **md-succ-ai** | API server with Patchright browser | 127.0.0.1:3100 |
| **md-succ-redis** | Redis 7 (cache, rate limiting, jobs) | internal |
| **md-succ-prometheus** | Prometheus metrics collector | internal |
| **md-succ-grafana** | Grafana dashboards | 127.0.0.1:3200 |

The API is available at `http://localhost:3100`.

### Local (without Docker)

```bash
npm install
npx patchright install chromium
npm start
```

> Redis is optional for local development. Without Redis, caching and rate limiting fall back to in-memory Map, and async jobs are unavailable.

<details>
<summary>Environment variables</summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ENABLE_BROWSER` | `true` | Enable Patchright browser fallback |
| `NODE_ENV` | `production` | Node environment |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL (with password in Docker) |
| `REDIS_PASSWORD` | — | Redis authentication password (required in Docker) |
| `GRAFANA_PASSWORD` | — | Grafana admin password (required in Docker) |
| `NANOGPT_API_KEY` | — | nano-gpt API key for LLM tier and /extract |
| `NANOGPT_MODEL` | `meta-llama/llama-3.3-70b-instruct` | LLM model for content extraction (Tier 2.5) |
| `NANOGPT_EXTRACT_MODEL` | same as `NANOGPT_MODEL` | LLM model for `/extract` endpoint |
| `SCRAPFLY_API_KEY` | — | [ScrapFly](https://scrapfly.io) anti-bot bypass (1000 credits/mo free) |
| `ZENROWS_API_KEY` | — | [ZenRows](https://zenrows.com) anti-bot bypass (1000 credits trial) |
| `SCRAPINGBEE_API_KEY` | — | [ScrapingBee](https://scrapingbee.com) anti-bot bypass (1000 credits one-time) |

BaaS providers are optional. When configured, they activate as Tier 3 for Cloudflare-protected sites. Providers are tried in order; if one hits rate limits, the next is used automatically.

</details>

<details>
<summary>Nginx reverse proxy</summary>

An example nginx config is in `nginx/md.succ.ai.conf`:

- Rate limiting: 10 req/s per IP, burst 20
- Connection limit: 10 concurrent per IP
- Proxy timeouts: 60s read (for browser renders)
- POST endpoints with appropriate body limits
- HSTS, security headers (nosniff, X-Frame-Options, Referrer-Policy)
- `/metrics` blocked (403)
- `/grafana/` proxied to Grafana container with WebSocket support

</details>

## Monitoring

The project ships with a full Prometheus + Grafana stack:

**Prometheus** scrapes the `/metrics` endpoint every 10s (internal Docker network only).

**Grafana** is pre-provisioned with a 15-panel dashboard:

- Request rate, response time percentiles (p50/p95/p99)
- Conversion tier distribution, cache hit rate
- Quality score distribution, tokens per conversion
- Rate limit rejections, async job status
- Browser pool utilization, webhook deliveries
- Node.js process metrics (CPU, memory, event loop lag)

Access Grafana at `https://your-domain/grafana/` (proxied via nginx).

### Custom Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `http_requests_total` | Counter | method, route, status |
| `http_request_duration_seconds` | Histogram | method, route, status |
| `conversion_tier_total` | Counter | tier |
| `conversion_tokens` | Histogram | tier |
| `conversion_quality` | Histogram | tier |
| `cache_hits_total` | Counter | source |
| `cache_misses_total` | Counter | — |
| `rate_limit_rejections_total` | Counter | route |
| `browser_pool_active` | Gauge | — |
| `async_jobs_total` | Counter | status |
| `webhook_deliveries_total` | Counter | status |

Plus Node.js default metrics (CPU, memory, event loop, GC) via `prom-client`.

## Security

- **SSRF protection** — URL validation, DNS resolution checks (IPv4 + IPv6), redirect validation per hop, Patchright route blocking, webhook callback DNS validation
- **Private IP blocking** — 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, CGNAT, cloud metadata hostnames, hex/octal IP formats, IPv6 mapped addresses
- **Input limits** — 5MB response size, 5 max redirects, content-type validation, body size limits per endpoint
- **Output sanitization** — Error messages stripped of internal paths/stack traces, URLs sanitized in responses
- **Cache security** — SHA-256 hashed keys (no URL poisoning), tracking params stripped, Redis LRU eviction (128MB cap)
- **Redis authentication** — `--requirepass` with password from .env, authenticated connection URL
- **API key safety** — BaaS API keys only used in outbound requests, never logged or exposed in responses
- **LLM hardening** — Prompt injection protection (HTML sanitization, document delimiters, output validation), schema field whitelist, blocked schema keywords ($ref, $defs, etc.)
- **Rate limiting** — Per-IP via Redis INCR+EXPIRE (atomic pipeline), CF-Connecting-IP support, in-memory fallback
- **Security headers** — HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **CDN integrity** — Subresource Integrity (SRI) on third-party scripts
- **Container security** — Non-root user (`mduser`), `no-new-privileges`, pinned image versions
- **CF challenge detection** — Cloudflare challenge pages detected and handled without wasting browser/BaaS credits

## Architecture

```
                    ┌──────────────────┐
                    │   Cloudflare     │
                    │   (TLS + CDN)    │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   nginx          │
                    │   (rate limit,   │
                    │    HSTS, proxy)  │
                    └────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼─────────┐ ┌──────▼───────┐ ┌─────────▼────────┐
│  md-succ-ai      │ │  Prometheus  │ │  Grafana         │
│  (Node 22, Hono) │ │  (scrape     │ │  (dashboards,    │
│  Patchright      │ │   /metrics)  │ │   alerting)      │
│  BaaS clients    │ └──────────────┘ └──────────────────┘
│  Pino logging    │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Redis 7         │
│  (cache, rate    │
│   limit, jobs)   │
└──────────────────┘
```

## License

[FSL-1.1-Apache-2.0](LICENSE) — Free for non-competitive use. Apache 2.0 after 2 years.

> **Disclaimer:** Not affiliated with [NanoGPT](https://nano-gpt.com). LLM features use the NanoGPT API for pay-per-prompt model access.

---

Part of the [succ](https://succ.ai) ecosystem.
