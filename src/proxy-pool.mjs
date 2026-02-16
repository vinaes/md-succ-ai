/**
 * Proxy rotation pool with health tracking and auto-cooldown.
 *
 * Config (pick one):
 *   PROXY_FILE=/path/to/proxies.txt  — one proxy URL per line (recommended)
 *   PROXY_URLS=http://p1:8080,http://p2:8080  — comma-separated (quick setup)
 *
 * If both set, PROXY_FILE takes priority.
 *
 * Features:
 *   - Round-robin rotation, skipping proxies in cooldown
 *   - Exponential cooldown on failure (60s → 120s → 240s, max 5min)
 *   - Auto-recovery when cooldown expires
 *   - Returns null when no proxies configured or all in cooldown (= direct fetch)
 */
import { readFileSync } from 'node:fs';
import { ProxyAgent } from 'undici';

const DEFAULT_COOLDOWN = 60_000;   // 60s initial cooldown
const MAX_COOLDOWN = 300_000;      // 5min max cooldown

export class ProxyPool {
  /**
   * @param {string[]} proxyUrls
   */
  constructor(proxyUrls = []) {
    this._index = 0;
    this._proxies = proxyUrls
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((url) => ({
        url,
        dispatcher: new ProxyAgent(url),
        failures: 0,
        cooldownUntil: 0,
      }));
  }

  /** Total configured proxies */
  get size() {
    return this._proxies.length;
  }

  /**
   * Get next healthy proxy (round-robin, skip cooldown).
   * @returns {{ url: string, dispatcher: import('undici').ProxyAgent } | null}
   */
  getNext() {
    if (!this._proxies.length) return null;

    const now = Date.now();
    const len = this._proxies.length;

    for (let i = 0; i < len; i++) {
      const idx = (this._index + i) % len;
      const proxy = this._proxies[idx];
      if (proxy.cooldownUntil <= now) {
        this._index = (idx + 1) % len;
        return { url: proxy.url, dispatcher: proxy.dispatcher };
      }
    }

    // All proxies in cooldown — return null (direct fetch)
    return null;
  }

  /**
   * Mark a proxy as failed. Enters exponential cooldown.
   * @param {string} url
   */
  markFailed(url) {
    const proxy = this._proxies.find((p) => p.url === url);
    if (!proxy) return;
    proxy.failures++;
    const cooldown = Math.min(
      DEFAULT_COOLDOWN * Math.pow(2, proxy.failures - 1),
      MAX_COOLDOWN,
    );
    proxy.cooldownUntil = Date.now() + cooldown;
  }

  /**
   * Mark a proxy as successful. Resets failure count.
   * @param {string} url
   */
  markSuccess(url) {
    const proxy = this._proxies.find((p) => p.url === url);
    if (!proxy) return;
    proxy.failures = 0;
    proxy.cooldownUntil = 0;
  }

  /**
   * Pool health stats.
   * @returns {{ total: number, healthy: number, cooldown: number }}
   */
  getStats() {
    const now = Date.now();
    const cooldown = this._proxies.filter((p) => p.cooldownUntil > now).length;
    return {
      total: this._proxies.length,
      healthy: this._proxies.length - cooldown,
      cooldown,
    };
  }

  /**
   * Parse a proxy URL into Playwright-compatible proxy config.
   * @param {string} url e.g. "http://user:pass@host:8080"
   * @returns {{ server: string, username?: string, password?: string }}
   */
  static parseForPlaywright(url) {
    const parsed = new URL(url);
    const server = `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? '443' : '80')}`;
    const result = { server };
    if (parsed.username) result.username = decodeURIComponent(parsed.username);
    if (parsed.password) result.password = decodeURIComponent(parsed.password);
    return result;
  }
}

/**
 * Load proxy URLs from a file (one per line).
 * Ignores blank lines and lines starting with #.
 * @param {string} filePath
 * @returns {string[]}
 */
export function loadProxyFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

/** Singleton instance */
let _instance = null;

/**
 * Get the singleton ProxyPool.
 * Priority: PROXY_FILE > PROXY_URLS.
 * @returns {ProxyPool}
 */
export function getProxyPool() {
  if (!_instance) {
    let urls = [];
    const proxyFile = process.env.PROXY_FILE;
    if (proxyFile) {
      urls = loadProxyFile(proxyFile);
    } else {
      urls = (process.env.PROXY_URLS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    _instance = new ProxyPool(urls);
  }
  return _instance;
}

/**
 * Reset the singleton (for tests).
 * @param {ProxyPool} [pool]
 */
export function _resetProxyPool(pool = null) {
  _instance = pool;
}
