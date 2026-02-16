import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRandomUA, UA_LIST } from './ua-pool.mjs';

describe('ua-pool', () => {
  it('returns a string from the known list', () => {
    const ua = getRandomUA();
    assert.ok(typeof ua === 'string');
    assert.ok(UA_LIST.includes(ua), `UA not in list: ${ua}`);
  });

  it('returns different values over multiple calls', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(getRandomUA());
    // With 10 UAs and 100 calls, we should see at least 2 different ones
    assert.ok(seen.size >= 2, `Expected variety, got ${seen.size} unique UAs`);
  });

  it('list contains at least 5 entries', () => {
    assert.ok(UA_LIST.length >= 5);
  });

  it('all entries look like real browser UAs', () => {
    for (const ua of UA_LIST) {
      assert.ok(ua.startsWith('Mozilla/5.0'), `Unexpected UA format: ${ua}`);
    }
  });
});
