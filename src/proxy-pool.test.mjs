import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProxyPool, loadProxyFile } from './proxy-pool.mjs';

describe('ProxyPool', () => {
  let pool;

  beforeEach(() => {
    pool = new ProxyPool([
      'http://user1:pass1@proxy1.example.com:8080',
      'http://user2:pass2@proxy2.example.com:8080',
      'http://proxy3.example.com:8080',
    ]);
  });

  describe('constructor', () => {
    it('parses proxy URLs', () => {
      assert.equal(pool.size, 3);
    });

    it('handles empty list', () => {
      const empty = new ProxyPool([]);
      assert.equal(empty.size, 0);
    });

    it('trims and filters blanks', () => {
      const p = new ProxyPool(['  http://a:8080 ', '', '  ', 'http://b:8080']);
      assert.equal(p.size, 2);
    });
  });

  describe('getNext', () => {
    it('returns null when no proxies', () => {
      const empty = new ProxyPool([]);
      assert.equal(empty.getNext(), null);
    });

    it('returns proxy with url and dispatcher', () => {
      const result = pool.getNext();
      assert.ok(result);
      assert.ok(result.url);
      assert.ok(result.dispatcher);
    });

    it('round-robins through proxies', () => {
      const urls = [];
      for (let i = 0; i < 6; i++) urls.push(pool.getNext().url);
      // Should cycle: 1, 2, 3, 1, 2, 3
      assert.equal(urls[0], urls[3]);
      assert.equal(urls[1], urls[4]);
      assert.equal(urls[2], urls[5]);
      assert.notEqual(urls[0], urls[1]);
    });
  });

  describe('markFailed', () => {
    it('puts proxy in cooldown', () => {
      const first = pool.getNext();
      pool.markFailed(first.url);

      // Next call should skip the failed one
      const second = pool.getNext();
      assert.notEqual(second.url, first.url);
    });

    it('returns null when all proxies in cooldown', () => {
      const p1 = pool.getNext();
      const p2 = pool.getNext();
      const p3 = pool.getNext();
      pool.markFailed(p1.url);
      pool.markFailed(p2.url);
      pool.markFailed(p3.url);

      assert.equal(pool.getNext(), null);
    });

    it('ignores unknown proxy URL', () => {
      pool.markFailed('http://unknown:9999');
      // Should not throw, pool still works
      assert.ok(pool.getNext());
    });
  });

  describe('markSuccess', () => {
    it('resets failure count and cooldown', () => {
      const first = pool.getNext();
      pool.markFailed(first.url);

      // Verify it's in cooldown
      const stats1 = pool.getStats();
      assert.equal(stats1.cooldown, 1);

      // Mark success
      pool.markSuccess(first.url);
      const stats2 = pool.getStats();
      assert.equal(stats2.cooldown, 0);
    });

    it('ignores unknown proxy URL', () => {
      pool.markSuccess('http://unknown:9999');
      // Should not throw
    });
  });

  describe('getStats', () => {
    it('reports correct stats when all healthy', () => {
      const stats = pool.getStats();
      assert.deepEqual(stats, { total: 3, healthy: 3, cooldown: 0 });
    });

    it('reports correct stats with cooldowns', () => {
      pool.markFailed(pool.getNext().url);
      const stats = pool.getStats();
      assert.equal(stats.total, 3);
      assert.equal(stats.healthy, 2);
      assert.equal(stats.cooldown, 1);
    });

    it('reports all zero for empty pool', () => {
      const empty = new ProxyPool([]);
      assert.deepEqual(empty.getStats(), { total: 0, healthy: 0, cooldown: 0 });
    });
  });

  describe('parseForPlaywright', () => {
    it('parses URL with credentials', () => {
      const result = ProxyPool.parseForPlaywright('http://user:pass@host.com:8080');
      assert.deepEqual(result, {
        server: 'http://host.com:8080',
        username: 'user',
        password: 'pass',
      });
    });

    it('parses URL without credentials', () => {
      const result = ProxyPool.parseForPlaywright('http://host.com:3128');
      assert.deepEqual(result, { server: 'http://host.com:3128' });
    });

    it('decodes URI-encoded credentials', () => {
      const result = ProxyPool.parseForPlaywright('http://us%40er:p%23ss@host.com:8080');
      assert.equal(result.username, 'us@er');
      assert.equal(result.password, 'p#ss');
    });

    it('defaults port for http', () => {
      const result = ProxyPool.parseForPlaywright('http://host.com');
      assert.equal(result.server, 'http://host.com:80');
    });
  });

  describe('cooldown recovery', () => {
    it('proxy recovers after cooldown expires', () => {
      // Create a pool with a very short cooldown for testing
      const p = new ProxyPool(['http://proxy1:8080']);

      const proxy = p.getNext();
      p.markFailed(proxy.url);

      // Currently in cooldown
      assert.equal(p.getNext(), null);

      // Manually expire the cooldown
      p._proxies[0].cooldownUntil = Date.now() - 1;

      // Should be available again
      const recovered = p.getNext();
      assert.ok(recovered);
      assert.equal(recovered.url, 'http://proxy1:8080');
    });
  });
});

describe('loadProxyFile', () => {
  let tmpDir;
  let tmpFile;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'proxy-test-'));
    tmpFile = join(tmpDir, 'proxies.txt');
  });

  afterEach(() => {
    try { unlinkSync(tmpFile); } catch {}
  });

  it('loads one proxy per line', () => {
    writeFileSync(tmpFile, 'http://proxy1:8080\nhttp://proxy2:8080\nhttp://proxy3:8080\n');
    const urls = loadProxyFile(tmpFile);
    assert.deepEqual(urls, [
      'http://proxy1:8080',
      'http://proxy2:8080',
      'http://proxy3:8080',
    ]);
  });

  it('skips blank lines and comments', () => {
    writeFileSync(tmpFile, '# my proxies\nhttp://proxy1:8080\n\n# disabled\n  \nhttp://proxy2:8080\n');
    const urls = loadProxyFile(tmpFile);
    assert.deepEqual(urls, [
      'http://proxy1:8080',
      'http://proxy2:8080',
    ]);
  });

  it('trims whitespace from lines', () => {
    writeFileSync(tmpFile, '  http://proxy1:8080  \n\thttp://proxy2:8080\t\n');
    const urls = loadProxyFile(tmpFile);
    assert.deepEqual(urls, [
      'http://proxy1:8080',
      'http://proxy2:8080',
    ]);
  });

  it('returns empty array for missing file', () => {
    const urls = loadProxyFile('/nonexistent/proxies.txt');
    assert.deepEqual(urls, []);
  });

  it('returns empty array for empty file', () => {
    writeFileSync(tmpFile, '');
    const urls = loadProxyFile(tmpFile);
    assert.deepEqual(urls, []);
  });
});
