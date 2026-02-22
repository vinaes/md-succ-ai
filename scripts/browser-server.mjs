/**
 * Browser sidecar entry point.
 * Launches Camoufox via launchServer() and exposes Playwright WebSocket.
 * Auto-restarts if Camoufox crashes. Includes HTTP health endpoint.
 */
import { launchServer as launchCamoufoxServer } from 'camoufox-js';
import { createServer } from 'node:http';

const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '9223', 10);

let server = null;
let launching = false;

async function launchServer() {
  if (launching) return;
  launching = true;
  try {
    console.log('[browser-server] starting Camoufox...');
    const launchOpts = {
      headless: true,
      port: CDP_PORT,
      host: '0.0.0.0',
      ws_path: '/camoufox',
    };

    server = await launchCamoufoxServer(launchOpts);
    console.log(`[browser-server] ready at ${server.wsEndpoint()}`);

    server.on('close', () => {
      console.warn('[browser-server] Camoufox closed, restarting in 1s...');
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

// Watchdog: restart if server dies.
setInterval(() => {
  if (!server && !launching) {
    console.warn('[browser-server] watchdog: browser not running, restarting...');
    launchServer();
  }
}, 10_000);
