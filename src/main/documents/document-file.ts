// A file to read as a document (3.10): what kind it is, told from its first bytes (a name alone is never trusted), its
// text when it is plain text, the text cleaned up as any document's, and the prep doc cut to the server's limit as v1
// cut it. Pure, so the tests read it without files.
import { documentLimits } from '../../shared/text-limits';

/** A file past this is refused before anything reads it: a résumé or a study guide is far smaller. */
export const maxFileBytes = 20 * 1024 * 1024;

/** The longest a document's name is kept: the server's limit for the prep doc's. */
export const maxNameChars = 200;

export type FileKind = 'pdf' | 'docx' | 'text';

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((b, i) => bytes[i] === b);

/**
 * What a file is: a PDF and a Word document (.docx, a zip) by their first bytes, plain text (.txt, .md) by its name and
 * a clean UTF-8 reading. Null for anything else: an old .doc, an image, a file named for what it isn't.
 */
export function fileKindOf(name: string, bytes: Uint8Array): FileKind | null {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return extension === 'docx' ? 'docx' : null;
  if ((extension === 'txt' || extension === 'md') && decodeText(bytes) !== null) return 'text';
  return null;
}

/** A UTF-8 file's text, its byte-order mark dropped; null when it isn't UTF-8. */
export function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * A document's text as it is kept: line breaks as \n, no control characters but tabs, no spaces at a line's end, no
 * more than one empty line in a row, nothing around it.
 */
export function normalizeText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex -- the control characters a file may carry are exactly what goes
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** The first `length` characters, one fewer rather than half of a surrogate pair. */
function prefix(text: string, length: number): string {
  if (length >= text.length) return text;
  const end = length > 0 && /[\uD800-\uDBFF]/.test(text[length - 1]!) ? length - 1 : length;
  return text.slice(0, end);
}

/**
 * v1's `clip_prep_doc`: within the limit a prep doc is kept as it is; past it, it is cut at the last line break before
 * the limit when one comes past halfway (not mid-line), and the server tells the model it has only the start.
 */
export function clipPrepDoc(text: string, limit: number = documentLimits.prepDoc): { text: string; cut: boolean } {
  const whole = text.trim();
  if (whole.length <= limit) return { text: whole, cut: false };
  let head = prefix(whole, limit);
  const lineEnd = head.lastIndexOf('\n');
  if (lineEnd > Math.floor(limit / 2)) head = head.slice(0, lineEnd);
  return { text: head.trimEnd(), cut: true };
}

/** The name a document is kept under: the file's own, without its folder, at most 200 characters. */
export function documentName(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? '';
  return prefix(name, maxNameChars);
}
