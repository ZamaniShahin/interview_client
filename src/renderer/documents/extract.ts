// Turning a file into text (3.10), in the hidden documents window: PDF with pdf.js, Word (.docx) with mammoth, tables
// included (v1 KNOWN_ISSUES #11) and read as v1 reads them. Only the text leaves; nothing is drawn, nothing is fetched.
// The legacy builds run the same here as in the tests' Node.
import mammoth, { type MammothElement } from 'mammoth/mammoth.browser.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// pdf.js does its work in this page's own thread: the page is sandboxed already, and no worker file is loaded.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorker;

/** Pages read at most: a document past them is a book, and its start is what an interview needs. */
export const maxPdfPages = 500;

/** A PDF's text, page by page, a line break where the PDF ends a line. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({
    // A copy: pdf.js may take the buffer it is given.
    data: bytes.slice(),
    // No font is loaded, no form is drawn, nothing is fetched; errors only in the log.
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    enableXfa: false,
    verbosity: 0,
  });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(document.numPages, maxPdfPages); n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join(''));
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await task.destroy();
  }
}

/**
 * A Word document's text as v1 reads it (its `context_store._extract_docx`, 2026-11-14): paragraphs and tables in
 * document order, a line each paragraph, and a table a line each row, its cells joined by " | ". A cell's text is
 * trimmed, an empty cell left out, and a cell beside one with the same text kept once, which is how v1 keeps a cell
 * merged across columns once (python-docx lists it once per column it spans). A cell merged down goes on each row it
 * spans, as python-docx lists it there too. Beyond v1: a table inside a cell, which v1 drops, keeps its rows as lines of
 * the cell, and a line break inside a paragraph stays a line break; nothing written is lost.
 */
export async function docxText(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const read: { document?: MammothElement } = {};
  await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      transformDocument: (document) => {
        read.document = document;
        return document;
      },
    },
  );
  if (!read.document) throw new Error('mammoth read no document');
  return blockLines(read.document.children ?? [])
    .join('\n')
    .trim();
}

/** The lines of a run of paragraphs and tables, in order. */
function blockLines(elements: readonly MammothElement[]): string[] {
  const lines: string[] = [];
  for (const element of elements) {
    if (element.type === 'paragraph') lines.push(inlineText(element));
    else if (element.type === 'table') lines.push(...tableLines(element));
    else if (element.children) lines.push(...blockLines(element.children));
  }
  return lines;
}

/** A paragraph's text, as python-docx's `paragraph.text` reads it: its runs and links, tabs and breaks included. */
function inlineText(element: MammothElement): string {
  switch (element.type) {
    case 'text':
      return element.value ?? '';
    case 'tab':
      return '\t';
    case 'break':
      return '\n';
    default:
      return (element.children ?? []).map(inlineText).join('');
  }
}

/** A table's lines, v1's way: a line each row, its cells joined by " | ". */
function tableLines(table: MammothElement): string[] {
  const lines: string[] = [];
  // The cells merged down from a row above, by the grid column they cover, and how many rows more they cover.
  const mergedDown = new Map<number, { text: string; rows: number }>();
  for (const row of table.children ?? []) {
    if (row.type !== 'tableRow') continue;
    const cells: string[] = [];
    let column = 0;
    const put = (text: string) => {
      if (text.length > 0 && cells.at(-1) !== text) cells.push(text);
    };
    const putMergedDown = () => {
      for (let above = mergedDown.get(column); above; above = mergedDown.get(column)) {
        put(above.text);
        if (--above.rows === 0) mergedDown.delete(column);
        column++;
      }
    };
    for (const cell of row.children ?? []) {
      if (cell.type !== 'tableCell') continue;
      putMergedDown();
      const text = blockLines(cell.children ?? [])
        .join('\n')
        .trim();
      const columns = Math.max(1, cell.colSpan ?? 1);
      const rowsBelow = Math.max(1, cell.rowSpan ?? 1) - 1;
      for (let i = 0; i < columns; i++) {
        put(text);
        if (rowsBelow > 0) mergedDown.set(column + i, { text, rows: rowsBelow });
      }
      column += columns;
    }
    putMergedDown();
    if (cells.length > 0) lines.push(cells.join(' | '));
  }
  return lines;
}

/** Why a file gave no text: one protected by a password, or one that isn't what it says. */
export function failureOf(error: unknown): 'protected' | 'unreadable' {
  return error instanceof Error && error.name === 'PasswordException' ? 'protected' : 'unreadable';
}
