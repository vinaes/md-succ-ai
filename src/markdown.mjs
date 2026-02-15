/**
 * Shared markdown utilities: Turndown instance, quality scoring,
 * token counting, markdown cleanup, URL resolution, pruning.
 */
import TurndownService from 'turndown';
import { encode } from 'gpt-tokenizer';
import { BOILERPLATE_PATTERNS, ERROR_PATTERNS, FRAMEWORK_PAYLOAD_PATTERNS } from './extractor.mjs';

// ─── Turndown instance ───────────────────────────────────────────────

export const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Treat <div> as block element — add line breaks around content.
turndown.addRule('blockDiv', {
  filter: 'div',
  replacement: (content) => {
    const trimmed = content.trim();
    if (!trimmed) return '';
    return '\n' + trimmed + '\n';
  },
});

// Remove SVG elements — they produce empty/broken text in markdown.
turndown.addRule('removeSvg', {
  filter: 'svg',
  replacement: () => '',
});

// Smart code block handling: detect language, skip line numbers, safe fences
turndown.addRule('fencedCodeBlock', {
  filter: (node, options) => {
    return (
      options.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    );
  },
  replacement: (content, node) => {
    const code = node.firstChild;

    const classes = (code.getAttribute('class') || '') + ' ' + (node.getAttribute('class') || '');
    const langMatch = classes.match(/(?:language|lang|highlight)-(\w[\w+#.-]*)/i);
    const lang = langMatch ? langMatch[1].toLowerCase() : '';

    function extractCode(el) {
      let text = '';
      for (const child of el.childNodes || []) {
        if (child.nodeType === 3) {
          text += child.textContent;
        } else if (child.nodeType === 1) {
          const cls = (child.getAttribute('class') || '').toLowerCase();
          const tag = child.tagName?.toLowerCase();
          if (/\b(line-?number|gutter|ln-num|hljs-ln-n|linenumber|copy|clipboard)\b/.test(cls)) continue;
          if (tag === 'button') continue;
          text += extractCode(child);
        }
      }
      return text;
    }

    let codeText = extractCode(code);
    codeText = codeText.replace(/\n$/, '');

    const backtickRuns = codeText.match(/`+/g) || [];
    const maxLen = backtickRuns.reduce((max, run) => Math.max(max, run.length), 0);
    const fence = '`'.repeat(Math.max(3, maxLen + 1));

    return `\n\n${fence}${lang}\n${codeText}\n${fence}\n\n`;
  },
});

// Remove image tags by default, strip avatar/badge/icon noise
turndown.addRule('removeImages', {
  filter: 'img',
  replacement: (content, node) => {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('src') || '';
    const cls = node.getAttribute('class') || '';

    const noisePattern = /avatar|gravatar|badge|icon|logo|emoji|spinner|loading|pixel|tracking|spacer/i;
    if (noisePattern.test(alt) || noisePattern.test(src) || noisePattern.test(cls)) return '';

    const w = parseInt(node.getAttribute('width') || '0', 10);
    const h = parseInt(node.getAttribute('height') || '0', 10);
    if ((w > 0 && w <= 24) || (h > 0 && h <= 24)) return '';

    if (alt && alt.length > 2 && !alt.startsWith('Image')) {
      return `![${alt}](${src})`;
    }
    return '';
  },
});

// ─── Token counting ──────────────────────────────────────────────────

export function countTokens(text) {
  if (text.length > 500_000) {
    return Math.ceil(text.length / 4);
  }
  return encode(text).length;
}

// ─── Quality scoring ─────────────────────────────────────────────────

export function scoreMarkdown(markdown) {
  const text = markdown.replace(/[#*_\[\]()>`~\-|]/g, '').replace(/\s+/g, ' ').trim();
  const textLen = text.length;
  const mdLen = markdown.length || 1;

  const length = Math.min(textLen / 1000, 1);
  const textDensity = Math.min(textLen / mdLen, 1);

  const hasHeadings = /^#{1,6}\s/m.test(markdown);
  const hasParagraphs = markdown.split('\n\n').length > 2;
  const hasLists = /^[\s]*[-*]\s/m.test(markdown);
  const structureHits = [hasHeadings, hasParagraphs, hasLists].filter(Boolean).length;
  const structure = structureHits === 3 ? 1 : structureHits === 2 ? 0.7 : structureHits === 1 ? 0.4 : 0.1;

  const lower = text.toLowerCase();
  const boilerplateHits = BOILERPLATE_PATTERNS.filter((p) => lower.includes(p)).length;
  const boilerplate = Math.max(0, 1 - boilerplateHits * 0.15);

  const linkTexts = markdown.match(/\[([^\]]*)\]\([^)]*\)/g) || [];
  const linkTextLen = linkTexts.reduce((sum, l) => sum + l.length, 0);
  const linkDensity = mdLen > 0 ? Math.max(0, 1 - (linkTextLen / mdLen) * 2) : 1;

  const errorHits = ERROR_PATTERNS.filter((p) => lower.includes(p)).length;
  const challengePenalty = errorHits > 0 ? 0.1 : 1;

  const isFrameworkPayload = FRAMEWORK_PAYLOAD_PATTERNS.some((p) => p.test(markdown));
  const frameworkPenalty = isFrameworkPayload ? 0.1 : 1;

  const thinPenalty = textLen < 300 ? 0.4 : textLen < 500 ? 0.7 : 1;

  const score =
    (length * 0.15 +
    textDensity * 0.25 +
    structure * 0.2 +
    boilerplate * 0.2 +
    linkDensity * 0.2) * challengePenalty * frameworkPenalty * thinPenalty;

  const clamped = Math.round(Math.min(Math.max(score, 0), 1) * 100) / 100;

  let grade;
  if (clamped >= 0.8) grade = 'A';
  else if (clamped >= 0.6) grade = 'B';
  else if (clamped >= 0.4) grade = 'C';
  else if (clamped >= 0.2) grade = 'D';
  else grade = 'F';

  return { score: clamped, grade };
}

// ─── HTML pre-processing ─────────────────────────────────────────────

const INLINE_TAGS = new Set([
  'span', 'a', 'button', 'time', 'label', 'small', 'strong', 'em', 'b', 'i',
  'code', 'abbr', 'cite', 'mark', 'sub', 'sup',
]);

/**
 * Normalize spacing in DOM before Turndown conversion.
 * Injects whitespace where CSS flexbox/grid would have provided visual separation.
 */
export function normalizeSpacing(document) {
  const allParents = document.querySelectorAll('*');
  for (const parent of allParents) {
    const children = Array.from(parent.childNodes);
    for (let i = 0; i < children.length - 1; i++) {
      const current = children[i];
      if (current.nodeType !== 1) continue;
      const currentTag = current.tagName?.toLowerCase();
      if (!INLINE_TAGS.has(currentTag)) continue;

      let nextEl = null;
      let insertBefore = null;
      for (let j = i + 1; j < children.length; j++) {
        const sib = children[j];
        if (sib.nodeType === 8) continue;
        if (sib.nodeType === 3) {
          if (sib.textContent.trim()) break;
          continue;
        }
        if (sib.nodeType === 1) {
          nextEl = sib;
          insertBefore = sib;
          break;
        }
      }

      if (nextEl) {
        const nextTag = nextEl.tagName?.toLowerCase();
        if (INLINE_TAGS.has(nextTag) || nextTag === 'div' || nextTag === 'svg') {
          const space = document.createTextNode(' ');
          parent.insertBefore(space, insertBefore);
        }
      }
    }
  }

  // Insert <hr> between repeating card-like siblings
  const CARD_PATTERNS = /\b(topic|card|item|post|entry|video|product|result|listing)\b/i;
  const containers = document.querySelectorAll('[class]');
  const processed = new Set();

  for (const container of containers) {
    if (processed.has(container)) continue;
    const children = Array.from(container.children || []);
    if (children.length < 2) continue;

    const cardChildren = children.filter((c) => {
      const cls = c.getAttribute?.('class') || '';
      return CARD_PATTERNS.test(cls);
    });

    if (cardChildren.length >= 2) {
      for (let i = 1; i < cardChildren.length; i++) {
        const hr = document.createElement('hr');
        container.insertBefore(hr, cardChildren[i]);
      }
      processed.add(container);
    }
  }

  return document;
}

// ─── Markdown post-processing ────────────────────────────────────────

export function resolveUrls(markdown, baseUrl) {
  if (!baseUrl) return markdown;
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return markdown;
  }
  return markdown.replace(/(!?\[[^\]]*\])\(([^)]+)\)/g, (match, prefix, href) => {
    const trimmed = href.trim();
    if (/^(data:|#|mailto:|tel:|javascript:)/i.test(trimmed)) return match;
    if (/^https?:\/\//i.test(trimmed)) return match;
    try {
      const resolved = new URL(trimmed, base).href;
      return `${prefix}(${resolved})`;
    } catch {
      return match;
    }
  });
}

export function cleanMarkdown(markdown) {
  return markdown
    .replace(/\[]\([^)]*\)/g, '')
    .replace(/\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\]]*\])*\])*\]\(#cite[^)]*\)/g, '')
    .replace(/\[.{0,40}?\]\(#cite[^)]*\)/g, '')
    .replace(/\[edit\]\([^)]*\)/gi, '')
    .replace(/\\?\[_*\[?(?:citation needed|better source needed|clarification needed)[^\]]*\]?\([^)]*\)_*\\?\]/gi, '')
    .replace(/\[_?\[?(?:citation needed|better source needed|clarification needed)\]?_?\]/gi, '')
    .replace(/\n#{1,3}\s*(?:References|Notes|Citations|Footnotes|Bibliography|External links|See also)\s*\n[\s\S]*$/i, '\n')
    .replace(/\n1\.\s+(?:\*{4}|\*{2}\[?\^)[\s\S]*$/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+$/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\s*\\?\[\s*\\?\]\s*$/gm, '')
    .replace(/^\s*[\[\]]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Find matching ] for [ at pos, respecting nesting */
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

/** Find matching ) for ( at pos */
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

export function convertToCitations(markdown) {
  const urlMap = new Map();
  let counter = 0;

  let body = '';
  let i = 0;
  while (i < markdown.length) {
    if (markdown[i] === '!' && markdown[i + 1] === '[') {
      const closeBracket = findMatchingBracket(markdown, i + 1);
      if (closeBracket !== -1 && markdown[closeBracket + 1] === '(') {
        const closeParen = findMatchingParen(markdown, closeBracket + 1);
        if (closeParen !== -1) {
          body += markdown.slice(i, closeParen + 1);
          i = closeParen + 1;
          continue;
        }
      }
      body += markdown[i++];
      continue;
    }

    if (markdown[i] === '[') {
      const closeBracket = findMatchingBracket(markdown, i);
      if (closeBracket !== -1 && markdown[closeBracket + 1] === '(') {
        const closeParen = findMatchingParen(markdown, closeBracket + 1);
        if (closeParen !== -1) {
          const text = markdown.slice(i + 1, closeBracket);
          const url = markdown.slice(closeBracket + 2, closeParen).trim();
          if (/^(#|mailto:|tel:|javascript:|data:)/i.test(url)) {
            body += markdown.slice(i, closeParen + 1);
          } else {
            if (!urlMap.has(url)) urlMap.set(url, ++counter);
            body += `${text} [${urlMap.get(url)}]`;
          }
          i = closeParen + 1;
          continue;
        }
      }
    }
    body += markdown[i++];
  }

  if (counter === 0) return markdown;

  const refs = Array.from(urlMap.entries())
    .map(([url, num]) => `[${num}]: ${url}`)
    .join('\n');

  return `${body.trim()}\n\nReferences:\n${refs}`;
}

export function pruneMarkdown(markdown, maxTokens) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = { heading: '', lines: [], headingLevel: 0 };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (current.lines.length > 0 || current.heading) {
        sections.push(current);
      }
      current = {
        heading: headingMatch[2],
        lines: [line],
        headingLevel: headingMatch[1].length,
      };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.heading) {
    sections.push(current);
  }

  const BOILERPLATE_HEADINGS = /^(cookie|privacy|terms|disclaimer|advertisement|related|popular|trending|sidebar|footer|nav|menu|sign.?up|log.?in|subscribe|newsletter|share|social|comment|copyright)/i;

  const scored = sections.map((section) => {
    const text = section.lines.join('\n');
    const textLen = text.replace(/[#*_\[\]()>`~\-|]/g, '').replace(/\s+/g, ' ').trim().length;

    if (BOILERPLATE_HEADINGS.test(section.heading)) return { ...section, score: 0 };

    const links = text.match(/\[[^\]]*\]\([^)]*\)/g) || [];
    const linkLen = links.reduce((s, l) => s + l.length, 0);
    const linkDensity = text.length > 0 ? linkLen / text.length : 0;
    if (linkDensity > 0.6) return { ...section, score: 0.1 };

    if (textLen < 50 && section.headingLevel >= 3) return { ...section, score: 0.2 };

    const score = Math.min(1, textLen / 200) * (1 - linkDensity * 0.5);
    return { ...section, score };
  });

  const kept = scored.filter((s) => s.score > 0.15);
  let result = kept.map((s) => s.lines.join('\n')).join('\n');

  if (result.length < markdown.length * 0.2) {
    return markdown.trim();
  }

  if (maxTokens && maxTokens > 0) {
    const tokens = countTokens(result);
    if (tokens > maxTokens) {
      const ratio = result.length / tokens;
      const maxChars = Math.floor(maxTokens * ratio * 0.95);
      result = result.slice(0, maxChars).replace(/\n[^\n]*$/, '') + '\n\n*[truncated]*';
    }
  }

  return result.trim();
}

/**
 * Strip thinking tags and code fences from LLM output.
 * Shared between tryLLMExtraction and extractSchema.
 */
export function cleanLLMOutput(text) {
  let output = text;
  if (output.includes('<think>')) {
    output = output.replace(/<think>[\s\S]*?<\/think>/g, '');
    output = output.replace(/<think>[\s\S]*$/g, '');
    output = output.trim();
  }
  if (output.startsWith('```')) {
    output = output.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return output;
}
