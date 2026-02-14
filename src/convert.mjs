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

const BOILERPLATE_PATTERNS = [
  'cookie', 'consent', 'gdpr', 'privacy policy',
  'subscribe to', 'sign up for', 'newsletter',
  'accept all', 'reject all', 'manage preferences',
  'we use cookies', 'this site uses cookies',
  'terms of service', 'terms and conditions',
  'log in to', 'sign in to', 'create an account',
];

const JUNK_SELECTORS = [
  'script', 'style', 'noscript', 'link[rel="stylesheet"]',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
  '[aria-hidden="true"]',
  '[class*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
  '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',
  '[class*="sidebar"]', '[class*="widget"]',
  '[class*="ad-"]', '[class*="ads-"]', '[class*="advert"]',
  '[class*="social-share"]', '[class*="share-"]',
  '[class*="newsletter"]', '[class*="subscribe"]',
  '[id*="cookie"]', '[id*="consent"]', '[id*="gdpr"]',
  '[id*="sidebar"]', '[id*="widget"]',
  '[id*="ad-"]', '[id*="ads-"]', '[id*="advert"]',
];

const CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.post-content',
  '.article-content',
  '.entry-content',
  '.page-content',
  '.post-body',
  '.article-body',
  '.story-body',
  '#content',
  '#main-content',
  '#main',
  '.content',
  '.post',
  '.article',
];

/**
 * Check if text is usable content (not error page, not too short)
 */
function isUsableText(text, minLength = 200) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < minLength) return false;
  const lower = trimmed.toLowerCase();
  return !ERROR_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Check if Readability extracted usable content
 */
function isUsableContent(article, minLength = 200) {
  return isUsableText(article?.textContent, minLength);
}

/**
 * Remove junk elements from a document clone
 */
function cleanHTML(document) {
  for (const selector of JUNK_SELECTORS) {
    try {
      const els = document.querySelectorAll(selector);
      for (const el of els) el.remove();
    } catch {
      // selector not supported by linkedom — skip
    }
  }
  // Remove hidden elements via inline style
  try {
    const all = document.querySelectorAll('[style]');
    for (const el of all) {
      const s = (el.getAttribute('style') || '').toLowerCase();
      if (s.includes('display:none') || s.includes('display: none') ||
          s.includes('visibility:hidden') || s.includes('visibility: hidden')) {
        el.remove();
      }
    }
  } catch { /* skip */ }
  return document;
}

/**
 * Pass 1: Standard Readability
 */
function tryReadability(html, url) {
  const { document } = parseHTML(html);
  const article = new Readability(document, { url }).parse();
  if (!isUsableContent(article)) return null;
  return {
    contentHtml: article.content,
    title: article.title || '',
    excerpt: article.excerpt || '',
    byline: article.byline || '',
    siteName: article.siteName || '',
    method: 'readability',
  };
}

/**
 * Pass 2: Readability on cleaned HTML
 */
function tryReadabilityCleaned(html, url) {
  const { document } = parseHTML(html);
  cleanHTML(document);
  const article = new Readability(document, { url }).parse();
  if (!isUsableContent(article)) return null;
  return {
    contentHtml: article.content,
    title: article.title || document.title || '',
    excerpt: article.excerpt || '',
    byline: article.byline || '',
    siteName: article.siteName || '',
    method: 'readability-cleaned',
  };
}

/**
 * Pass 3: CSS selector extraction
 */
function tryCssSelectors(html, url) {
  const { document } = parseHTML(html);
  cleanHTML(document);
  for (const selector of CONTENT_SELECTORS) {
    try {
      const el = document.querySelector(selector);
      if (el && isUsableText(el.textContent)) {
        return {
          contentHtml: el.innerHTML,
          title: document.title || '',
          excerpt: '',
          byline: '',
          siteName: '',
          method: 'css-selector',
        };
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Pass 4: Schema.org / JSON-LD structured data
 */
function trySchemaOrg(html) {
  const { document } = parseHTML(html);
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      let data = JSON.parse(script.textContent);
      // Handle @graph arrays
      if (data['@graph']) data = data['@graph'];
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const type = item['@type'] || '';
        const types = Array.isArray(type) ? type : [type];
        const isContent = types.some((t) =>
          ['Article', 'NewsArticle', 'BlogPosting', 'WebPage',
           'VideoObject', 'Product', 'Recipe', 'Review'].includes(t),
        );
        if (!isContent) continue;

        const parts = [];
        const title = item.headline || item.name || '';
        if (title) parts.push(`# ${title}`);
        if (item.description) parts.push(item.description);
        if (item.articleBody) parts.push(item.articleBody);

        // VideoObject: include duration, upload date
        if (types.includes('VideoObject')) {
          if (item.uploadDate) parts.push(`**Published:** ${item.uploadDate}`);
          if (item.duration) parts.push(`**Duration:** ${item.duration}`);
          if (item.author?.name) parts.push(`**Author:** ${item.author.name}`);
        }

        const markdown = parts.join('\n\n');
        if (isUsableText(markdown, 100)) {
          return {
            contentHtml: `<div>${parts.map((p) => `<p>${p}</p>`).join('')}</div>`,
            title: title,
            excerpt: item.description || '',
            byline: item.author?.name || '',
            siteName: item.publisher?.name || '',
            method: 'schema-org',
            prebuiltMarkdown: markdown,
          };
        }
      }
    } catch { /* invalid JSON-LD, skip */ }
  }
  return null;
}

/**
 * Pass 5: Open Graph / meta tag fallback
 */
function tryOpenGraph(html) {
  const { document } = parseHTML(html);
  const meta = (name) => {
    const el = document.querySelector(`meta[property="${name}"]`) ||
               document.querySelector(`meta[name="${name}"]`);
    return el?.getAttribute('content') || '';
  };

  const title = meta('og:title') || meta('twitter:title') || document.title || '';
  const description = meta('og:description') || meta('twitter:description') || meta('description') || '';

  if (!title && !description) return null;

  const parts = [];
  if (title) parts.push(`# ${title}`);
  if (description) parts.push(description);

  const siteName = meta('og:site_name') || '';
  const image = meta('og:image') || '';
  if (image) parts.push(`![](${image})`);

  const markdown = parts.join('\n\n');
  if (!isUsableText(markdown, 50)) return null;

  return {
    contentHtml: `<div>${parts.map((p) => `<p>${p}</p>`).join('')}</div>`,
    title,
    excerpt: description,
    byline: '',
    siteName,
    method: 'open-graph',
    prebuiltMarkdown: markdown,
  };
}

/**
 * Pass 6: Text density — find the DOM subtree with highest content density
 */
function tryTextDensity(html) {
  const { document } = parseHTML(html);
  cleanHTML(document);
  const body = document.body;
  if (!body) return null;

  let best = null;
  let bestScore = 0;

  for (const child of body.children) {
    const tag = child.tagName?.toLowerCase();
    // Skip tiny or structural elements
    if (['script', 'style', 'link', 'meta', 'br', 'hr'].includes(tag)) continue;

    const text = child.textContent?.trim() || '';
    const childHtml = child.innerHTML || '';
    if (text.length < 100) continue;

    // Text density: ratio of visible text to total HTML, weighted by text length
    const density = childHtml.length > 0 ? text.length / childHtml.length : 0;
    const score = density * Math.log(text.length + 1);

    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }

  if (!best || !isUsableText(best.textContent)) return null;

  return {
    contentHtml: best.innerHTML,
    title: document.title || '',
    excerpt: '',
    byline: '',
    siteName: '',
    method: 'text-density',
  };
}

/**
 * Pass 7: Cleaned body (last resort — still better than raw dump)
 */
function tryCleanedBody(html) {
  const { document } = parseHTML(html);
  cleanHTML(document);
  const body = document.body;
  if (!body) return null;
  const text = body.textContent?.trim() || '';
  if (text.length < 50) return null;

  return {
    contentHtml: body.innerHTML,
    title: document.title || '',
    excerpt: '',
    byline: '',
    siteName: '',
    method: 'cleaned-body',
  };
}

/**
 * Multi-pass extraction: try methods from best to worst
 */
function extractContent(html, url) {
  const passes = [
    () => tryReadability(html, url),
    () => tryReadabilityCleaned(html, url),
    () => tryCssSelectors(html, url),
    () => trySchemaOrg(html),
    () => tryOpenGraph(html),
    () => tryTextDensity(html),
    () => tryCleanedBody(html),
  ];

  for (const pass of passes) {
    try {
      const result = pass();
      if (result) return result;
    } catch {
      // pass failed, try next
    }
  }

  // Absolute fallback: raw body
  const { document } = parseHTML(html);
  return {
    contentHtml: document.body?.innerHTML || html,
    title: document.title || '',
    excerpt: '',
    byline: '',
    siteName: '',
    method: 'raw-body',
  };
}

/**
 * Score markdown output quality (0-1)
 */
function scoreMarkdown(markdown) {
  const text = markdown.replace(/[#*_\[\]()>`~\-|]/g, '').replace(/\s+/g, ' ').trim();
  const textLen = text.length;
  const mdLen = markdown.length || 1;

  // Length score: longer content is better, cap at 1
  const length = Math.min(textLen / 1000, 1);

  // Text density: ratio of clean text to raw markdown
  const textDensity = Math.min(textLen / mdLen, 1);

  // Structure: check for headings, paragraphs, lists
  const hasHeadings = /^#{1,6}\s/m.test(markdown);
  const hasParagraphs = markdown.split('\n\n').length > 2;
  const hasLists = /^[\s]*[-*]\s/m.test(markdown);
  const structureHits = [hasHeadings, hasParagraphs, hasLists].filter(Boolean).length;
  const structure = structureHits === 3 ? 1 : structureHits === 2 ? 0.7 : structureHits === 1 ? 0.4 : 0.1;

  // Boilerplate penalty
  const lower = text.toLowerCase();
  const boilerplateHits = BOILERPLATE_PATTERNS.filter((p) => lower.includes(p)).length;
  const boilerplate = Math.max(0, 1 - boilerplateHits * 0.15);

  // Link density: high link-to-text ratio = likely navigation
  const linkTexts = markdown.match(/\[([^\]]*)\]\([^)]*\)/g) || [];
  const linkTextLen = linkTexts.reduce((sum, l) => sum + l.length, 0);
  const linkDensity = mdLen > 0 ? Math.max(0, 1 - (linkTextLen / mdLen) * 2) : 1;

  const score =
    length * 0.15 +
    textDensity * 0.25 +
    structure * 0.2 +
    boilerplate * 0.2 +
    linkDensity * 0.2;

  const clamped = Math.round(Math.min(Math.max(score, 0), 1) * 100) / 100;

  let grade;
  if (clamped >= 0.8) grade = 'A';
  else if (clamped >= 0.6) grade = 'B';
  else if (clamped >= 0.4) grade = 'C';
  else if (clamped >= 0.2) grade = 'D';
  else grade = 'F';

  return { score: clamped, grade };
}

/**
 * Parse HTML with multi-pass extraction + Turndown + quality scoring
 */
function htmlToMarkdown(html, url) {
  const extracted = extractContent(html, url);

  // Schema.org and OpenGraph may provide pre-built markdown
  const markdown = extracted.prebuiltMarkdown || turndown.turndown(extracted.contentHtml);
  const tokens = encode(markdown).length;
  const quality = scoreMarkdown(markdown);

  return {
    title: extracted.title,
    markdown,
    tokens,
    readability: extracted.method === 'readability',
    excerpt: extracted.excerpt,
    byline: extracted.byline,
    siteName: extracted.siteName,
    htmlLength: html.length,
    method: extracted.method,
    quality,
  };
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
 * Fetch HTML via Playwright headless browser
 */
async function fetchWithBrowser(browserPool, url) {
  const page = await browserPool.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    const ctx = page.context();
    await page.close();
    await ctx.close();
  }
}

/**
 * Full conversion pipeline: fetch → multi-pass extraction → turndown → tokens → quality
 * With Playwright fallback for SPA sites
 */
export async function convert(url, browserPool = null) {
  const t0 = performance.now();
  let tier = 'fetch';

  // Tier 1: plain fetch
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

  // Tier 2: Playwright fallback if fetch failed or extraction quality is low
  const needsBrowser = fetchFailed ||
    (!result?.readability && result?.method !== 'readability-cleaned' && (result?.quality?.score ?? 0) < 0.6);
  if (browserPool && needsBrowser) {
    try {
      tier = 'browser';
      html = await fetchWithBrowser(browserPool, url);
      const browserResult = htmlToMarkdown(html, url);
      // Use browser result if it's better than fetch result
      if (!result || browserResult.quality.score > result.quality.score) {
        result = browserResult;
      }
    } catch (e) {
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
