/**
 * Document format conversion: PDF, DOCX, XLSX/XLS, CSV → Markdown.
 */
import { parseHTML } from 'linkedom';
import { extractText as extractPdfText } from 'unpdf';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { turndown, normalizeSpacing, cleanMarkdown, countTokens, scoreMarkdown } from './markdown.mjs';

export const DOCUMENT_FORMATS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'text/csv': 'csv',
};

export function detectFormatByExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.pdf')) return 'pdf';
    if (pathname.endsWith('.docx')) return 'docx';
    if (pathname.endsWith('.xlsx') || pathname.endsWith('.xls')) return 'xlsx';
    if (pathname.endsWith('.csv')) return 'csv';
  } catch { /* ignore */ }
  return null;
}

const MAX_SHEET_ROWS = 1000;

async function pdfToMarkdown(buffer) {
  const pdfPromise = extractPdfText(new Uint8Array(buffer));
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('PDF extraction timed out')), 30000);
  });
  let text, totalPages;
  try {
    ({ text, totalPages } = await Promise.race([pdfPromise, timeout]));
  } finally {
    clearTimeout(timer);
  }
  const joined = Array.isArray(text) ? text.join('\n') : (text ?? '');
  const trimmed = joined.trim();
  if (!trimmed || trimmed.length < 20) {
    throw new Error('PDF contains no extractable text (possibly scanned/image-based)');
  }

  const markdown = `**Pages:** ${totalPages}\n\n---\n\n${trimmed}`;
  const tokens = countTokens(markdown);
  const quality = scoreMarkdown(markdown);

  return {
    title: 'PDF Document',
    markdown,
    tokens,
    readability: false,
    excerpt: '',
    byline: '',
    siteName: '',
    htmlLength: buffer.length,
    method: 'pdf',
    quality,
  };
}

async function docxToMarkdown(buffer) {
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value || '';
  if (html.length < 50) {
    throw new Error('DOCX contains no extractable content');
  }

  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  normalizeSpacing(document);
  const markdown = cleanMarkdown(turndown.turndown(document.body.innerHTML));

  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1] || 'Document';

  const tokens = countTokens(markdown);
  const quality = scoreMarkdown(markdown);

  return {
    title,
    markdown,
    tokens,
    readability: false,
    excerpt: '',
    byline: '',
    siteName: '',
    htmlLength: buffer.length,
    method: 'docx',
    quality,
  };
}

function spreadsheetToMarkdown(buffer, format) {
  const opts = {
    type: 'buffer',
    sheetRows: MAX_SHEET_ROWS + 1,
    ...(format === 'csv' ? { raw: true } : {}),
  };
  const workbook = XLSX.read(buffer, opts);
  const parts = [];

  const sanitizeCell = (val) =>
    String(val ?? '')
      .replace(/\|/g, '\\|')
      .replace(/[<>]/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (!data.length) continue;

    if (workbook.SheetNames.length > 1) {
      const safeName = name.replace(/[<>\[\]()#*`_~|\\]/g, '').trim() || 'Sheet';
      parts.push(`## ${safeName}`);
    }

    const headers = (data[0] || []).map((h) => sanitizeCell(h));
    if (!headers.length) continue;

    parts.push('| ' + headers.join(' | ') + ' |');
    parts.push('| ' + headers.map(() => '---').join(' | ') + ' |');

    const rowCount = Math.min(data.length, MAX_SHEET_ROWS + 1);
    for (let i = 1; i < rowCount; i++) {
      const row = (data[i] || []).map((c) => sanitizeCell(c));
      while (row.length < headers.length) row.push('');
      parts.push('| ' + row.join(' | ') + ' |');
    }

    if (data.length > MAX_SHEET_ROWS + 1) {
      parts.push(`\n*... truncated at ${MAX_SHEET_ROWS} rows*`);
    }
    parts.push('');
  }

  const markdown = parts.join('\n').trim();
  if (!markdown || markdown.length < 10) {
    throw new Error('Spreadsheet contains no data');
  }

  const tokens = countTokens(markdown);
  const quality = scoreMarkdown(markdown);
  const title = workbook.SheetNames[0] || 'Spreadsheet';

  return {
    title,
    markdown,
    tokens,
    readability: false,
    excerpt: '',
    byline: '',
    siteName: '',
    htmlLength: buffer.length,
    method: format === 'csv' ? 'csv' : 'xlsx',
    quality,
  };
}

export async function convertDocument(buffer, format) {
  switch (format) {
    case 'pdf':
      return pdfToMarkdown(buffer);
    case 'docx':
      return docxToMarkdown(buffer);
    case 'xlsx':
    case 'csv':
      return spreadsheetToMarkdown(buffer, format);
    default:
      throw new Error(`Unsupported document format: ${format}`);
  }
}
