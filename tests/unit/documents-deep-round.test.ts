// The deep round over 3.6, 3.8 and 3.10 (Shahin's, 2026-11-11): documents read from files. Each part triggered again,
// widened with data points around the ones documents.test.ts reads, and every outcome given a test of its own.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import { readTargetSchema, setPrepDocSchema, type ReadTarget } from '../../src/shared/documents';
import { documentLimits } from '../../src/shared/text-limits';
import {
  clipPrepDoc,
  decodeText,
  documentName,
  fileKindOf,
  maxFileBytes,
  maxNameChars,
  normalizeText,
} from '../../src/main/documents/document-file';
import {
  DocumentReader,
  maxReplyChars,
  type DocumentsChannel,
  type ReadOutcome,
  type ReadRequest,
} from '../../src/main/documents/document-reader';
import {
  readDocumentFile,
  readRefusalText,
  refused,
  type ReadDocumentDependencies,
  type ReadRefusal,
} from '../../src/main/documents/read-document';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';
import { docxText, failureOf, pdfText } from '../../src/renderer/documents/extract';
import { docxOf, pdfOf, zipOf } from './document-fixtures';

const utf8 = (s: string) => new TextEncoder().encode(s);
const bytes = (...b: number[]) => Uint8Array.from(b);
const zip = zipOf({ 'word/document.xml': '<x/>' });

function serverCodes(node: unknown = ErrorCodes): string[] {
  if (typeof node === 'string') return [node];
  return Object.values(node as Record<string, unknown>).flatMap(serverCodes);
}

describe('what kind of file it is, widened (3.10)', () => {
  it.each<[string, string, Uint8Array, 'pdf' | 'docx' | 'text' | null]>([
    ['a PDF', 'resume.pdf', utf8('%PDF-1.7\n...'), 'pdf'],
    ['a PDF named as text', 'resume.txt', utf8('%PDF-1.4'), 'pdf'],
    ['a PDF named as Word', 'resume.docx', utf8('%PDF-1.4'), 'pdf'],
    ['a PDF with no extension', 'resume', utf8('%PDF-2.0'), 'pdf'],
    ['a PDF’s first four bytes only', 'resume.pdf', utf8('%PDF'), null],
    ['a file named PDF that is text', 'resume.pdf', utf8('Sam Rivera'), null],
    ['a Word document', 'cv.docx', zip, 'docx'],
    ['a Word document in capitals', 'CV.DOCX', zip, 'docx'],
    ['a Word document, mixed case', 'cv.Docx', zip, 'docx'],
    ['a Word document with dots in its name', 'cv.v2.final.docx', zip, 'docx'],
    ['a spreadsheet (a zip too)', 'cv.xlsx', zip, null],
    ['a presentation (a zip too)', 'cv.pptx', zip, null],
    ['a zip', 'cv.zip', zip, null],
    ['a zip named .docx.zip', 'cv.docx.zip', zip, null],
    ['a file named Word that is text', 'cv.docx', utf8('Sam Rivera'), null],
    ['an old Word document (.doc)', 'cv.doc', bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), null],
    ['an old Word document named .docx', 'cv.docx', bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), null],
    ['plain text', 'notes.txt', utf8('Go, Kafka'), 'text'],
    ['Markdown', 'notes.md', utf8('# Notes'), 'text'],
    ['plain text in capitals', 'NOTES.TXT', utf8('Go'), 'text'],
    ['Markdown, mixed case', 'notes.Md', utf8('Go'), 'text'],
    ['plain text with a byte-order mark', 'notes.txt', utf8('\uFEFFGo'), 'text'],
    ['an empty text file', 'notes.txt', new Uint8Array(0), 'text'],
    ['a hidden text file', '.txt', utf8('Go'), 'text'],
    ['text in Latin-1', 'notes.txt', bytes(0x63, 0x61, 0x66, 0xe9), null],
    ['text in UTF-16', 'notes.txt', bytes(0xff, 0xfe, 0x47, 0x00, 0x6f, 0x00), null],
    ['text with a lone surrogate', 'notes.txt', bytes(0xed, 0xa0, 0x80), null],
    ['an image named as text', 'notes.txt', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), null],
    ['text named .markdown', 'notes.markdown', utf8('Go'), null],
    ['text named .csv', 'notes.csv', utf8('a,b'), null],
    ['text named .rtf', 'notes.rtf', utf8('{\\rtf1 Go}'), null],
    ['text with no extension', 'notes', utf8('Go'), null],
    ['an empty file with no extension', 'notes', new Uint8Array(0), null],
  ])('reads %s (%s) as %s', (_, name, file, kind) => {
    expect(fileKindOf(name, file)).toBe(kind);
  });

  it.each<[string, Uint8Array, string | null]>([
    ['plain ASCII', utf8('Go'), 'Go'],
    ['a byte-order mark, dropped', utf8('\uFEFFGo'), 'Go'],
    ['nothing', new Uint8Array(0), ''],
    ['four-byte letters', utf8('Ship it 🚀'), 'Ship it 🚀'],
    ['an overlong encoding', bytes(0xc0, 0x80), null],
    ['a cut-off letter', bytes(0x63, 0xc3), null],
    ['a stray continuation byte', bytes(0x80), null],
  ])('decodes %s', (_, file, text) => {
    expect(decodeText(file)).toBe(text);
  });
});

describe('a document’s text cleaned up, widened (3.10)', () => {
  it.each<[string, string, string]>([
    ['Windows line breaks', 'a\r\nb\r\nc', 'a\nb\nc'],
    ['old Mac line breaks', 'a\rb', 'a\nb'],
    ['mixed line breaks', 'a\r\n\rb\nc', 'a\n\nb\nc'],
    // Found by this round: these were dropped, running the words either side together.
    ['a form feed between pages, as an empty line', 'page one\fpage two', 'page one\n\npage two'],
    ['form feeds around empty pages, as one empty line', 'one\f\f\ftwo', 'one\n\ntwo'],
    ['a vertical tab (Word’s line break), as a line break', 'a\u000Bb', 'a\nb'],
    ['a line separator, as a line break', 'a\u2028b', 'a\nb'],
    ['a paragraph separator, as an empty line', 'a\u2029b', 'a\n\nb'],
    ['a next-line character, as a line break', 'a\u0085b', 'a\nb'],
    ['a page break at a line’s end, its spaces trimmed', 'one   \f   two', 'one\n\n   two'],
    ['NUL and DEL', 'a\u0000b\u007Fc', 'abc'],
    ['an escape sequence’s ESC', '\u001B[1mbold', '[1mbold'],
    ['tabs, kept', 'Go\t7 years', 'Go\t7 years'],
    ['a tab at a line’s end, trimmed', 'Go\t\nKafka', 'Go\nKafka'],
    ['spaces at line ends', 'a   \nb \t \nc', 'a\nb\nc'],
    ['non-breaking spaces at a line’s end', 'a\u00A0\u00A0\nb', 'a\nb'],
    ['non-breaking spaces inside a line, kept', 'a\u00A0b', 'a\u00A0b'],
    ['spaces at a line’s start, kept', 'a\n    indented', 'a\n    indented'],
    ['two empty lines, one kept', 'a\n\n\nb', 'a\n\nb'],
    ['ten empty lines, one kept', `a${'\n'.repeat(11)}b`, 'a\n\nb'],
    ['lines of only spaces, as empty lines', 'a\n   \n \t \n   \nb', 'a\n\nb'],
    ['one empty line, kept', 'a\n\nb', 'a\n\nb'],
    ['empty lines around it', '\n\n\na\n\n\n', 'a'],
    ['spaces around it', '   a   ', 'a'],
    ['nothing but space', ' \n\t\r\n ', ''],
    ['right-to-left text', 'سلام\nשלום', 'سلام\nשלום'],
    ['combining accents, kept as they are', 'Re\u0301sume\u0301', 'Re\u0301sume\u0301'],
    ['emoji and joined emoji', '👩‍💻 Go 🚀', '👩‍💻 Go 🚀'],
  ])('handles %s', (_, text, cleaned) => {
    expect(normalizeText(text)).toBe(cleaned);
  });

  it('is the same cleaned twice', () => {
    for (const text of ['a\r\n\r\n\r\nb  ', '\u0000x\u0007\n\n\n\ny', ' lead\n\ttab \n']) {
      expect(normalizeText(normalizeText(text))).toBe(normalizeText(text));
    }
  });
});

describe('the prep doc cut as v1 cut it, widened (3.10)', () => {
  const limit = 20;
  const a = (n: number) => 'a'.repeat(n);

  it.each<[string, string, string, boolean]>([
    ['one well within the limit', 'short', 'short', false],
    ['one within the limit, trimmed', '  short  \n', 'short', false],
    ['one exactly at the limit', a(20), a(20), false],
    ['one at the limit once trimmed', `  ${a(20)}  `, a(20), false],
    ['one a character past the limit, with no line break', a(21), a(20), true],
    ['one whose last line break is exactly halfway: cut at the limit', `${a(10)}\n${a(15)}`, `${a(10)}\n${a(9)}`, true],
    ['one whose last line break is just past halfway: cut there', `${a(11)}\n${a(15)}`, a(11), true],
    ['one whose last line break is at the limit’s last place', `${a(19)}\n${a(5)}`, a(19), true],
    ['one whose line break comes right after the limit', `${a(20)}\n${a(5)}`, a(20), true],
    ['one cut at a line break, its spaces dropped', `${a(12)}   \n${a(10)}`, a(12), true],
    ['one cut where a pair of letters straddles the limit', `${a(19)}😀${a(5)}`, a(19), true],
    ['one cut where a pair of letters ends at the limit', `${a(18)}😀${a(5)}`, `${a(18)}😀`, true],
    ['nothing but space', '   \n\n  ', '', false],
  ])('keeps %s', (_, text, kept, cut) => {
    expect(clipPrepDoc(text, limit)).toEqual({ text: kept, cut });
  });

  it('at the server’s limit, never keeps more, and always keeps the start', () => {
    const lines = Array.from({ length: 4_000 }, (_, i) => `Line ${i}: ${'x'.repeat(i % 61)}`);
    for (const take of [100, 1_000, 2_500, 4_000]) {
      const whole = lines.slice(0, take).join('\n');
      const { text, cut } = clipPrepDoc(whole);
      expect(text.length).toBeLessThanOrEqual(documentLimits.prepDoc);
      expect(whole.startsWith(text)).toBe(true);
      expect(cut).toBe(whole.length > documentLimits.prepDoc);
      // Cut at a line's end: what is kept ends with a whole line.
      if (cut) expect(lines).toContain(text.split('\n').at(-1));
    }
  });

  it('cuts a doc of one long line at the server’s limit', () => {
    const { text, cut } = clipPrepDoc('x'.repeat(documentLimits.prepDoc + 5_000));
    expect([text.length, cut]).toEqual([documentLimits.prepDoc, true]);
  });
});

describe('a document named by its file, widened (3.10)', () => {
  it.each<[string, string]>([
    ['C:\\Users\\sam\\Documents\\CV.pdf', 'CV.pdf'],
    ['/home/sam/cv.pdf', 'cv.pdf'],
    ['C:/Users/sam\\mixed/cv.docx', 'cv.docx'],
    ['\\\\server\\share\\cv.pdf', 'cv.pdf'],
    ['cv.pdf', 'cv.pdf'],
    ['C:\\Users\\sam\\', ''],
    ['', ''],
    ['C:\\Users\\sam\\Résumé – Sam Rivera (2026).pdf', 'Résumé – Sam Rivera (2026).pdf'],
    ['C:\\x\\' + 'n'.repeat(250) + '.pdf', 'n'.repeat(maxNameChars)],
    ['C:\\x\\' + 'n'.repeat(199) + '😀.pdf', 'n'.repeat(199)],
    ['C:\\x\\' + 'n'.repeat(198) + '😀.pdf', 'n'.repeat(198) + '😀'],
  ])('names %j as %j', (path, name) => {
    expect(documentName(path)).toBe(name);
    expect(documentName(path).length).toBeLessThanOrEqual(maxNameChars);
  });
});

describe('reading a document from a file, every outcome (3.10)', () => {
  function deps(file: Uint8Array, over: Partial<ReadDocumentDependencies> & { read?: ReadOutcome } = {}) {
    const reader = { read: vi.fn(async () => over.read ?? ({ ok: true, text: 'From the reader.' } as ReadOutcome)) };
    const readFile = vi.fn(async () => file);
    return { size: async () => file.length, readFile, reader, ...over };
  }
  const targets: ReadTarget[] = ['name', 'resume', 'jobDescription', 'notes', 'prepDoc'];

  it.each(targets)('reads plain text into the %s, cleaned, named by its file', async (target) => {
    const result = await readDocumentFile(
      'C:\\docs\\notes.txt',
      target,
      deps(utf8('\uFEFF  Go\r\nKafka  \r\n\r\n\r\n')),
    );
    expect(result).toEqual({ ok: true, text: 'Go\nKafka', name: 'notes.txt', cut: false });
  });

  it.each<[string, Uint8Array, 'pdf' | 'docx']>([
    ['cv.pdf', utf8('%PDF-1.7'), 'pdf'],
    ['cv.docx', zip, 'docx'],
  ])('sends %s to the documents window as %s, with its bytes', async (name, file, kind) => {
    const d = deps(file);
    expect(await readDocumentFile(name, 'resume', d)).toMatchObject({ ok: true, text: 'From the reader.' });
    expect(d.reader.read).toHaveBeenCalledWith(kind, file);
  });

  it('reads a file of exactly 20 MB, and refuses one a byte larger before reading it', async () => {
    const atLimit = deps(utf8('Go'), { size: async () => maxFileBytes });
    expect(await readDocumentFile('cv.txt', 'resume', atLimit)).toMatchObject({ ok: true });
    const over = deps(utf8('Go'), { size: async () => maxFileBytes + 1 });
    expect(await readDocumentFile('cv.txt', 'resume', over)).toEqual(refused('too_big'));
    expect(over.readFile).not.toHaveBeenCalled();
  });

  it('refuses a file that grew past 20 MB between its size and its read', async () => {
    const grown = new Uint8Array(maxFileBytes + 1);
    expect(await readDocumentFile('cv.txt', 'resume', deps(grown, { size: async () => 10 }))).toEqual(
      refused('too_big'),
    );
  });

  it.each<[string, Partial<ReadDocumentDependencies>]>([
    ['a size that cannot be had', { size: async () => Promise.reject(new Error('ENOENT')) }],
    ['a file that cannot be read', { readFile: async () => Promise.reject(new Error('EBUSY')) }],
  ])('says it could not open the file for %s', async (_, over) => {
    expect(await readDocumentFile('cv.txt', 'resume', deps(utf8('Go'), over))).toEqual(refused('failed'));
  });

  it.each(['photo.png', 'cv.doc', 'cv.rtf', 'cv.odt', 'notes'])(
    'refuses %s, a kind it does not read, unread',
    async (name) => {
      const d = deps(utf8('Go'));
      expect(await readDocumentFile(name, 'resume', d)).toEqual(refused('unsupported'));
      expect(d.reader.read).not.toHaveBeenCalled();
    },
  );

  it.each(['unreadable', 'protected', 'empty', 'timeout'] as const)(
    'passes on what the documents window says of a file it could not read (%s)',
    async (failure) => {
      const d = deps(utf8('%PDF-1.7'), { read: { ok: false, failure } });
      expect(await readDocumentFile('cv.pdf', 'resume', d)).toEqual(refused(failure));
    },
  );

  it.each<[string, Uint8Array, ReadOutcome | undefined]>([
    ['a text file of spaces and line breaks', utf8(' \r\n\t \r\n'), undefined],
    ['an empty text file', new Uint8Array(0), undefined],
    ['a PDF whose text is only control characters', utf8('%PDF-1.7'), { ok: true, text: '\u0000\u0007\f' }],
  ])('says %s has no text', async (_, file, read) => {
    const name = read ? 'cv.pdf' : 'cv.txt';
    expect(await readDocumentFile(name, 'resume', deps(file, { read }))).toEqual(refused('empty'));
  });

  it.each(targets.filter((t) => t !== 'prepDoc'))(
    'brings the %s back whole however long, for the user to shorten',
    async (target) => {
      const long = 'word '.repeat(60_000).trim();
      const result = await readDocumentFile('cv.txt', target, deps(utf8(long)));
      expect(result).toEqual({ ok: true, text: long, name: 'cv.txt', cut: false });
    },
  );

  it('cuts only the prep doc past its limit, and says so', async () => {
    const lines = Array.from({ length: 30_000 }, (_, i) => `Line ${i}`).join('\n');
    const result = await readDocumentFile('guide.md', 'prepDoc', deps(utf8(lines)));
    expect(result.ok && result.cut).toBe(true);
    expect(result.ok && result.text.length).toBeLessThanOrEqual(documentLimits.prepDoc);
    const short = await readDocumentFile('guide.md', 'prepDoc', deps(utf8('Line 1\nLine 2')));
    expect(short).toEqual({ ok: true, text: 'Line 1\nLine 2', name: 'guide.md', cut: false });
  });

  it('words every refusal, under a code of its own that is never one of the server’s', () => {
    const reasons: ReadRefusal[] = ['too_big', 'unsupported', 'unreadable', 'protected', 'empty', 'timeout', 'failed'];
    expect(Object.keys(readRefusalText).sort()).toEqual([...reasons].sort());
    const codes = reasons.map((why) => (refused(why) as { code: string }).code);
    expect(new Set(codes).size).toBe(reasons.length);
    for (const why of reasons) {
      const result = refused(why);
      expect(result).toEqual({ ok: false, code: `read_${why}`, message: readRefusalText[why] });
      expect(serverCodes()).not.toContain(`read_${why}`);
      // Each says what to do next.
      expect(readRefusalText[why]).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe('the documents window, as main talks to it, widened (3.10)', () => {
  class Channel implements DocumentsChannel {
    readonly posted: ReadRequest[] = [];
    closed = 0;
    private listener: (message: unknown) => void = () => {};
    private gone: () => void = () => {};
    post(request: ReadRequest): void {
      this.posted.push(request);
    }
    onMessage(listener: (message: unknown) => void): void {
      this.listener = listener;
    }
    onGone(listener: () => void): void {
      this.gone = listener;
    }
    close(): void {
      this.closed += 1;
    }
    reply(message: unknown): void {
      this.listener(message);
    }
    crash(): void {
      this.gone();
    }
  }

  let channels: Channel[];
  let reader: DocumentReader;
  const file = utf8('%PDF-1.7');

  beforeEach(() => {
    vi.useFakeTimers();
    channels = [];
    reader = new DocumentReader(() => {
      const channel = new Channel();
      channels.push(channel);
      return channel;
    }, 1_000);
  });

  afterEach(() => vi.useRealTimers());

  it('answers reads made together, each by its own id, in whatever order the window answers', async () => {
    const first = reader.read('pdf', file);
    const second = reader.read('docx', file);
    const third = reader.read('pdf', file);
    expect(channels).toHaveLength(1);
    const [a, b, c] = channels[0]!.posted;
    channels[0]!.reply({ id: c!.id, ok: true, text: 'third' });
    channels[0]!.reply({ id: a!.id, ok: false, reason: 'protected' });
    channels[0]!.reply({ id: b!.id, ok: true, text: 'second' });
    expect(await Promise.all([first, second, third])).toEqual([
      { ok: false, failure: 'protected' },
      { ok: true, text: 'second' },
      { ok: true, text: 'third' },
    ]);
    expect(new Set([a!.id, b!.id, c!.id]).size).toBe(3);
  });

  it.each<[string, (id: string) => unknown]>([
    ['nothing', () => null],
    ['a string', () => 'text'],
    ['no id', () => ({ ok: true, text: 'x' })],
    ['an id that is a number', () => ({ id: 1, ok: true, text: 'x' })],
    ['another read’s id', () => ({ id: 'not-waiting', ok: true, text: 'x' })],
    ['text with a failure', (id) => ({ id, ok: true, reason: 'empty' })],
    ['a failure with text', (id) => ({ id, ok: false, text: 'x' })],
    ['a failure the window may not claim (timeout)', (id) => ({ id, ok: false, reason: 'timeout' })],
    ['a failure it has no word for', (id) => ({ id, ok: false, reason: 'crashed' })],
    ['an extra field', (id) => ({ id, ok: true, text: 'x', html: '<b>x</b>' })],
    ['text past the most a reply may carry', (id) => ({ id, ok: true, text: 'x'.repeat(maxReplyChars + 1) })],
    ['text that is not text', (id) => ({ id, ok: true, text: 42 })],
  ])('ignores a reply of %s, and still takes the real one', async (_, reply) => {
    const read = reader.read('pdf', file);
    const id = channels[0]!.posted[0]!.id;
    channels[0]!.reply(reply(id));
    channels[0]!.reply({ id, ok: true, text: 'real' });
    expect(await read).toEqual({ ok: true, text: 'real' });
  });

  it('takes text of exactly the most a reply may carry', async () => {
    const read = reader.read('pdf', file);
    channels[0]!.reply({ id: channels[0]!.posted[0]!.id, ok: true, text: 'x'.repeat(maxReplyChars) });
    expect((await read).ok).toBe(true);
  });

  it('takes only the first answer to a read', async () => {
    const read = reader.read('pdf', file);
    const id = channels[0]!.posted[0]!.id;
    channels[0]!.reply({ id, ok: true, text: 'first' });
    channels[0]!.reply({ id, ok: false, reason: 'unreadable' });
    expect(await read).toEqual({ ok: true, text: 'first' });
  });

  it('gives up every read waiting when one takes too long, and the window with them', async () => {
    const reads = [reader.read('pdf', file), reader.read('docx', file)];
    vi.advanceTimersByTime(1_000);
    expect(await Promise.all(reads)).toEqual([
      { ok: false, failure: 'timeout' },
      { ok: false, failure: 'timeout' },
    ]);
    expect(channels[0]!.closed).toBe(1);
    // A late answer from the window that went changes nothing.
    channels[0]!.reply({ id: channels[0]!.posted[1]!.id, ok: true, text: 'late' });
  });

  it('keeps a read alive until just before its time is up', async () => {
    const read = reader.read('pdf', file);
    vi.advanceTimersByTime(999);
    channels[0]!.reply({ id: channels[0]!.posted[0]!.id, ok: true, text: 'in time' });
    expect(await read).toEqual({ ok: true, text: 'in time' });
    vi.advanceTimersByTime(10_000);
    expect(channels[0]!.closed).toBe(0);
  });

  it('opens a fresh window after one went down, and ignores the old one going down again', async () => {
    const first = reader.read('pdf', file);
    channels[0]!.crash();
    expect(await first).toEqual({ ok: false, failure: 'unreadable' });
    const second = reader.read('pdf', file);
    expect(channels).toHaveLength(2);
    // The old window's death reported late must not fail the new window's read.
    channels[0]!.crash();
    channels[1]!.reply({ id: channels[1]!.posted[0]!.id, ok: true, text: 'fresh' });
    expect(await second).toEqual({ ok: true, text: 'fresh' });
  });

  it('closes nothing when nothing is open, and fails the reads waiting when quitting', async () => {
    reader.close();
    expect(channels).toHaveLength(0);
    const read = reader.read('docx', file);
    reader.close();
    expect(await read).toEqual({ ok: false, failure: 'unreadable' });
    expect(channels[0]!.closed).toBe(1);
    reader.close();
    expect(channels[0]!.closed).toBe(1);
  });

  it('keeps one window for read after read', async () => {
    for (let i = 0; i < 5; i++) {
      const read = reader.read('pdf', file);
      channels[0]!.reply({ id: channels[0]!.posted[i]!.id, ok: true, text: `read ${i}` });
      expect(await read).toEqual({ ok: true, text: `read ${i}` });
    }
    expect(channels).toHaveLength(1);
  });
});

describe('a file’s text in the documents window, widened (3.10: pdf.js and mammoth)', () => {
  it('reads a PDF with an empty page between, as its pages', async () => {
    const text = await pdfText(pdfOf([['First page'], [], ['Third page', 'and a line']]));
    expect(normalizeText(text)).toBe('First page\n\nThird page\nand a line');
  });

  it('reads a PDF of many lines on one page, each on its own line', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`);
    expect(normalizeText(await pdfText(pdfOf([lines])))).toBe(lines.join('\n'));
  });

  it('reads a PDF with no text at all as nothing', async () => {
    expect(normalizeText(await pdfText(pdfOf([[], []])))).toBe('');
  });

  it('reads a Word document with no paragraphs as nothing', async () => {
    expect(normalizeText(await docxText(docxOf([])))).toBe('');
  });

  it('reads a Word document’s letters and signs as they are', async () => {
    const text = await docxText(docxOf(['Résumé — naïve café', 'C# & C++ < Go > "quotes"']));
    expect(normalizeText(text)).toBe('Résumé — naïve café\nC# & C++ < Go > "quotes"');
  });

  it.each<[string, unknown, 'protected' | 'unreadable']>([
    ['a password error', Object.assign(new Error('Need a password'), { name: 'PasswordException' }), 'protected'],
    ['a damaged PDF', Object.assign(new Error('Invalid PDF'), { name: 'InvalidPDFException' }), 'unreadable'],
    ['any other error', new TypeError('x is undefined'), 'unreadable'],
    ['a password error that is no Error', { name: 'PasswordException' }, 'unreadable'],
    ['nothing', undefined, 'unreadable'],
    ['a string', 'PasswordException', 'unreadable'],
  ])('words %s as %s', (_, error, failure) => {
    expect(failureOf(error)).toBe(failure);
  });
});

describe('the prep doc kept on this computer, widened (3.10)', () => {
  const nov11 = Date.UTC(2026, 10, 11, 12);
  let clock = nov11;
  const local = () => new LocalStore(openDatabase(null, null, migrations), () => clock);

  it('keeps one prep doc at a time: each save replaces the last, with its own name, flag and time', () => {
    const store = local();
    store.setPrepDoc({ text: 'First', name: 'one.pdf', cut: true });
    clock += 60_000;
    store.setPrepDoc({ text: 'Second', name: 'two.md', cut: false });
    expect(store.prepDoc()).toEqual({ name: 'two.md', text: 'Second', cut: false, savedAt: clock });
    clock += 60_000;
    store.setPrepDoc({ text: 'Third', name: '', cut: true });
    expect(store.prepDoc()).toEqual({ name: '', text: 'Third', cut: true, savedAt: clock });
    store.setPrepDoc({ text: '', name: 'ignored.pdf', cut: true });
    expect(store.prepDoc()).toBeNull();
    expect(store.documents().prepDoc).toBeNull();
  });

  it('keeps a prep doc of exactly the server’s limit whole', () => {
    const store = local();
    const text = 'x'.repeat(documentLimits.prepDoc);
    store.setPrepDoc({ text, name: 'guide.md', cut: false });
    expect(store.prepDoc()!.text).toBe(text);
  });

  it.each<[unknown, boolean]>([
    [{ text: 'x', name: 'a.pdf', cut: false }, true],
    [{ text: 'x'.repeat(documentLimits.prepDoc), name: 'a.pdf', cut: true }, true],
    [{ text: 'x'.repeat(documentLimits.prepDoc + 1), name: 'a.pdf', cut: true }, false],
    [{ text: '', name: '', cut: false }, true],
    [{ text: 'x', name: `  ${'n'.repeat(200)}  `, cut: false }, true],
    [{ text: 'x', name: 'n'.repeat(201), cut: false }, false],
    [{ text: 'x', name: 'a.pdf' }, false],
    [{ text: 'x', name: 'a.pdf', cut: 'yes' }, false],
    [{ text: 'x', name: 'a.pdf', cut: false, path: 'C:\\a.pdf' }, false],
    [{ text: 1, name: 'a.pdf', cut: false }, false],
  ])('takes %j from the app window as a prep doc: %s', (payload, valid) => {
    expect(setPrepDocSchema.safeParse(payload).success).toBe(valid);
  });

  it.each<[unknown, boolean]>([
    ['resume', true],
    ['jobDescription', true],
    ['notes', true],
    ['name', true],
    ['prepDoc', true],
    ['prepdoc', false],
    ['instructions', false],
    ['', false],
    [null, false],
    [['resume'], false],
  ])('reads a file into %j: %s', (target, valid) => {
    expect(readTargetSchema.safeParse(target).success).toBe(valid);
  });
});
