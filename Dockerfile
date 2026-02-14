FROM node:22-slim

# Install CA certs + Patchright/Chromium system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-noto-color-emoji \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Non-root user for security (create early so Patchright installs to correct home)
RUN groupadd -r mduser && useradd -r -g mduser -G audio,video mduser \
    && mkdir -p /home/mduser && chown -R mduser:mduser /home/mduser /app

# Copy package files and install deps (as root for node_modules permissions)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && chown -R mduser:mduser /app

# Install Chromium as mduser so browser lands in /home/mduser/.cache/
USER mduser
RUN npx patchright install chromium

# Copy source code
COPY --chown=mduser:mduser src/ ./src/

ENV PORT=3000
ENV ENABLE_BROWSER=true
ENV NODE_ENV=production
ENV NODE_OPTIONS=--use-openssl-ca

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
