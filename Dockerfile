FROM node:22-slim

# Install Playwright system dependencies for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
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
    libasound2t64 \
    fonts-noto-color-emoji \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install deps
COPY package.json ./
RUN npm install --omit=dev

# Install only Chromium browser (not Firefox/WebKit)
RUN npx playwright install chromium

# Copy source code
COPY src/ ./src/

# Non-root user for security
RUN groupadd -r mduser && useradd -r -g mduser -G audio,video mduser \
    && mkdir -p /home/mduser && chown -R mduser:mduser /home/mduser /app
USER mduser

ENV PORT=3000
ENV ENABLE_BROWSER=true
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
