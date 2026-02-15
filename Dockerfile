# == Stage 1: Builder ==
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Strip bloat from node_modules (docs, tests, sourcemaps)
RUN find /app/node_modules -type f \( \
      -name '*.md' -o -name '*.markdown' -o -name '*.txt' \
      -o -name 'LICENSE*' -o -name 'CHANGELOG*' -o -name 'HISTORY*' \
      -o -name '.npmignore' -o -name '.eslintrc*' -o -name '.prettierrc*' \
      -o -name 'tsconfig.json' -o -name '*.map' \
    \) -delete 2>/dev/null; \
    find /app/node_modules -type d \( \
      -name '__tests__' -o -name 'test' -o -name 'tests' -o -name '.github' \
    \) -exec rm -rf {} + 2>/dev/null; true

# == Stage 2: Runtime (API-only, NO Chromium) ==
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd -r mduser && useradd -r -g mduser mduser \
    && mkdir -p /home/mduser && chown -R mduser:mduser /home/mduser /app

COPY --from=builder --chown=mduser:mduser /app/node_modules ./node_modules/
COPY --chown=mduser:mduser package.json ./
COPY --chown=mduser:mduser src/ ./src/

USER mduser

ENV PORT=3000
ENV ENABLE_BROWSER=remote
ENV BROWSER_WS_ENDPOINT=ws://md-browser:9222
ENV NODE_ENV=production
ENV NODE_OPTIONS=--use-openssl-ca

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.mjs"]
