/**
 * Unit tests for isBlockedUrl security function.
 * Tests URL blocking logic for private IPs, metadata endpoints, and protocol validation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedUrl } from './convert.mjs';

describe('isBlockedUrl', () => {
  describe('Private IP ranges', () => {
    it('blocks localhost', () => {
      assert.strictEqual(isBlockedUrl('http://localhost/test'), true);
    });

    it('blocks 127.0.0.1', () => {
      assert.strictEqual(isBlockedUrl('http://127.0.0.1/test'), true);
    });

    it('blocks 10.0.0.1', () => {
      assert.strictEqual(isBlockedUrl('http://10.0.0.1/test'), true);
    });

    it('blocks 192.168.1.1', () => {
      assert.strictEqual(isBlockedUrl('http://192.168.1.1/test'), true);
    });

    it('blocks 172.16.0.1', () => {
      assert.strictEqual(isBlockedUrl('http://172.16.0.1/test'), true);
    });

    it('blocks 172.31.255.255', () => {
      assert.strictEqual(isBlockedUrl('http://172.31.255.255/test'), true);
    });

    it('allows 172.15.0.1 (not private)', () => {
      assert.strictEqual(isBlockedUrl('http://172.15.0.1/test'), false);
    });

    it('blocks 169.254.169.254 (link-local / AWS metadata)', () => {
      assert.strictEqual(isBlockedUrl('http://169.254.169.254/latest/meta-data'), true);
    });

    it('blocks 100.64.0.1 (CGNAT)', () => {
      assert.strictEqual(isBlockedUrl('http://100.64.0.1/test'), true);
    });

    it('allows 100.63.0.1 (not CGNAT)', () => {
      assert.strictEqual(isBlockedUrl('http://100.63.0.1/test'), false);
    });

    it('blocks 0.0.0.0', () => {
      assert.strictEqual(isBlockedUrl('http://0.0.0.0/test'), true);
    });
  });

  describe('Cloud metadata', () => {
    it('blocks metadata.google.internal', () => {
      assert.strictEqual(isBlockedUrl('http://metadata.google.internal/computeMetadata/v1/'), true);
    });

    it('blocks instance-data.ec2.internal', () => {
      assert.strictEqual(isBlockedUrl('http://instance-data.ec2.internal/latest/meta-data'), true);
    });

    it('blocks metadata.goog', () => {
      assert.strictEqual(isBlockedUrl('http://metadata.goog/computeMetadata/v1/'), true);
    });
  });

  describe('Protocol enforcement', () => {
    it('blocks file:///etc/passwd', () => {
      assert.strictEqual(isBlockedUrl('file:///etc/passwd'), true);
    });

    it('blocks ftp://server/file', () => {
      assert.strictEqual(isBlockedUrl('ftp://server.example.com/file.txt'), true);
    });

    it('blocks javascript:alert(1)', () => {
      assert.strictEqual(isBlockedUrl('javascript:alert(1)'), true);
    });
  });

  describe('IP obfuscation', () => {
    it('blocks hex IP 0x7f000001', () => {
      assert.strictEqual(isBlockedUrl('http://0x7f000001/test'), true);
    });

    it('blocks decimal IP 2130706433', () => {
      assert.strictEqual(isBlockedUrl('http://2130706433/test'), true);
    });

    it('octal IP 0127.0.0.1 is normalized by URL parser to 87.0.0.1 (public)', () => {
      // URL parser converts octal 0127 → decimal 87, so hostname becomes 87.0.0.1
      assert.strictEqual(isBlockedUrl('http://0127.0.0.1/test'), false);
    });
  });

  describe('IPv6', () => {
    it('blocks [::1]', () => {
      assert.strictEqual(isBlockedUrl('http://[::1]/test'), true);
    });

    it('blocks bracket-wrapped hostnames [anything]', () => {
      assert.strictEqual(isBlockedUrl('http://[malicious.com]/test'), true);
    });
  });

  describe('Valid public URLs', () => {
    it('allows https://example.com', () => {
      assert.strictEqual(isBlockedUrl('https://example.com'), false);
    });

    it('allows https://google.com/path?q=1', () => {
      assert.strictEqual(isBlockedUrl('https://google.com/path?q=1'), false);
    });

    it('allows http://93.184.216.34 (public IP)', () => {
      assert.strictEqual(isBlockedUrl('http://93.184.216.34/test'), false);
    });
  });

  describe('Edge cases', () => {
    it('http:///path parses hostname as "path" (not empty) — allowed', () => {
      // URL parser treats http:///path as hostname="path", not empty
      assert.strictEqual(isBlockedUrl('http:///path'), false);
    });

    it('blocks empty string', () => {
      assert.strictEqual(isBlockedUrl(''), true);
    });

    it('returns true for unparseable URL', () => {
      assert.strictEqual(isBlockedUrl('not-a-valid-url'), true);
    });
  });
});
