import { chromium } from 'patchright';

const MAX_CONCURRENT = 3;

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
 * Simple browser pool — launches one Chromium instance,
 * reuses it for all requests. Restarts if it crashes.
 * Limits concurrent contexts to MAX_CONCURRENT.
 */
export class BrowserPool {
  constructor() {
    this.browser = null;
    this.launching = null;
    this.active = 0;
  }

  async init() {
    if (this.browser?.isConnected()) return;
    if (this.launching) {
      await this.launching;
      return;
    }
    this.launching = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
      ],
    });
    try {
      this.browser = await this.launching;
    } finally {
      this.launching = null;
    }
    console.log('[browser-pool] Chromium launched');
  }

  async newPage() {
    if (this.active >= MAX_CONCURRENT) {
      throw new Error('Browser pool exhausted: too many concurrent requests');
    }

    if (!this.browser?.isConnected()) {
      this.browser = null;
      await this.init();
    }

    this.active++;

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

      return context.newPage();
    } catch (e) {
      this.active--;
      throw e;
    }
  }

  release() {
    if (this.active > 0) this.active--;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.active = 0;
      console.log('[browser-pool] Chromium closed');
    }
  }
}
