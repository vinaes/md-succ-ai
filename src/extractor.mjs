/**
 * Multi-pass HTML content extraction.
 * 9 extraction passes from best to worst quality, with ratio validation.
 */
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { extractFromHtml } from '@extractus/article-extractor';
import { Defuddle } from 'defuddle/node';

// ─── Constants ────────────────────────────────────────────────────────

export const ERROR_PATTERNS = [
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

export const BOILERPLATE_PATTERNS = [
  'cookie', 'consent', 'gdpr', 'privacy policy',
  'subscribe to', 'sign up for', 'newsletter',
  'accept all', 'reject all', 'manage preferences',
  'we use cookies', 'this site uses cookies',
  'terms of service', 'terms and conditions',
  'log in to', 'sign in to', 'create an account',
];

// SPA / framework payload markers — content is JS framework data, not readable text.
// Tested against markdown output (raw JS/RSC leaks through as text when extraction fails).
export const FRAMEWORK_PAYLOAD_PATTERNS = [
  // Next.js
  /self\.__next_f\s*=/, // RSC streaming payload
  /\$Sreact\.fragment/, // React Server Components serialized
  /\\"parallelRouterKey\\"/, // App Router internals
  /__NEXT_DATA__/, // Pages Router JSON blob
  /_next\/static\/chunks\//, // Next.js chunk URLs (multiple = SPA shell)
  // Nuxt
  /__NUXT__/, // Nuxt 2 hydration data
  /__nuxt/, // Nuxt 3 mount point
  // Remix
  /window\.__remixContext/, // Remix hydration
  /window\.__remixRouteModules/, // Remix route modules
  // SvelteKit
  /__sveltekit_/, // SvelteKit globals
  // Angular
  /ng-version=/, // Angular version attribute
  /<app-root[^>]*><\/app-root>/, // Empty Angular mount
  // Gatsby
  /___gatsby/, // Gatsby mount div
  /window\.___webpackCompilationHash/, // Gatsby webpack hash
  // Qwik
  /q:container/, // Qwik container attribute
  /q:version/, // Qwik version
  // Ember
  /ember-application/, // Ember app class
  /window\.Ember/, // Ember global
  // Astro (client-only)
  /astro-island/, // Astro island components
  // Generic SPA shells
  /webpackChunk[A-Za-z]/, // Webpack chunked app
  /window\.__INITIAL_STATE__/, // Vuex / generic SSR state
  /window\.__APP_DATA__/, // Generic app hydration
  /\bcreateSingletonRouter\b/, // Next.js router singleton
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

export const CONTENT_SELECTORS = [
  // Platform-specific: prefer tighter content selectors first
  'article.markdown-body',  // GitHub readme / wiki
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

// ─── Helpers ──────────────────────────────────────────────────────────

function isUsableText(text, minLength = 200) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < minLength) return false;
  const lower = trimmed.toLowerCase();
  return !ERROR_PATTERNS.some((p) => lower.includes(p));
}

function isUsableContent(article, minLength = 200) {
  return isUsableText(article?.textContent, minLength);
}

export function cleanHTML(document) {
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
          s.includes('visibility:hidden') || s.includes('visibility: hidden') ||
          s.includes('font-size:0') || s.includes('font-size: 0') ||
          (s.includes('position:absolute') && s.includes('left:-')) ||
          (s.includes('position: absolute') && s.includes('left: -')) ||
          s.includes('clip:rect(0') || s.includes('clip: rect(0') ||
          (s.includes('overflow:hidden') && s.includes('height:0')) ||
          (s.includes('overflow:hidden') && s.includes('width:0'))) {
        el.remove();
      }
    }
  } catch { /* skip */ }
  // Remove screen-reader-only / visually-hidden elements
  try {
    for (const cls of ['sr-only', 'visually-hidden', 'screen-reader-text']) {
      const els = document.querySelectorAll(`.${cls}`);
      for (const el of els) el.remove();
    }
  } catch { /* skip */ }
  return document;
}

// ─── Extraction passes ───────────────────────────────────────────────

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

async function tryDefuddle(html, url) {
  try {
    const result = await Defuddle(html, url);
    if (!result?.content) return null;
    const { document: doc } = parseHTML(`<html><body>${result.content}</body></html>`);
    if (!isUsableText(doc.body?.textContent)) return null;
    return {
      contentHtml: result.content,
      title: result.title || '',
      excerpt: result.description || '',
      byline: result.author || '',
      siteName: result.site || '',
      method: 'defuddle',
    };
  } catch {
    return null;
  }
}

async function tryArticleExtractor(html, url) {
  try {
    const article = await extractFromHtml(html, url);
    if (!article?.content) return null;
    const { document: doc } = parseHTML(`<html><body>${article.content}</body></html>`);
    if (!isUsableText(doc.body?.textContent)) return null;
    return {
      contentHtml: article.content,
      title: article.title || '',
      excerpt: article.description || '',
      byline: article.author || '',
      siteName: article.source || '',
      method: 'article-extractor',
    };
  } catch {
    return null;
  }
}

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

function trySchemaOrg(html) {
  const { document } = parseHTML(html);
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      let data = JSON.parse(script.textContent);
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

function tryTextDensity(html) {
  const { document } = parseHTML(html);
  cleanHTML(document);
  const body = document.body;
  if (!body) return null;

  let best = null;
  let bestScore = 0;

  for (const child of body.children) {
    const tag = child.tagName?.toLowerCase();
    if (['script', 'style', 'link', 'meta', 'br', 'hr'].includes(tag)) continue;

    const text = child.textContent?.trim() || '';
    const childHtml = child.innerHTML || '';
    if (text.length < 100) continue;

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

function tryCleanedBody(html) {
  const { document } = parseHTML(html);
  cleanHTML(document);
  const body = document.body;
  if (!body) return null;
  const text = body.textContent?.trim() || '';
  if (!isUsableText(text, 50)) return null;

  return {
    contentHtml: body.innerHTML,
    title: document.title || '',
    excerpt: '',
    byline: '',
    siteName: '',
    method: 'cleaned-body',
  };
}

// ─── Main extraction pipeline ─────────────────────────────────────────

/**
 * Multi-pass extraction: try methods from best to worst.
 * Quality ratio check: if extracted text is < 15% of raw text, skip to next pass
 * (catches over-aggressive Readability stripping).
 */
export async function extractContent(html, url) {
  // Compute raw text length once for ratio check.
  // Strip script/style first — their textContent inflates rawTextLen
  // on SPA pages (CSS variables, JS bundles count as "text" otherwise).
  const { document: rawDoc } = parseHTML(html);
  for (const tag of ['script', 'style', 'noscript']) {
    for (const el of rawDoc.querySelectorAll(tag)) el.remove();
  }
  const rawTextLen = rawDoc.body?.textContent?.trim().length || 0;

  const passes = [
    () => tryReadability(html, url),
    () => tryDefuddle(html, url),
    () => tryArticleExtractor(html, url),
    () => tryReadabilityCleaned(html, url),
    () => tryCssSelectors(html, url),
    () => trySchemaOrg(html),
    () => tryOpenGraph(html),
    () => tryTextDensity(html),
    () => tryCleanedBody(html),
  ];

  for (const pass of passes) {
    try {
      const result = await pass();
      if (!result) continue;

      // Quality ratio check: skip if extracted content is suspiciously small.
      // Exception: if extractor found >= 1000 chars, it's real content even on
      // heavy pages (GitHub 426KB HTML with 1.7KB readme = 0.4% ratio but valid).
      if (rawTextLen > 500) {
        const { document: extDoc } = parseHTML(`<html><body>${result.contentHtml}</body></html>`);
        const extTextLen = extDoc.body?.textContent?.trim().length || 0;
        const ratio = extTextLen / rawTextLen;
        if (ratio < 0.15 && extTextLen < 1000) {
          console.log(`[extract] ${result.method} ratio too low: ${(ratio * 100).toFixed(1)}% — trying next pass`);
          continue;
        }
      }

      return result;
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
