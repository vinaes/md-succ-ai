import { chromium } from 'patchright';
import { getLog } from './logger.mjs';
import {
  browserLaunchesTotal,
  browserPageDuration,
  browserPoolExhaustedTotal,
} from './metrics.mjs';

const MAX_CONCURRENT = 3;

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--disable-extensions',
];

/**
 * Parse ENABLE_BROWSER env var into a mode string.
 * @param {string|undefined} value
 * @returns {'off' | 'local' | 'remote'}
 */
export function parseBrowserMode(value) {
  if (!value || value === 'false') return 'off';
  if (value === 'remote') return 'remote';
  return 'local'; // 'true', 'local', or any other value
}

/**
 * Check if hostname points to private/internal address (SSRF protection)
 */
function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '[::1]' || h === '') return true;
  if (h.startsWith('[')) return true;

  // Cloud metadata hostnames
  const bare = h.endsWith('.') ? h.slice(0, -1) : h;
  if (['metadata.google.internal', 'metadata.goog', 'instance-data.ec2.internal'].includes(bare)) return true;

  // Numeric/hex/octal IP formats
  if (/^0x[0-9a-f]+$/i.test(h) || /^\d+$/.test(h)) return true;

  const parts = h.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) {
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT
    if (a === 169 && b === 254) return true;               // Link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;      // Private
    if (a === 192 && b === 168) return true;               // Private
    if (a === 198 && b >= 18 && b <= 19) return true;      // Benchmark
    if (a === 192 && b === 0 && c === 0) return true;      // IETF protocol
  }

  return false;
}

/**
 * Browser pool — supports local (in-process Chromium) and remote (CDP sidecar) modes.
 * Launches/connects once, reuses for all requests. Reconnects on crash.
 * Limits concurrent contexts to MAX_CONCURRENT.
 */
export class BrowserPool {
  constructor(options = {}) {
    this.browser = null;
    this.launching = null;
    this.active = 0;
    this.mode = options.mode || 'local';
    this.wsEndpoint = options.wsEndpoint || '';
    this._pageTimers = new WeakMap();
  }

  async init() {
    if (this.browser?.isConnected()) return;
    if (this.launching) {
      await this.launching;
      return;
    }

    this.launching = this.mode === 'remote'
      ? this._connectRemote()
      : this._launchLocal();

    try {
      this.browser = await this.launching;
      browserLaunchesTotal.inc();
    } catch (e) {
      if (this.mode === 'remote') {
        throw new Error(`Cannot connect to browser sidecar at ${this.wsEndpoint}: ${e.message}`);
      }
      throw e;
    } finally {
      this.launching = null;
    }

    getLog().info({ mode: this.mode }, 'chromium ready');
  }

  async _launchLocal() {
    return chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  }

  async _connectRemote() {
    // Discover the full WS endpoint (with GUID) from the sidecar health endpoint
    const healthUrl = this.wsEndpoint
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')
      .replace(/:\d+.*$/, ':9223/health');
    const res = await fetch(healthUrl);
    if (!res.ok) throw new Error(`Browser sidecar health check failed: ${res.status}`);
    const { wsEndpoint } = await res.json();
    if (!wsEndpoint) throw new Error('Browser sidecar returned no wsEndpoint');
    // Replace 0.0.0.0 with the actual sidecar hostname
    const host = new URL(this.wsEndpoint.replace('ws://', 'http://')).hostname;
    const actualWs = wsEndpoint.replace('0.0.0.0', host);
    return chromium.connect(actualWs);
  }

  async newPage() {
    if (this.active >= MAX_CONCURRENT) {
      browserPoolExhaustedTotal.inc();
      throw new Error('Browser pool exhausted: too many concurrent requests');
    }

    if (!this.browser?.isConnected()) {
      this.browser = null;
      await this.init();
    }

    this.active++;
    const stopTimer = browserPageDuration.startTimer();

    try {
      const context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
      });

      // Block sub-requests to private/internal addresses (SSRF protection)
      await context.route('**/*', (route) => {
        try {
          const u = new URL(route.request().url());
          if (isPrivateHost(u.hostname)) {
            route.abort('blockedbyclient');
            return;
          }
        } catch { /* allow if URL parse fails */ }
        route.continue();
      });

      const page = await context.newPage();
      this._pageTimers.set(page, stopTimer);
      return page;
    } catch (e) {
      this.active--;
      stopTimer();
      throw e;
    }
  }

  release(page) {
    if (this.active > 0) this.active--;
    if (page) {
      const stopTimer = this._pageTimers.get(page);
      if (stopTimer) {
        stopTimer();
        this._pageTimers.delete(page);
      }
    }
  }

  isReady() {
    return !!this.browser?.isConnected();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.active = 0;
      this._pageTimers = new WeakMap();
      getLog().info('chromium closed');
    }
  }
}
