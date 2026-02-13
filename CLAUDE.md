# md.succ.ai

HTML to clean Markdown API. Part of the [succ](https://succ.ai) ecosystem.

## Architecture

- **src/server.mjs** — Hono HTTP server, routing, content negotiation
- **src/convert.mjs** — Two-tier conversion pipeline (fetch → Playwright fallback)
- **src/browser-pool.mjs** — Singleton Chromium browser pool with auto-restart
- **Dockerfile** — node:22-slim + Playwright Chromium + system deps
- **docker-compose.yml** — Production config (port 3100, 2G RAM, 512mb shm)
- **nginx/** — Reverse proxy config with rate limiting

## Stack

- Node.js 22, ESM modules (.mjs)
- Hono + @hono/node-server
- Mozilla Readability (content extraction)
- Turndown (HTML → Markdown)
- linkedom (DOM parsing)
- Playwright (headless Chromium for SPA)
- gpt-tokenizer (cl100k_base token counting)

## Deployment

- Server: 213.165.58.70
- User: md_succ_ai (/home/md_succ_ai/repo/)
- Docker container: md-succ-ai (port 3100 → 3000)
- Nginx reverse proxy: md.succ.ai
- SSL: Cloudflare (wildcard *.succ.ai)
- Deploy: `su - md_succ_ai -c 'cd /home/md_succ_ai/repo && git pull'` then `docker compose up -d --build`

## Conventions

- All source files use .mjs extension (ESM)
- No build step — source runs directly
- Commit messages follow succ format (see main succ repo)
- Docker-first deployment, no PM2/systemd
