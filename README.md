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

> Convert any webpage or document to clean, readable Markdown. Supports HTML, PDF, DOCX, XLSX, and CSV. Built for AI agents, MCP tools, and RAG pipelines. Powered by [succ](https://succ.ai).

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

# Documents work too
curl https://md.succ.ai/https://example.com/report.pdf
curl https://md.succ.ai/https://example.com/data.xlsx
```

### Response Headers

| Header | Description |
|--------|-------------|
| `x-markdown-tokens` | Token count (cl100k_base) |
| `x-conversion-tier` | `fetch`, `browser`, `llm`, `document:pdf`, `external`, etc. |
| `x-conversion-time` | Total conversion time in ms |
| `x-extraction-method` | Extraction pass used (`readability`, `article-extractor`, `css-selector`, `pdf`, etc.) |
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
| `GET` | `/health` | Health check |
| `GET` | `/` | API info |

## How It Works

Multi-tier conversion pipeline with 8-pass content extraction and quality scoring:

```
URL ──→ Fetch HTML/Document
         │
         ├─ Document? (PDF, DOCX, XLSX, CSV)
         │   └─→ Document converter → Markdown
         │
         ├─ Tier 1: 8-pass extraction pipeline
         │   1. Readability (standard)
         │   2. Article Extractor (different heuristics)
         │   3. Readability on cleaned HTML
         │   4. CSS content selectors
         │   5. Schema.org / JSON-LD
         │   6. Open Graph / meta tags
         │   7. Text density analysis
         │   8. Cleaned body fallback
         │
         ├─ Tier 2: Playwright headless browser (SPA/JS-heavy)
         │   └─→ Same 8-pass pipeline on rendered DOM
         │
         ├─ Tier 2.5: LLM extraction (quality < B)
         │   └─→ nano-gpt API → structured extraction
         │
         └─ Tier 3: External API fallbacks (quality < C)
```

Each tier only activates if the previous one produced insufficient quality.

## Supported Formats

| Format | Content-Type | Method |
|--------|-------------|--------|
| HTML | `text/html` | 8-pass extraction + Turndown |
| PDF | `application/pdf` | Text extraction via unpdf |
| DOCX | `application/vnd...wordprocessingml` | mammoth → HTML → Turndown |
| XLSX/XLS | `application/vnd...spreadsheetml` | SheetJS → Markdown tables |
| CSV | `text/csv` | SheetJS → Markdown table |

Documents are also detected by URL extension (`.pdf`, `.docx`, `.xlsx`, `.csv`) when `Content-Type` is `application/octet-stream`.

### Stack

| Component | Role |
|-----------|------|
| [Mozilla Readability](https://github.com/mozilla/readability) | Primary content extraction |
| [@extractus/article-extractor](https://github.com/nicedoc/extractus) | Alternative extraction heuristics |
| [Turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown conversion |
| [linkedom](https://github.com/WebReflection/linkedom) | Lightweight DOM parser |
| [Playwright](https://playwright.dev) | Headless Chromium for SPA/JS-heavy sites |
| [unpdf](https://github.com/unjs/unpdf) | PDF text extraction |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML conversion |
| [SheetJS](https://sheetjs.com) | XLSX/XLS/CSV parsing |
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
| `NANOGPT_API_KEY` | — | nano-gpt API key for LLM tier |
| `NANOGPT_MODEL` | `meta-llama/llama-3.1-8b-instruct` | LLM model for extraction |
| `EXTERNAL_API_LIMIT` | `200` | Monthly limit per external API |
| `DATA_DIR` | `./data` | Directory for usage tracking |

### Nginx Reverse Proxy

An example nginx config is in `nginx/md.succ.ai.conf`:

- Rate limiting: 10 req/s per IP, burst 20
- Connection limit: 10 concurrent per IP
- Proxy timeouts: 60s read (for Playwright renders)
- Security headers (nosniff, X-Frame-Options, Referrer-Policy)

## Security

- **SSRF protection**: URL validation, DNS resolution checks (IPv4 + IPv6), redirect validation per hop, Playwright route blocking
- **Private IP blocking**: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, CGNAT, cloud metadata hostnames, hex/octal IP formats
- **Input limits**: 5MB response size, 5 max redirects, content-type validation
- **Output sanitization**: Error messages stripped of internal paths/stack traces, URLs sanitized in responses
- **Cache**: In-memory LRU with TTL, normalized cache keys (strips tracking params)
- **LLM hardening**: Prompt injection protection (HTML sanitization, document delimiters, output validation)
- **0 CVE**: All dependencies patched, monitored via Dependabot

## License

[FSL-1.1-Apache-2.0](LICENSE) — Free for non-competitive use. Apache 2.0 after 2 years.

## Credits

Part of the [succ](https://succ.ai) ecosystem.
