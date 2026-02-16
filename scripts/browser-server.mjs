/**
 * Browser sidecar entry point.
 * Launches Chromium via Patchright launchServer() and exposes CDP WebSocket.
 * Auto-restarts if Chromium crashes. Includes HTTP health endpoint.
 */
import { chromium } from 'patchright';
import { createServer } from 'node:http';

const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '9223', 10);
const HAS_PROXIES = !!(process.env.PROXY_URLS || '').trim() || !!(process.env.PROXY_FILE || '').trim();

let server = null;
let launching = false;

async function launchServer() {
  if (launching) return;
  launching = true;
  try {
    console.log('[browser-server] starting Chromium...');
    const launchOpts = {
      headless: true,
      port: CDP_PORT,
      host: '0.0.0.0',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
      ],
    };
    // Enable per-context proxy when PROXY_URLS is configured
    if (HAS_PROXIES) {
      launchOpts.proxy = { server: 'per-context' };
      console.log('[browser-server] per-context proxy enabled');
    }
    server = await chromium.launchServer(launchOpts);
    console.log(`[browser-server] ready at ${server.wsEndpoint()}`);

    server.on('close', () => {
      console.warn('[browser-server] Chromium closed, restarting in 1s...');
      server = null;
      setTimeout(launchServer, 1000);
    });
  } catch (e) {
    console.error(`[browser-server] launch failed: ${e.message}`);
    server = null;
    setTimeout(launchServer, 3000);
  } finally {
    launching = false;
  }
}

// HTTP health endpoint
createServer((req, res) => {
  if (req.url === '/health') {
    const ok = server !== null;
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: ok ? 'ok' : 'not ready',
      ...(ok && { wsEndpoint: server.wsEndpoint() }),
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(HEALTH_PORT, '0.0.0.0', () => {
  console.log(`[browser-server] health endpoint on :${HEALTH_PORT}/health`);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`[browser-server] ${sig}, shutting down`);
    if (server) await server.close().catch(() => {});
    process.exit(0);
  });
}

await launchServer();

// Watchdog: restart if server dies
setInterval(() => {
  if (!server && !launching) {
    console.warn('[browser-server] watchdog: browser not running, restarting...');
    launchServer();
  }
}, 10_000);
