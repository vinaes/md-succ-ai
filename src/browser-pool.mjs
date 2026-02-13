import { chromium } from 'playwright';

/**
 * Simple browser pool — launches one Chromium instance,
 * reuses it for all requests. Restarts if it crashes.
 */
export class BrowserPool {
  constructor() {
    this.browser = null;
    this.launching = null;
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
    if (!this.browser?.isConnected()) {
      this.browser = null;
      await this.init();
    }
    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    });
    return context.newPage();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('[browser-pool] Chromium closed');
    }
  }
}
