// Turning a file into text (3.10), in the hidden documents window: PDF with pdf.js, Word (.docx) with mammoth, tables
// included (v1 KNOWN_ISSUES #11). Only the text leaves; nothing is drawn, nothing is fetched. The legacy builds run
// the same here as in the tests' Node.
import mammoth from 'mammoth/mammoth.browser.js';
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

/** A Word document's text: its paragraphs, a table's cells each as one. */
export async function docxText(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
  return value;
}

/** Why a file gave no text: one protected by a password, or one that isn't what it says. */
export function failureOf(error: unknown): 'protected' | 'unreadable' {
  return error instanceof Error && error.name === 'PasswordException' ? 'protected' : 'unreadable';
}
