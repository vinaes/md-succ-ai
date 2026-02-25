import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKED_RESOURCE_TYPES, BLOCKED_DOMAINS, shouldBlockRequest } from './browser-pool.mjs';

describe('browser resource blocking', () => {
  describe('BLOCKED_RESOURCE_TYPES', () => {
    it('blocks image, media, font, websocket, manifest', () => {
      for (const t of ['image', 'media', 'font', 'websocket', 'manifest']) {
        assert.ok(BLOCKED_RESOURCE_TYPES.has(t), `should block ${t}`);
      }
    });

    it('does not block document, script, stylesheet, xhr, fetch', () => {
      for (const t of ['document', 'script', 'stylesheet', 'xhr', 'fetch']) {
        assert.ok(!BLOCKED_RESOURCE_TYPES.has(t), `should NOT block ${t}`);
      }
    });
  });

  describe('BLOCKED_DOMAINS', () => {
    it('contains at least 20 entries', () => {
      assert.ok(BLOCKED_DOMAINS.length >= 20, `only ${BLOCKED_DOMAINS.length} domains`);
    });

    it('includes major ad/tracker networks', () => {
      const has = (sub) => BLOCKED_DOMAINS.some((d) => d.includes(sub));
      assert.ok(has('doubleclick'), 'missing doubleclick');
      assert.ok(has('googlesyndication'), 'missing googlesyndication');
      assert.ok(has('google-analytics'), 'missing google-analytics');
      assert.ok(has('facebook'), 'missing facebook');
      assert.ok(has('hotjar'), 'missing hotjar');
      assert.ok(has('taboola'), 'missing taboola');
    });
  });

  describe('shouldBlockRequest', () => {
    it('blocks image resource type', () => {
      assert.ok(shouldBlockRequest('image', 'https://example.com/photo.jpg'));
    });

    it('blocks font resource type', () => {
      assert.ok(shouldBlockRequest('font', 'https://fonts.gstatic.com/s/roboto.woff2'));
    });

    it('blocks media resource type', () => {
      assert.ok(shouldBlockRequest('media', 'https://example.com/video.mp4'));
    });

    it('allows document resource type from non-blocked domain', () => {
      assert.ok(!shouldBlockRequest('document', 'https://example.com/page'));
    });

    it('allows script from non-blocked domain', () => {
      assert.ok(!shouldBlockRequest('script', 'https://example.com/app.js'));
    });

    it('blocks script from ad domain', () => {
      assert.ok(shouldBlockRequest('script', 'https://pagead2.googlesyndication.com/tag.js'));
    });

    it('blocks subdomain of ad domain', () => {
      assert.ok(shouldBlockRequest('script', 'https://cdn.doubleclick.net/tracker.js'));
    });

    it('blocks exact ad domain match', () => {
      assert.ok(shouldBlockRequest('script', 'https://doubleclick.net/pixel'));
    });

    it('does not block similar but non-matching domain', () => {
      assert.ok(!shouldBlockRequest('script', 'https://notdoubleclick.com/app.js'));
    });

    it('allows stylesheet from non-blocked domain', () => {
      assert.ok(!shouldBlockRequest('stylesheet', 'https://example.com/styles.css'));
    });

    it('blocks document from consent banner domain', () => {
      assert.ok(shouldBlockRequest('document', 'https://cdn.cookielaw.org/consent.html'));
    });

    it('handles invalid URLs gracefully', () => {
      assert.ok(!shouldBlockRequest('script', 'not-a-url'));
    });
  });
});
