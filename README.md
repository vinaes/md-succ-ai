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

> Convert any webpage or document to clean, readable Markdown. Supports HTML, PDF, DOCX, XLSX, CSV, and YouTube transcripts. Citation-style links, LLM-optimized output, and structured data extraction. Built for AI agents, MCP tools, and RAG pipelines. Powered by [succ](https://succ.ai).

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
    "url": "https://example.com",
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "heading": { "type": "string" }
      }
    }
  }'
```

Returns structured JSON matching the provided schema, extracted by LLM.

### Response Headers

| Header | Description |
|--------|-------------|
| `x-markdown-tokens` | Token count (cl100k_base) |
| `x-conversion-tier` | `fetch`, `browser`, `llm`, `youtube`, `document:pdf`, etc. |
| `x-conversion-time` | Total conversion time in ms |
| `x-extraction-method` | Extraction pass used (`readability`, `defuddle`, `article-extractor`, etc.) |
| `x-quality-score` | Quality score 0-1 |
| `x-quality-grade` | Quality grade A-F |
| `x-readability` | `true` if Readability extracted clean content |
| `x-cache` | `hit` or `miss` |

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
| `GET` | `/health` | Health check |
| `GET` | `/` | API info |

## How It Works

Multi-tier conversion pipeline with 9-pass content extraction, quality scoring, and post-processing:

```
URL ──→ YouTube? ──→ Transcript extraction (innertube API)
         │
         ├─ Document? (PDF, DOCX, XLSX, CSV)
         │   └─→ Document converter → Markdown
         │
         ├─ Tier 1: 9-pass extraction pipeline
         │   1. Readability (standard)
         │   2. Defuddle (by Obsidian team)
         │   3. Article Extractor (different heuristics)
         │   4. Readability on cleaned HTML
         │   5. CSS content selectors
         │   6. Schema.org / JSON-LD
         │   7. Open Graph / meta tags
         │   8. Text density analysis
         │   9. Cleaned body fallback
         │   Quality ratio check after each pass (< 15% = skip)
         │
         ├─ Tier 2: Playwright headless browser (SPA/JS-heavy)
         │   └─→ Same 9-pass pipeline on rendered DOM
         │
         └─ Tier 2.5: LLM extraction (quality < B)
             └─→ nano-gpt API → structured extraction
```

Each tier only activates if the previous one produced insufficient quality. Post-processing applies citation conversion and fit_markdown pruning when requested.

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
| [Playwright](https://playwright.dev) | Headless Chromium for SPA/JS-heavy sites |
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
| `NANOGPT_API_KEY` | — | nano-gpt API key for LLM tier and /extract |
| `NANOGPT_MODEL` | `meta-llama/llama-3.1-8b-instruct` | LLM model for extraction |

### Nginx Reverse Proxy

An example nginx config is in `nginx/md.succ.ai.conf`:

- Rate limiting: 10 req/s per IP, burst 20
- Connection limit: 10 concurrent per IP
- Proxy timeouts: 60s read (for Playwright renders)
- Dedicated `/extract` location with 64KB body limit
- Security headers (nosniff, X-Frame-Options, Referrer-Policy)

## Security

- **SSRF protection**: URL validation, DNS resolution checks (IPv4 + IPv6), redirect validation per hop, Playwright route blocking
- **Private IP blocking**: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, CGNAT, cloud metadata hostnames, hex/octal IP formats
- **Input limits**: 5MB response size, 5 max redirects, content-type validation, 64KB body limit on /extract
- **Output sanitization**: Error messages stripped of internal paths/stack traces, URLs sanitized in responses
- **Cache**: In-memory LRU with TTL, normalized cache keys (strips tracking params), options-aware
- **LLM hardening**: Prompt injection protection (HTML sanitization, document delimiters, output validation), schema field whitelist
- **Rate limiting**: Per-IP rate limiting with Cloudflare CF-Connecting-IP support
- **0 CVE**: All dependencies patched, monitored via Dependabot

## License

[FSL-1.1-Apache-2.0](LICENSE) — Free for non-competitive use. Apache 2.0 after 2 years.

## Credits

Part of the [succ](https://succ.ai) ecosystem.
