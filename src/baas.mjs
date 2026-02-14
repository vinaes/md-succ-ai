/**
 * Multi-provider Browser-as-a-Service (BaaS) for Cloudflare Turnstile bypass.
 * Tries configured providers in order, skipping those without API keys or exhausted limits.
 * Returns raw HTML which feeds into the existing htmlToMarkdown pipeline.
 */
import { incrBaasUsage, getBaasUsage } from './redis.mjs';

const enc = (s) => encodeURIComponent(s);

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
      console.log(`[baas] ${provider.name} monthly limit reached (${usage}/${provider.monthlyLimit})`);
      continue;
    }

    try {
      const apiUrl = provider.buildUrl(apiKey, url);
      console.log(`[baas] trying ${provider.name} for ${url.slice(0, 80)}`);

      const res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(45_000),
        headers: { 'Accept': 'text/html, application/json' },
      });

      if (res.status === 429 || res.status === 402) {
        console.log(`[baas] ${provider.name} returned ${res.status}, disabling for session`);
        disabled.add(provider.name);
        continue;
      }

      if (!res.ok) {
        console.log(`[baas] ${provider.name} returned ${res.status}`);
        continue;
      }

      const html = await provider.extractHtml(res);
      if (!html || html.length < 100) {
        console.log(`[baas] ${provider.name} returned empty/tiny response (${html?.length || 0} chars)`);
        continue;
      }

      // Track usage
      await incrBaasUsage(provider.name, provider.creditCost);
      console.log(`[baas] ${provider.name} success: ${html.length} chars`);

      return { html, provider: provider.name };
    } catch (err) {
      console.error(`[baas] ${provider.name} error: ${err.message}`);
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
