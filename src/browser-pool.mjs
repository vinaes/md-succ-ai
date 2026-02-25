import { firefox } from 'playwright-core';
import { launchOptions } from 'camoufox-js';
import { getLog } from './logger.mjs';
import {
  browserLaunchesTotal,
  browserPageDuration,
  browserPoolExhaustedTotal,
  proxyRequestsTotal,
} from './metrics.mjs';
import { ProxyPool } from './proxy-pool.mjs';

const MAX_CONCURRENT = 3;

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

// ─── Resource blocking ──────────────────────────────────────────────

const BROWSER_BLOCK_ENABLED = process.env.BROWSER_BLOCK_RESOURCES !== 'false';

/**
 * Resource types to block in browser contexts.
 * Images are stripped by markdown.mjs anyway; fonts/media/websockets waste bandwidth.
 */
export const BLOCKED_RESOURCE_TYPES = new Set([
  'image', 'media', 'font', 'websocket', 'manifest',
  'eventsource', 'texttrack',
]);

/**
 * Ad/tracker domain suffixes to block.
 * Matched via endsWith — catches subdomains automatically.
 */
export const BLOCKED_DOMAINS = [
  // Google ads/analytics
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'adservice.google.com',
  // Facebook
  'facebook.net',
  'fbcdn.net',
  // Twitter/X
  'platform.twitter.com',
  'ads-twitter.com',
  // Amazon ads
  'amazon-adsystem.com',
  // Microsoft/Bing
  'bat.bing.com',
  'clarity.ms',
  // Analytics
  'hotjar.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'heap.io',
  'fullstory.com',
  'mouseflow.com',
  // Ad networks
  'outbrain.com',
  'taboola.com',
  'criteo.com',
  'criteo.net',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'adnxs.com',
  'moatads.com',
  'quantserve.com',
  'scorecardresearch.com',
  'chartbeat.com',
  'optimizely.com',
  // Consent/cookie banners
  'cookielaw.org',
  'onetrust.com',
  'trustarc.com',
];

/**
 * Check if a browser sub-request should be blocked.
 * @param {string} resourceType - Playwright resource type
 * @param {string} url - Request URL
 * @returns {boolean}
 */
export function shouldBlockRequest(resourceType, url) {
  if (!BROWSER_BLOCK_ENABLED) return false;
  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) return true;
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Browser pool — supports local (in-process Camoufox) and remote (WS sidecar) modes.
 * Launches/connects once, reuses for all requests. Reconnects on crash.
 * Limits concurrent contexts to MAX_CONCURRENT.
 * Supports per-context proxy rotation and UA randomization.
 */
export class BrowserPool {
  constructor(options = {}) {
    this.browser = null;
    this.launching = null;
    this.active = 0;
    this.mode = options.mode || 'local';
    this.wsEndpoint = options.wsEndpoint || '';
    this.proxyPool = options.proxyPool || null;
    this._pageTimers = new WeakMap();
    this._pageProxies = new WeakMap();  // page → proxy url (for health tracking)
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

    getLog().info({ mode: this.mode }, 'camoufox ready');
  }

  async _launchLocal() {
    const opts = await launchOptions({ headless: true });
    // Remove browser-level proxy from Camoufox defaults — we rotate per-context
    delete opts.proxy;
    return firefox.launch(opts);
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
    return firefox.connect(actualWs);
  }

  /**
   * Build context options with optional proxy rotation.
   * Playwright Firefox supports per-context proxy natively (no special launch flags needed).
   * @returns {{ contextOpts: object, proxyUrl: string|null }}
   */
  _getContextOptions() {
    // Camoufox generates realistic fingerprints (UA, viewport, screen geometry)
    // at the C++ level — do NOT override userAgent or viewport here.
    const contextOpts = {
      locale: 'en-US',
    };

    let proxyUrl = null;

    if (this.proxyPool?.size) {
      const proxy = this.proxyPool.getNext();
      if (proxy) {
        contextOpts.proxy = ProxyPool.parseForPlaywright(proxy.url);
        proxyUrl = proxy.url;
      }
    }

    return { contextOpts, proxyUrl };
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
      const { contextOpts, proxyUrl } = this._getContextOptions();
      const context = await this.browser.newContext(contextOpts);

      // Block SSRF + ads/trackers/heavy resources
      await context.route('**/*', (route) => {
        try {
          const reqUrl = route.request().url();
          const u = new URL(reqUrl);
          // SSRF protection
          if (isPrivateHost(u.hostname)) {
            route.abort('blockedbyclient');
            return;
          }
          // Resource/domain blocking (bandwidth + speed optimization)
          if (shouldBlockRequest(route.request().resourceType(), reqUrl)) {
            route.abort('blockedbyclient');
            return;
          }
        } catch { /* allow if URL parse fails */ }
        route.continue();
      });

      const page = await context.newPage();
      this._pageTimers.set(page, stopTimer);
      if (proxyUrl) this._pageProxies.set(page, proxyUrl);
      return page;
    } catch (e) {
      this.active--;
      stopTimer();
      throw e;
    }
  }

  /**
   * Release a page back to the pool.
   * @param {object} page
   * @param {boolean} [success=true] Whether the page operation succeeded (for proxy health tracking)
   */
  release(page, success = true) {
    if (this.active > 0) this.active--;
    if (page) {
      const stopTimer = this._pageTimers.get(page);
      if (stopTimer) {
        stopTimer();
        this._pageTimers.delete(page);
      }
      const proxyUrl = this._pageProxies.get(page);
      if (proxyUrl && this.proxyPool) {
        if (success) {
          this.proxyPool.markSuccess(proxyUrl);
          proxyRequestsTotal.inc({ result: 'success' });
        } else {
          this.proxyPool.markFailed(proxyUrl);
          proxyRequestsTotal.inc({ result: 'fail' });
        }
        this._pageProxies.delete(page);
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
      this._pageProxies = new WeakMap();
      getLog().info('camoufox closed');
    }
  }
}
