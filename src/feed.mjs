/**
 * RSS/Atom feed parser — converts feeds to structured Markdown.
 *
 * Supports: RSS 1.0, RSS 2.0, Atom, JSON Feed.
 * HTML content in feed items is converted via Turndown.
 */
import Parser from 'rss-parser';
import { turndown } from './markdown.mjs';

const parser = new Parser({ timeout: 10000 });

/** MIME types that indicate an RSS/Atom feed */
const FEED_MIME_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
]);

/** MIME types that MIGHT be feeds (need heuristic check) */
const MAYBE_FEED_MIME_TYPES = new Set([
  'text/xml',
  'application/xml',
]);

/**
 * Check if content-type indicates a definite feed.
 * For text/xml and application/xml, returns false — use looksLikeFeed() on content.
 */
export function isFeedContentType(mimeType) {
  return FEED_MIME_TYPES.has(mimeType);
}

/** Check if content-type might be a feed (text/xml, application/xml) */
export function maybeFeedContentType(mimeType) {
  return MAYBE_FEED_MIME_TYPES.has(mimeType);
}

/** Heuristic: check if XML content looks like a feed (for ambiguous MIME types) */
export function looksLikeFeed(xml) {
  const head = xml.slice(0, 500);
  return /<rss[\s>]|<feed[\s>]|<rdf:RDF/i.test(head);
}

/**
 * Parse RSS/Atom XML string and convert to Markdown.
 * @param {string} xml - Feed XML content
 * @param {string} sourceUrl - Original URL (for metadata)
 * @returns {{ markdown: string, title: string, itemCount: number }}
 */
export async function parseFeed(xml, sourceUrl) {
  const feed = await parser.parseString(xml);

  const lines = [];

  // Feed header
  lines.push(`# ${feed.title || 'Untitled Feed'}`);
  if (feed.description) lines.push(`\n> ${feed.description}`);
  if (feed.link) lines.push(`\nSource: ${feed.link}`);
  lines.push(`\n*${feed.items?.length || 0} items*\n`);

  // Items
  for (const item of (feed.items || [])) {
    lines.push(`## ${item.title || 'Untitled'}\n`);

    const meta = [];
    if (item.isoDate || item.pubDate) {
      const date = new Date(item.isoDate || item.pubDate);
      if (!isNaN(date)) meta.push(`Published: ${date.toISOString().split('T')[0]}`);
    }
    if (item.creator || item.author) {
      meta.push(`Author: ${item.creator || item.author}`);
    }
    if (meta.length) lines.push(`*${meta.join(' | ')}*\n`);

    // Content: prefer content:encoded > content > contentSnippet > summary
    const htmlContent = item['content:encoded'] || item.content || '';
    const textContent = item.contentSnippet || item.summary || '';

    if (htmlContent) {
      lines.push(turndown.turndown(htmlContent));
    } else if (textContent) {
      lines.push(textContent);
    }

    if (item.link) lines.push(`\n[Read more](${item.link})`);
    lines.push('\n---\n');
  }

  return {
    markdown: lines.join('\n'),
    title: feed.title || 'RSS Feed',
    itemCount: feed.items?.length || 0,
  };
}
