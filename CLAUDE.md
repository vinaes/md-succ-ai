# md.succ.ai

HTML to clean Markdown API. Part of the [succ](https://succ.ai) ecosystem.

## Architecture

- **src/server.mjs** — Hono HTTP server, routing, content negotiation
- **src/convert.mjs** — Two-tier conversion pipeline (fetch → Camoufox browser fallback)
- **src/browser-pool.mjs** — Singleton Camoufox (Firefox) browser pool with auto-restart
- **Dockerfile.browser** — Camoufox Firefox sidecar image + system deps
- **docker-compose.yml** — Production config (port 3100, 1G RAM browser sidecar, 1gb shm)
- **nginx/** — Reverse proxy config with rate limiting

## Stack

- Node.js 22, ESM modules (.mjs)
- Hono + @hono/node-server
- Mozilla Readability (content extraction)
- Turndown (HTML → Markdown)
- linkedom (DOM parsing)
- Camoufox (Firefox fork with C++ anti-detection)
- gpt-tokenizer (cl100k_base token counting)

## Deployment

See `.env.deploy` (gitignored) for server credentials and deploy commands.

## Conventions

- All source files use .mjs extension (ESM)
- No build step — source runs directly
- Commit messages follow succ format (see main succ repo)
- Docker-first deployment, no PM2/systemd
