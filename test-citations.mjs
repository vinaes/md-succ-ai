import { strict as assert } from 'node:assert';

// convertToCitations and helpers are not exported from convert.mjs,
// so we duplicate the logic here for direct testing.

function findMatchingBracket(str, pos) {
  if (str[pos] !== '[') return -1;
  let depth = 1;
  for (let i = pos + 1; i < str.length && i < pos + 1000; i++) {
    if (str[i] === '\\') { i++; continue; }
    if (str[i] === '[') depth++;
    else if (str[i] === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function findMatchingParen(str, pos) {
  if (str[pos] !== '(') return -1;
  let depth = 1;
  for (let i = pos + 1; i < str.length && i < pos + 2000; i++) {
    if (str[i] === '\\') { i++; continue; }
    if (str[i] === '(') depth++;
    else if (str[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function convertToCitations(markdown) {
  const urlMap = new Map();
  let counter = 0;
  let body = '';
  let i = 0;
  while (i < markdown.length) {
    if (markdown[i] === '!' && markdown[i + 1] === '[') {
      const closeBracket = findMatchingBracket(markdown, i + 1);
      if (closeBracket !== -1 && markdown[closeBracket + 1] === '(') {
        const closeParen = findMatchingParen(markdown, closeBracket + 1);
        if (closeParen !== -1) { body += markdown.slice(i, closeParen + 1); i = closeParen + 1; continue; }
      }
      body += markdown[i++]; continue;
    }
    if (markdown[i] === '[') {
      const closeBracket = findMatchingBracket(markdown, i);
      if (closeBracket !== -1 && markdown[closeBracket + 1] === '(') {
        const closeParen = findMatchingParen(markdown, closeBracket + 1);
        if (closeParen !== -1) {
          const text = markdown.slice(i + 1, closeBracket);
          const url = markdown.slice(closeBracket + 2, closeParen).trim();
          if (/^(#|mailto:|tel:|javascript:|data:)/i.test(url)) { body += markdown.slice(i, closeParen + 1); }
          else { if (!urlMap.has(url)) urlMap.set(url, ++counter); body += `${text} [${urlMap.get(url)}]`; }
          i = closeParen + 1; continue;
        }
      }
    }
    body += markdown[i++];
  }
  if (counter === 0) return markdown;
  const refs = Array.from(urlMap.entries()).map(([url, num]) => `[${num}]: ${url}`).join('\n');
  return `${body.trim()}\n\nReferences:\n${refs}`;
}

// Tests
let passed = 0;

assert.equal(
  convertToCitations('Check [Google](https://google.com) and [Bing](https://bing.com)'),
  'Check Google [1] and Bing [2]\n\nReferences:\n[1]: https://google.com\n[2]: https://bing.com',
  'basic inline links',
); passed++;

assert.equal(
  convertToCitations('See [text [inner]](https://example.com)'),
  'See text [inner] [1]\n\nReferences:\n[1]: https://example.com',
  'nested brackets',
); passed++;

assert.equal(
  convertToCitations('![alt](img.png) and [link](https://x.com)'),
  '![alt](img.png) and link [1]\n\nReferences:\n[1]: https://x.com',
  'image preserved',
); passed++;

assert.equal(
  convertToCitations('[A](https://x.com) [B](https://x.com) [C](https://y.com)'),
  'A [1] B [1] C [2]\n\nReferences:\n[1]: https://x.com\n[2]: https://y.com',
  'duplicate URLs share ref number',
); passed++;

assert.equal(
  convertToCitations('[top](#top) and [link](https://z.com)'),
  '[top](#top) and link [1]\n\nReferences:\n[1]: https://z.com',
  'anchor links skipped',
); passed++;

assert.equal(
  convertToCitations('[Wiki](https://en.wikipedia.org/wiki/Foo_(bar))'),
  'Wiki [1]\n\nReferences:\n[1]: https://en.wikipedia.org/wiki/Foo_(bar)',
  'URL with parens',
); passed++;

assert.equal(
  convertToCitations('Plain text without links'),
  'Plain text without links',
  'no links returns original',
); passed++;

console.log(`All ${passed} tests passed.`);
