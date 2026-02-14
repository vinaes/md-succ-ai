<p align="center">
  <img src="https://img.shields.io/badge/●%20md.succ.ai-html%20to%20markdown-3fb950?style=for-the-badge&labelColor=0d1117" alt="md.succ.ai">
  <br/><br/>
  <em>Clean Markdown from any URL. Fast, accurate, agent-friendly.</em>
</p>

<p align="center">
  <a href="https://md.succ.ai/health"><img src="https://img.shields.io/badge/status-live-3fb950?style=flat-square" alt="status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-FSL--1.1-blue?style=flat-square" alt="license"></a>
  <a href="https://hub.docker.com"><img src="https://img.shields.io/badge/docker-node%2022--slim-2496ED?style=flat-square" alt="docker"></a>
  <img src="https://img.shields.io/badge/CVE-0-3fb950?style=flat-square" alt="0 vulnerabilities">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#api">API</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#self-hosting">Self-Hosting</a> •
  <a href="#security">Security</a>
</p>

---

> Convert any webpage or document to clean, readable Markdown. Built for AI agents, MCP tools, and RAG pipelines. Powered by [succ](https://succ.ai).

## Quick Start

```bash
# Markdown output
curl https://md.succ.ai/https://example.com

# JSON output
curl -H "Accept: application/json" https://md.succ.ai/https://example.com

# Documents
curl https://md.succ.ai/https://example.com/report.pdf

# YouTube transcript
curl https://md.succ.ai/https://youtube.com/watch?v=dQw4w9WgXcQ
```

> **That's it.** No API key, no signup, no SDK. Just prepend `https://md.succ.ai/` to any URL.

## Features

| Feature | Description |
|---------|-------------|
| **9-Pass Extraction** | Readability, Defuddle, Article Extractor, CSS selectors, Schema.org, Open Graph, text density, cleaned body — quality-checked at each step |
| **6 Formats** | HTML, PDF, DOCX, XLSX, CSV, YouTube transcripts |
| **4-Tier Pipeline** | HTTP fetch → headless browser → LLM extraction → BaaS anti-bot bypass |
| **Quality Scoring** | Each conversion scored 0-1 with A-F grade |
| **Citation Links** | Numbered references with footer instead of inline links |
| **Fit Mode** | LLM-optimized output — pruned boilerplate, 30-50% fewer tokens |
| **Structured Extraction** | `/extract` endpoint — JSON schema in, structured data out (LLM-powered) |
| **Redis Cache** | Two-layer caching (Redis + in-memory fallback), SHA-256 hashed keys |
| **Rate Limiting** | Atomic Redis pipeline per-IP, CF-Connecting-IP support |
| **CF Detection** | Cloudflare challenge pages detected and handled without wasting credits |
| **SSRF Protection** | URL validation, DNS checks, private IP blocking, redirect validation |

<details>
<summary>Supported formats</summary>

| Format | Content-Type | Method |
|--------|-------------|--------|
| HTML | `text/html` | 9-pass extraction + Turndown |
| PDF | `application/pdf` | Text extraction via unpdf |
| DOCX | `application/vnd...wordprocessingml` | mammoth → HTML → Turndown |
| XLSX/XLS | `application/vnd...spreadsheetml` | SheetJS → Markdown tables |
| CSV | `text/csv` | SheetJS → Markdown table |
| YouTube | `youtube.com`, `youtu.be` | Transcript extraction with timestamps |

Documents are also detected by URL extension (`.pdf`, `.docx`, `.xlsx`, `.csv`) when `Content-Type` is `application/octet-stream`.

</details>

## API

**Base URL:** `https://md.succ.ai`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{url}` | Convert URL to Markdown |
| `GET` | `/?url={url}` | Same, query param format |
| `POST` | `/extract` | Structured data extraction (JSON schema) |
| `GET` | `/health` | Health check (includes Redis status) |
| `GET` | `/` | API info |

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
| `x-markdown-tokens` | Token count (cl100k_base) |
| `x-conversion-tier` | `fetch`, `browser`, `baas:scrapfly`, `llm`, `youtube`, `document:pdf`, etc. |
| `x-conversion-time` | Total conversion time in ms |
| `x-extraction-method` | Extraction pass used (`readability`, `defuddle`, `browser-raw`, etc.) |
| `x-quality-score` | Quality score 0-1 |
| `x-quality-grade` | Quality grade A-F |
| `x-readability` | `true` if Readability extracted clean content |
| `x-cache` | `hit` or `miss` (Redis-backed) |

<details>
<summary>JSON response format</summary>

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

Rate limited: 10 requests/minute per IP.

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
```

</details>

## How It Works

4-tier conversion pipeline — each tier only activates if the previous one produced insufficient quality:

```
URL ──→ Cache hit? ──→ Return cached result (Redis, 5min/1hr TTL)
         │
         ├─ YouTube? ──→ Transcript extraction (innertube API)
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

<details>
<summary>Caching</summary>

Two-layer cache system backed by Redis 7:

| Cache | TTL | Key | What's cached |
|-------|-----|-----|---------------|
| Markdown | 5 min | `cache:{sha256(url+options)}` | Full conversion result |
| Extract | 1 hr | `extract:{sha256(url)}:{sha256(schema)}` | LLM extraction result |

Cache keys use SHA-256 hashes to prevent poisoning via long/malicious URLs. Falls back to in-memory Map when Redis is unavailable.

</details>

<details>
<summary>Stack</summary>

| Component | Role |
|-----------|------|
| [Hono](https://hono.dev) | HTTP framework |
| [Mozilla Readability](https://github.com/mozilla/readability) | Primary content extraction |
| [Defuddle](https://github.com/nicedoc/defuddle) | Obsidian team's content extraction |
| [@extractus/article-extractor](https://github.com/nicedoc/extractus) | Alternative extraction heuristics |
| [Turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown conversion |
| [linkedom](https://github.com/WebReflection/linkedom) | Lightweight DOM parser |
| [Patchright](https://github.com/nicedoc/patchright) | Patched Chromium for anti-detection |
| [Redis](https://redis.io) + [ioredis](https://github.com/redis/ioredis) | Cache and rate limiting |
| [unpdf](https://github.com/unjs/unpdf) | PDF text extraction |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML conversion |
| [SheetJS](https://sheetjs.com) | XLSX/XLS/CSV parsing |
| [NanoGPT](https://nano-gpt.com) | LLM API for Tier 2.5 and /extract |
| [Ajv](https://ajv.js.org) | JSON Schema validation for /extract |
| [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) | cl100k_base token counting |

</details>

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

> Redis is optional for local development. Without Redis, caching and rate limiting fall back to in-memory Map.

<details>
<summary>Environment variables</summary>

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

</details>

<details>
<summary>Nginx reverse proxy</summary>

An example nginx config is in `nginx/md.succ.ai.conf`:

- Rate limiting: 10 req/s per IP, burst 20
- Connection limit: 10 concurrent per IP
- Proxy timeouts: 60s read (for browser renders)
- Dedicated `/extract` location with 64KB body limit
- Security headers (nosniff, X-Frame-Options, Referrer-Policy)

</details>

## Security

- **SSRF protection** — URL validation, DNS resolution checks (IPv4 + IPv6), redirect validation per hop, Patchright route blocking
- **Private IP blocking** — 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, CGNAT, cloud metadata hostnames, hex/octal IP formats
- **Input limits** — 5MB response size, 5 max redirects, content-type validation, 64KB body limit on /extract
- **Output sanitization** — Error messages stripped of internal paths/stack traces, URLs sanitized in responses
- **Cache security** — SHA-256 hashed keys (no URL poisoning), Redis LRU eviction (128MB cap), no persistence (pure cache)
- **API key safety** — BaaS API keys only used in outbound requests, never logged or exposed in responses
- **LLM hardening** — Prompt injection protection (HTML sanitization, document delimiters, output validation), schema field whitelist
- **Rate limiting** — Per-IP via Redis INCR+EXPIRE (atomic pipeline), CF-Connecting-IP support, in-memory fallback
- **CF challenge detection** — Cloudflare challenge pages detected and handled without wasting browser/BaaS credits
- **0 CVE** — All dependencies patched, monitored via Dependabot

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

> **Disclaimer:** Not affiliated with [NanoGPT](https://nano-gpt.com). LLM features use the NanoGPT API for pay-per-prompt model access.

---

Part of the [succ](https://succ.ai) ecosystem.
