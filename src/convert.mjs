import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { encode } from 'gpt-tokenizer';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Remove image tags by default (configurable via ?images=true)
turndown.addRule('removeImages', {
  filter: 'img',
  replacement: (content, node) => {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('src') || '';
    // Keep images only if they have meaningful alt text or are content images
    if (alt && alt.length > 2 && !alt.startsWith('Image')) {
      return `![${alt}](${src})`;
    }
    return '';
  },
});

const ERROR_PATTERNS = [
  'something went wrong',
  'enable javascript',
  'please enable',
  'browser not supported',
  'cookies must be enabled',
  'access denied',
  'just a moment',
  'checking your browser',
  'please wait',
];

/**
 * Check if Readability extracted usable content
 */
function isUsableContent(article, minLength = 200) {
  if (!article?.textContent) return false;
  const text = article.textContent.trim();
  if (text.length < minLength) return false;
  const lower = text.toLowerCase();
  return !ERROR_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Fetch HTML via plain HTTP
 */
async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();
  return { html, status: res.status };
}

/**
 * Parse HTML with Readability + Turndown
 */
function htmlToMarkdown(html, url) {
  const { document } = parseHTML(html);
  const reader = new Readability(document, { url });
  const article = reader.parse();

  const usable = isUsableContent(article);
  const contentHtml = usable
    ? article.content
    : document.body?.innerHTML || html;
  const title = article?.title || document.title || '';

  const markdown = turndown.turndown(contentHtml);
  const tokens = encode(markdown).length;

  return {
    title,
    markdown,
    tokens,
    readability: usable,
    excerpt: article?.excerpt || '',
    byline: article?.byline || '',
    siteName: article?.siteName || '',
    htmlLength: html.length,
  };
}

/**
 * Fetch HTML via Playwright headless browser
 */
async function fetchWithBrowser(browserPool, url) {
  const page = await browserPool.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await page.close();
  }
}

/**
 * Full conversion pipeline: fetch → readability → turndown → tokens
 * With Playwright fallback for SPA sites
 */
export async function convert(url, browserPool = null) {
  const t0 = performance.now();
  let tier = 'fetch';

  // Tier 1: plain fetch + Readability
  let html;
  let fetchFailed = false;
  let fetchError = '';
  try {
    const { html: fetchedHtml } = await fetchHTML(url);
    html = fetchedHtml;
  } catch (e) {
    fetchFailed = true;
    fetchError = e.cause?.message || e.cause?.code || e.message;
    console.error(`[convert] fetch error for ${url}:`, fetchError, e.cause);
  }

  let result;
  if (!fetchFailed) {
    try {
      result = htmlToMarkdown(html, url);
    } catch (e) {
      console.error(`[convert] htmlToMarkdown failed for ${url}: ${e.message}`);
    }
  }

  // Tier 2: Playwright fallback if fetch failed or Readability got junk
  if (browserPool && (fetchFailed || !result?.readability)) {
    try {
      tier = 'browser';
      html = await fetchWithBrowser(browserPool, url);
      result = htmlToMarkdown(html, url);
    } catch (e) {
      // If Playwright also fails, use whatever we got from fetch
      if (!result) {
        throw new Error(
          `All conversion methods failed. Fetch: ${fetchError || 'parse error'}. Browser: ${e.message}`,
        );
      }
      tier = 'fetch (browser failed)';
    }
  }

  // No browser pool and fetch failed
  if (!result && fetchFailed) {
    throw new Error(`Fetch failed: ${fetchError}`);
  }

  if (!result) {
    throw new Error('Conversion produced no result');
  }

  const totalMs = Math.round(performance.now() - t0);

  return {
    ...result,
    url,
    tier,
    totalMs,
  };
}
