import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isFeedContentType, maybeFeedContentType, looksLikeFeed, parseFeed } from './feed.mjs';

// ─── isFeedContentType ─────────────────────────────────────────────────

describe('isFeedContentType', () => {
  it('returns true for application/rss+xml', () => {
    assert.equal(isFeedContentType('application/rss+xml'), true);
  });

  it('returns true for application/atom+xml', () => {
    assert.equal(isFeedContentType('application/atom+xml'), true);
  });

  it('returns true for application/feed+json', () => {
    assert.equal(isFeedContentType('application/feed+json'), true);
  });

  it('returns false for text/html', () => {
    assert.equal(isFeedContentType('text/html'), false);
  });

  it('returns false for text/xml (this is "maybe", not "definite")', () => {
    assert.equal(isFeedContentType('text/xml'), false);
  });
});

// ─── maybeFeedContentType ───────────────────────────────────────────────

describe('maybeFeedContentType', () => {
  it('returns true for text/xml', () => {
    assert.equal(maybeFeedContentType('text/xml'), true);
  });

  it('returns true for application/xml', () => {
    assert.equal(maybeFeedContentType('application/xml'), true);
  });

  it('returns false for text/html', () => {
    assert.equal(maybeFeedContentType('text/html'), false);
  });

  it('returns false for application/rss+xml (definite types are NOT in maybe set)', () => {
    assert.equal(maybeFeedContentType('application/rss+xml'), false);
  });
});

// ─── looksLikeFeed ──────────────────────────────────────────────────────

describe('looksLikeFeed', () => {
  it('detects <rss tag', () => {
    const xml = '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>';
    assert.equal(looksLikeFeed(xml), true);
  });

  it('detects <feed tag (Atom)', () => {
    const xml = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>';
    assert.equal(looksLikeFeed(xml), true);
  });

  it('detects <rdf:RDF tag', () => {
    const xml = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>';
    assert.equal(looksLikeFeed(xml), true);
  });

  it('returns false for regular HTML', () => {
    const html = '<!DOCTYPE html><html><head><title>Page</title></head><body></body></html>';
    assert.equal(looksLikeFeed(html), false);
  });
});

// ─── parseFeed ──────────────────────────────────────────────────────────

describe('parseFeed', () => {
  it('parses RSS 2.0 with 3 items', async () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <link>https://blog.example.com</link>
    <description>A test blog</description>
    <item>
      <title>First Post</title>
      <link>https://blog.example.com/first</link>
      <pubDate>Wed, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>First post content</description>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://blog.example.com/second</link>
      <pubDate>Thu, 02 Jan 2024 00:00:00 GMT</pubDate>
      <description>Second post content</description>
    </item>
    <item>
      <title>Third Post</title>
      <link>https://blog.example.com/third</link>
      <pubDate>Fri, 03 Jan 2024 00:00:00 GMT</pubDate>
      <description>Third post content</description>
    </item>
  </channel>
</rss>`;

    const result = await parseFeed(rss, 'https://blog.example.com/feed.xml');

    assert.equal(result.title, 'Test Blog');
    assert.equal(result.itemCount, 3);
    assert.match(result.markdown, /# Test Blog/);
    assert.match(result.markdown, /## First Post/);
    assert.match(result.markdown, /\[Read more\]\(https:\/\/blog\.example\.com\/first\)/);
  });

  it('parses Atom feed', async () => {
    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <link href="https://atom.example.com"/>
  <entry>
    <title>Entry One</title>
    <link href="https://atom.example.com/one"/>
    <summary>Summary of entry one</summary>
  </entry>
  <entry>
    <title>Entry Two</title>
    <link href="https://atom.example.com/two"/>
    <summary>Summary of entry two</summary>
  </entry>
</feed>`;

    const result = await parseFeed(atom, 'https://atom.example.com/feed');

    assert.equal(result.title, 'Atom Test Feed');
    assert.equal(result.itemCount, 2);
  });

  it('handles empty feed', async () => {
    const empty = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;

    const result = await parseFeed(empty, 'https://example.com/empty.xml');

    assert.equal(result.itemCount, 0);
    assert.match(result.markdown, /\*0 items\*/);
  });

  it('converts HTML content in items to markdown', async () => {
    const htmlFeed = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>HTML Feed</title>
    <item>
      <title>HTML Post</title>
      <content:encoded><![CDATA[<h2>Subtitle</h2><p>Paragraph with <a href="https://example.com">a link</a>.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

    const result = await parseFeed(htmlFeed, 'https://example.com/html-feed.xml');

    // Turndown converts h2 to markdown heading
    assert.match(result.markdown, /Subtitle/);
    assert.match(result.markdown, /\[a link\]\(https:\/\/example\.com\)/);
  });
});
