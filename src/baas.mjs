/**
 * Multi-provider Browser-as-a-Service (BaaS) for Cloudflare Turnstile bypass.
 * Tries configured providers in order, skipping those without API keys or exhausted limits.
 * Returns raw HTML which feeds into the existing htmlToMarkdown pipeline.
 *
 * NOTE: All 3 providers require API keys in query params per their official API docs.
 * Keys are never logged — only provider name and target URL appear in logs.
 */
import { incrBaasUsage, getBaasUsage } from './redis.mjs';
import { getLog } from './logger.mjs';

const enc = (s) => encodeURIComponent(s);

/** Sanitize string for safe logging (prevent log injection via newlines) */
const safeLog = (s) => String(s).replace(/[\n\r\x1b\x00-\x1f]/g, '').slice(0, 120);

const PROVIDERS = [
  {
    name: 'scrapfly',
    envKey: 'SCRAPFLY_API_KEY',
    buildUrl: (key, url) =>
      `https://api.scrapfly.io/scrape?key=${key}&url=${enc(url)}&render_js=true&asp=true`,
    extractHtml: async (res) => {
      const json = await res.json();
      return json?.result?.content || '';
    },
    creditCost: 30,
    monthlyLimit: 1000,
  },
  {
    name: 'zenrows',
    envKey: 'ZENROWS_API_KEY',
    buildUrl: (key, url) =>
      `https://api.zenrows.com/v1/?apikey=${key}&url=${enc(url)}&js_render=true&antibot=true`,
    extractHtml: async (res) => res.text(),
    creditCost: 25,
    monthlyLimit: 1000,
  },
  {
    name: 'scrapingbee',
    envKey: 'SCRAPINGBEE_API_KEY',
    buildUrl: (key, url) =>
      `https://app.scrapingbee.com/api/v1/?api_key=${key}&url=${enc(url)}&stealth_proxy=true`,
    extractHtml: async (res) => res.text(),
    creditCost: 75,
    monthlyLimit: 1000,
  },
];

// Providers disabled for this process (after 429/402 errors)
const disabled = new Set();

/**
 * Fetch a URL using BaaS providers with anti-bot bypass.
 * Tries providers in order. Returns null if all fail or none configured.
 * @param {string} url Target URL
 * @returns {Promise<{html: string, provider: string}|null>}
 */
export async function fetchWithBaaS(url) {
  for (const provider of PROVIDERS) {
    const apiKey = process.env[provider.envKey];
    if (!apiKey || disabled.has(provider.name)) continue;

    // Check monthly usage
    const usage = await getBaasUsage(provider.name);
    if (usage + provider.creditCost > provider.monthlyLimit) {
      getLog().info({ provider: provider.name, usage, limit: provider.monthlyLimit }, 'BaaS monthly limit reached');
      continue;
    }

    try {
      const apiUrl = provider.buildUrl(apiKey, url);
      getLog().info({ provider: provider.name, url: safeLog(url) }, 'BaaS trying');

      const res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(45_000),
        headers: { 'Accept': 'text/html, application/json' },
      });

      if (res.status === 429 || res.status === 402) {
        getLog().warn({ provider: provider.name, httpStatus: res.status }, 'BaaS rate limited, disabling for session');
        disabled.add(provider.name);
        continue;
      }

      if (!res.ok) {
        getLog().warn({ provider: provider.name, httpStatus: res.status }, 'BaaS error response');
        continue;
      }

      const html = await provider.extractHtml(res);
      if (!html || html.length < 100) {
        getLog().warn({ provider: provider.name, chars: html?.length || 0 }, 'BaaS empty/tiny response');
        continue;
      }

      // Track usage
      await incrBaasUsage(provider.name, provider.creditCost);
      getLog().info({ provider: provider.name, chars: html.length }, 'BaaS success');

      return { html, provider: provider.name };
    } catch (err) {
      getLog().error({ provider: provider.name, err: err.message }, 'BaaS error');
      continue;
    }
  }

  return null;
}

/**
 * Check if any BaaS provider is configured (has API key).
 * @returns {boolean}
 */
export function hasBaaSProviders() {
  return PROVIDERS.some((p) => !!process.env[p.envKey] && !disabled.has(p.name));
}
