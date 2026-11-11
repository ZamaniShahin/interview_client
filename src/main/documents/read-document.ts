// Reading a document from a file the user picked (3.10): the file checked (its size, then its kind from its first
// bytes), read into text (plain text here, PDF and Word in the documents window), cleaned up, and for the prep doc cut
// to the server's limit as v1 cut it. Any other document over its limit comes back whole, for the user to shorten.
import type { ReadDocumentResult, ReadTarget } from '../../shared/documents';
import { clipPrepDoc, decodeText, documentName, fileKindOf, maxFileBytes, normalizeText } from './document-file';
import type { ReadFailure, ReadOutcome, ReadRequest } from './document-reader';

export interface ReadDocumentDependencies {
  size(path: string): Promise<number>;
  readFile(path: string): Promise<Uint8Array>;
  /** The documents window, which reads PDF and Word files. */
  reader: { read(kind: ReadRequest['kind'], bytes: Uint8Array): Promise<ReadOutcome> };
}

/** Why a file gave no document, as the app window says it; a client code each, never one of the server's. */
export type ReadRefusal = ReadFailure | 'too_big' | 'unsupported' | 'failed';

export const readRefusalText: Record<ReadRefusal, string> = {
  too_big: 'That file is over 20 MB. Save the part you need as a smaller file, or paste its text.',
  unsupported: 'Sotto reads PDF and Word (.docx) files, and plain text. Save it as one of those, or paste its text.',
  unreadable: "Couldn't read that file. It may be damaged: save it again, or paste its text.",
  protected: 'That file is protected by a password. Save a copy without one, or paste its text.',
  empty: 'That file has no text to read. A scanned PDF is a picture of text: paste the text instead.',
  timeout: 'Reading that file took too long. Try a smaller one, or paste its text.',
  failed: "Couldn't open that file. Check that it is still there, then try again.",
};

export function refused(why: ReadRefusal): ReadDocumentResult {
  return { ok: false, code: `read_${why}`, message: readRefusalText[why] };
}

export async function readDocumentFile(
  path: string,
  target: ReadTarget,
  deps: ReadDocumentDependencies,
): Promise<ReadDocumentResult> {
  const name = documentName(path);
  let bytes: Uint8Array;
  try {
    // Refused before it is read: a file far past any document's size isn't loaded at all.
    if ((await deps.size(path)) > maxFileBytes) return refused('too_big');
    bytes = await deps.readFile(path);
  } catch {
    return refused('failed');
  }
  if (bytes.length > maxFileBytes) return refused('too_big');

  const kind = fileKindOf(name, bytes);
  if (!kind) return refused('unsupported');
  let text: string;
  if (kind === 'text') {
    text = decodeText(bytes) ?? '';
  } else {
    const read = await deps.reader.read(kind, bytes);
    if (!read.ok) return refused(read.failure);
    text = read.text;
  }

  text = normalizeText(text);
  if (!text) return refused('empty');
  if (target !== 'prepDoc') return { ok: true, text, name, cut: false };
  const clipped = clipPrepDoc(text);
  return { ok: true, text: clipped.text, name, cut: clipped.cut };
}
