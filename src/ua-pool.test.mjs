import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRandomUA, getRandomProfile, UA_LIST, PROFILES, CHROME_CIPHERS } from './ua-pool.mjs';

describe('ua-pool profiles', () => {
  it('PROFILES contains at least 8 entries', () => {
    assert.ok(PROFILES.length >= 8);
  });

  it('every profile has a User-Agent starting with Mozilla/5.0', () => {
    for (const p of PROFILES) {
      assert.ok(p.headers['User-Agent'].startsWith('Mozilla/5.0'),
        `Bad UA: ${p.headers['User-Agent']}`);
    }
  });

  it('every profile has Accept, Accept-Language, Accept-Encoding', () => {
    for (const p of PROFILES) {
      assert.ok(p.headers['Accept'], 'missing Accept');
      assert.ok(p.headers['Accept-Language'], 'missing Accept-Language');
      assert.ok(p.headers['Accept-Encoding'], 'missing Accept-Encoding');
    }
  });

  it('Chrome profiles include Sec-Ch-Ua headers', () => {
    const chrome = PROFILES.filter((p) =>
      p.browser === 'chrome');
    assert.ok(chrome.length >= 4, 'need at least 4 Chrome profiles');
    for (const p of chrome) {
      assert.ok(p.headers['Sec-Ch-Ua'], 'missing Sec-Ch-Ua');
      assert.ok(p.headers['Sec-Ch-Ua-Mobile'], 'missing Sec-Ch-Ua-Mobile');
      assert.ok(p.headers['Sec-Ch-Ua-Platform'], 'missing Sec-Ch-Ua-Platform');
    }
  });

  it('Chrome profiles have Sec-Ch-Ua matching Chrome version in UA', () => {
    const chrome = PROFILES.filter((p) => p.browser === 'chrome');
    for (const p of chrome) {
      const ver = p.headers['User-Agent'].match(/Chrome\/(\d+)/)?.[1];
      assert.ok(ver, 'Chrome version not found in UA');
      assert.ok(p.headers['Sec-Ch-Ua'].includes(ver),
        `Sec-Ch-Ua "${p.headers['Sec-Ch-Ua']}" does not match Chrome/${ver}`);
    }
  });

  it('Edge profiles have Sec-Ch-Ua with Chromium and Microsoft Edge brands', () => {
    const edge = PROFILES.filter((p) => p.browser === 'edge');
    assert.ok(edge.length >= 1, 'need at least 1 Edge profile');
    for (const p of edge) {
      assert.ok(p.headers['Sec-Ch-Ua'].includes('Chromium'), 'missing Chromium brand');
      assert.ok(p.headers['Sec-Ch-Ua'].includes('Microsoft Edge'), 'missing Edge brand');
    }
  });

  it('Firefox profiles do NOT include Sec-Ch-Ua', () => {
    const ff = PROFILES.filter((p) => p.browser === 'firefox');
    assert.ok(ff.length >= 2, 'need at least 2 Firefox profiles');
    for (const p of ff) {
      assert.equal(p.headers['Sec-Ch-Ua'], undefined);
      assert.equal(p.headers['Sec-Ch-Ua-Mobile'], undefined);
      assert.equal(p.headers['Sec-Ch-Ua-Platform'], undefined);
    }
  });

  it('Firefox profiles DO include Sec-Fetch-* headers', () => {
    const ff = PROFILES.filter((p) => p.browser === 'firefox');
    for (const p of ff) {
      assert.ok(p.headers['Sec-Fetch-Site'], 'missing Sec-Fetch-Site');
      assert.ok(p.headers['Sec-Fetch-Mode'], 'missing Sec-Fetch-Mode');
      assert.ok(p.headers['Sec-Fetch-Dest'], 'missing Sec-Fetch-Dest');
    }
  });

  it('Safari profiles do NOT include Sec-Ch-Ua or Sec-Fetch', () => {
    const safari = PROFILES.filter((p) => p.browser === 'safari');
    assert.ok(safari.length >= 1);
    for (const p of safari) {
      assert.equal(p.headers['Sec-Ch-Ua'], undefined);
      assert.equal(p.headers['Sec-Fetch-Site'], undefined);
    }
  });

  it('Chromium-based profiles include Sec-Fetch-* and Upgrade-Insecure-Requests', () => {
    const chromium = PROFILES.filter((p) => ['chrome', 'edge'].includes(p.browser));
    for (const p of chromium) {
      assert.ok(p.headers['Sec-Fetch-Site'], 'missing Sec-Fetch-Site');
      assert.ok(p.headers['Sec-Fetch-Mode'], 'missing Sec-Fetch-Mode');
      assert.ok(p.headers['Sec-Fetch-Dest'], 'missing Sec-Fetch-Dest');
      assert.ok(p.headers['Upgrade-Insecure-Requests'], 'missing Upgrade-Insecure-Requests');
    }
  });

  it('every profile has a valid browser field', () => {
    const valid = new Set(['chrome', 'firefox', 'edge', 'safari']);
    for (const p of PROFILES) {
      assert.ok(valid.has(p.browser), `invalid browser: ${p.browser}`);
    }
  });
});

describe('getRandomProfile', () => {
  it('returns an object with headers and browser fields', () => {
    const profile = getRandomProfile();
    assert.ok(typeof profile === 'object');
    assert.ok(typeof profile.headers === 'object');
    assert.ok(typeof profile.browser === 'string');
    assert.ok(profile.headers['User-Agent']);
  });

  it('returns different profiles over 100 calls', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(getRandomProfile().headers['User-Agent']);
    assert.ok(seen.size >= 2, `Expected variety, got ${seen.size} unique UAs`);
  });
});

describe('backward compatibility', () => {
  it('getRandomUA() returns a string from UA_LIST', () => {
    const ua = getRandomUA();
    assert.ok(typeof ua === 'string');
    assert.ok(UA_LIST.includes(ua), `UA not in list: ${ua}`);
  });

  it('UA_LIST has same length as PROFILES', () => {
    assert.equal(UA_LIST.length, PROFILES.length);
  });

  it('UA_LIST entries match profile User-Agents', () => {
    for (let i = 0; i < PROFILES.length; i++) {
      assert.equal(UA_LIST[i], PROFILES[i].headers['User-Agent']);
    }
  });
});

describe('CHROME_CIPHERS', () => {
  it('is a non-empty string', () => {
    assert.ok(typeof CHROME_CIPHERS === 'string');
    assert.ok(CHROME_CIPHERS.length > 50);
  });

  it('includes TLS 1.3 cipher suites', () => {
    assert.ok(CHROME_CIPHERS.includes('TLS_AES_128_GCM_SHA256'));
    assert.ok(CHROME_CIPHERS.includes('TLS_AES_256_GCM_SHA384'));
    assert.ok(CHROME_CIPHERS.includes('TLS_CHACHA20_POLY1305_SHA256'));
  });

  it('includes TLS 1.2 cipher suites', () => {
    assert.ok(CHROME_CIPHERS.includes('ECDHE-ECDSA-AES128-GCM-SHA256'));
    assert.ok(CHROME_CIPHERS.includes('ECDHE-RSA-AES128-GCM-SHA256'));
  });
});
