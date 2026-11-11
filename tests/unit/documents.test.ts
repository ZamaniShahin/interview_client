import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clipPrepDoc,
  decodeText,
  documentName,
  fileKindOf,
  maxFileBytes,
  normalizeText,
} from '../../src/main/documents/document-file';
import { DocumentReader, type DocumentsChannel, type ReadRequest } from '../../src/main/documents/document-reader';
import {
  readDocumentFile,
  readRefusalText,
  type ReadDocumentDependencies,
} from '../../src/main/documents/read-document';
import { docxText, failureOf, maxPdfPages, pdfText } from '../../src/renderer/documents/extract';
import { readTargetSchema, setPrepDocSchema } from '../../src/shared/documents';
import { docxOf, pdfOf, zipOf } from './document-fixtures';

const text = (s: string) => new TextEncoder().encode(s);

describe('what kind of file it is (3.10): its first bytes, never its name alone', () => {
  it.each([
    ['resume.pdf', pdfOf([['Hi']]), 'pdf'],
    ['RESUME.PDF', pdfOf([['Hi']]), 'pdf'],
    ['named-wrong.docx', pdfOf([['Hi']]), 'pdf'],
    ['cv.docx', docxOf(['Hi']), 'docx'],
    ['notes.txt', text('Plain words.'), 'text'],
    ['notes.md', text('# Heading'), 'text'],
  ])('reads %s as %s', (name, bytes, kind) => {
    expect(fileKindOf(name, bytes)).toBe(kind);
  });

  it.each([
    ['a zip that is no .docx', 'archive.zip', zipOf({ 'a.txt': 'x' })],
    ['a .docx that is no zip', 'cv.docx', text('just text')],
    ['an old Word file', 'cv.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['an image', 'photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
    ['text that is no UTF-8', 'notes.txt', new Uint8Array([0x48, 0xff, 0xfe, 0x00])],
    ['text under another name', 'notes.rtf', text('{\\rtf1 Hi}')],
    ['nothing', 'empty.txt', new Uint8Array()],
  ])('refuses %s', (_what, name, bytes) => {
    // An empty .txt decodes as text; it is refused as empty once read, not here.
    if (name === 'empty.txt') expect(fileKindOf(name, bytes)).toBe('text');
    else expect(fileKindOf(name, bytes)).toBeNull();
  });

  it('decodes UTF-8 without its byte-order mark, and nothing else', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...text('Résumé')]))).toBe('Résumé');
    expect(decodeText(new Uint8Array([0xc3, 0x28]))).toBeNull();
  });
});

describe("a document's text, cleaned up (3.10)", () => {
  it('keeps \\n line breaks, no spaces at line ends, at most one empty line, nothing around it', () => {
    expect(normalizeText('  Title  \r\nLine one   \rLine two\n\n\n\n\nEnd\t \n\n')).toBe(
      'Title\nLine one\nLine two\n\nEnd',
    );
  });

  it('drops control characters but tabs', () => {
    expect(normalizeText('A\u0000B\u0007C\tD\u001fE\u007fF')).toBe('ABC\tDEF');
  });

  it('keeps every letter and emoji as it is', () => {
    expect(normalizeText('Résumé, 履歴書, 🙂')).toBe('Résumé, 履歴書, 🙂');
  });
});

describe('the prep doc cut as v1 cut it (clip_prep_doc, 3.10)', () => {
  it('keeps one within the limit as it is, trimmed', () => {
    expect(clipPrepDoc('  short  ', 100)).toEqual({ text: 'short', cut: false });
    expect(clipPrepDoc('x'.repeat(100), 100)).toEqual({ text: 'x'.repeat(100), cut: false });
  });

  it('cuts one past the limit at the last line break past halfway', () => {
    const doc = `${'a'.repeat(60)}\n${'b'.repeat(30)}\n${'c'.repeat(50)}`;
    expect(clipPrepDoc(doc, 100)).toEqual({ text: `${'a'.repeat(60)}\n${'b'.repeat(30)}`, cut: true });
  });

  it('cuts at the limit itself when the last line break comes before halfway, never mid-pair', () => {
    expect(clipPrepDoc(`${'a'.repeat(10)}\n${'b'.repeat(200)}`, 100)).toEqual({
      text: `${'a'.repeat(10)}\n${'b'.repeat(89)}`,
      cut: true,
    });
    const emoji = `${'x'.repeat(99)}🙂${'y'.repeat(10)}`;
    expect(clipPrepDoc(emoji, 100)).toEqual({ text: 'x'.repeat(99), cut: true });
  });

  it('never leaves more than 100,000 characters, whatever the lines', () => {
    for (const line of [1, 7, 99, 1_000, 49_999, 50_001, 120_000]) {
      const doc = Array.from({ length: Math.ceil(250_000 / (line + 1)) }, () => 'z'.repeat(line)).join('\n');
      const clipped = clipPrepDoc(doc);
      expect(clipped.cut).toBe(true);
      expect(clipped.text.length).toBeLessThanOrEqual(100_000);
      expect(clipped.text.length).toBeGreaterThan(50_000);
    }
  });

  it('names a document by its file, without its folder, at most 200 characters', () => {
    expect(documentName('C:\\Users\\Sam\\Documents\\resume.pdf')).toBe('resume.pdf');
    expect(documentName('/home/sam/prep notes.docx')).toBe('prep notes.docx');
    expect(documentName(`${'n'.repeat(300)}.pdf`)).toHaveLength(200);
  });
});

describe('reading a document from a file (3.10)', () => {
  function deps(file: Uint8Array, over: Partial<ReadDocumentDependencies> = {}) {
    const reader = {
      read: vi.fn<ReadDocumentDependencies['reader']['read']>(async () => ({
        ok: true as const,
        text: 'From the reader.',
      })),
    };
    return { size: async () => file.length, readFile: async () => file, reader, ...over };
  }

  it('reads plain text itself, and PDF and Word in the documents window', async () => {
    const plain = deps(text('  Plain\r\nnotes  '));
    expect(await readDocumentFile('C:/notes.txt', 'notes', plain)).toEqual({
      ok: true,
      text: 'Plain\nnotes',
      name: 'notes.txt',
      cut: false,
    });
    expect(plain.reader.read).not.toHaveBeenCalled();

    const pdf = pdfOf([['x']]);
    const viaWindow = deps(pdf);
    expect(await readDocumentFile('C:/cv.pdf', 'resume', viaWindow)).toEqual({
      ok: true,
      text: 'From the reader.',
      name: 'cv.pdf',
      cut: false,
    });
    expect(viaWindow.reader.read).toHaveBeenCalledWith('pdf', pdf);
  });

  it('cuts only the prep doc; any other document over its limit comes back whole', async () => {
    const long = `${'a'.repeat(80_000)}\n${'b'.repeat(40_000)}`;
    const prep = await readDocumentFile('prep.txt', 'prepDoc', deps(text(long)));
    expect(prep).toEqual({ ok: true, text: 'a'.repeat(80_000), name: 'prep.txt', cut: true });
    const resume = await readDocumentFile('cv.txt', 'resume', deps(text(long)));
    expect(resume).toMatchObject({ ok: true, cut: false });
    expect(resume.ok && resume.text.length).toBe(long.length);
  });

  it.each<[string, Partial<ReadDocumentDependencies>, string]>([
    ['a file over 20 MB, before it is read', { size: async () => maxFileBytes + 1 }, 'too_big'],
    [
      'a file that grew past 20 MB while read',
      { size: async () => 10, readFile: async () => new Uint8Array(maxFileBytes + 1) },
      'too_big',
    ],
    ['a file that is gone', { size: async () => Promise.reject(new Error('ENOENT')) }, 'failed'],
    ['a file that can’t be opened', { readFile: async () => Promise.reject(new Error('EACCES')) }, 'failed'],
  ])('refuses %s', async (_what, over, why) => {
    expect(await readDocumentFile('C:/cv.pdf', 'resume', deps(pdfOf([['x']]), over))).toEqual({
      ok: false,
      code: `read_${why}`,
      message: readRefusalText[why as keyof typeof readRefusalText],
    });
  });

  it('refuses a kind it does not read, and a file with no text', async () => {
    expect(await readDocumentFile('cv.doc', 'resume', deps(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])))).toMatchObject({
      code: 'read_unsupported',
    });
    expect(await readDocumentFile('blank.txt', 'notes', deps(text('  \n\t\n ')))).toMatchObject({ code: 'read_empty' });
  });

  it.each(['unreadable', 'protected', 'empty', 'timeout'] as const)(
    'passes on the documents window’s %s',
    async (failure) => {
      const failing = deps(docxOf(['x']), { reader: { read: async () => ({ ok: false as const, failure }) } });
      expect(await readDocumentFile('cv.docx', 'resume', failing)).toEqual({
        ok: false,
        code: `read_${failure}`,
        message: readRefusalText[failure],
      });
    },
  );
});

describe('the documents window, as main talks to it (3.10)', () => {
  class FakeChannel implements DocumentsChannel {
    readonly posted: ReadRequest[] = [];
    closed = false;
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
      this.closed = true;
    }
    reply(message: unknown): void {
      this.listener(message);
    }
    crash(): void {
      this.gone();
    }
  }

  let channels: FakeChannel[];
  let reader: DocumentReader;

  beforeEach(() => {
    vi.useFakeTimers();
    channels = [];
    reader = new DocumentReader(() => {
      const channel = new FakeChannel();
      channels.push(channel);
      return channel;
    }, 1_000);
  });

  afterEach(() => vi.useRealTimers());

  it('opens the window once, sends each file with an id, and takes the text that answers it', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const first = reader.read('pdf', bytes);
    const second = reader.read('docx', bytes);
    const [a, b] = channels[0]!.posted;

    channels[0]!.reply({ id: b!.id, ok: true, text: 'second' });
    channels[0]!.reply({ id: a!.id, ok: false, reason: 'protected' });

    expect(channels).toHaveLength(1);
    expect(a).toMatchObject({ kind: 'pdf', bytes });
    expect(await first).toEqual({ ok: false, failure: 'protected' });
    expect(await second).toEqual({ ok: true, text: 'second' });
  });

  it('ignores anything from the page that is not an answer to a read waiting', async () => {
    const read = reader.read('pdf', new Uint8Array([1]));
    const { id } = channels[0]!.posted[0]!;
    for (const junk of [
      null,
      'text',
      { id },
      { id, ok: true },
      { id, ok: true, text: 5 },
      { id, ok: false, reason: 'nope' },
      { id: 'someone-else', ok: true, text: 'x' },
      { id, ok: true, text: 'x', extra: 1 },
      { id, ok: true, text: 'x'.repeat(2_000_001) },
    ]) {
      channels[0]!.reply(junk);
    }
    channels[0]!.reply({ id, ok: true, text: 'the real one' });
    expect(await read).toEqual({ ok: true, text: 'the real one' });
  });

  it('gives up a read that takes too long, closes the window, and opens a fresh one for the next', async () => {
    const slow = reader.read('pdf', new Uint8Array([1]));
    const waiting = reader.read('docx', new Uint8Array([2]));
    vi.advanceTimersByTime(1_000);

    expect(await slow).toEqual({ ok: false, failure: 'timeout' });
    expect(await waiting).toEqual({ ok: false, failure: 'timeout' });
    expect(channels[0]!.closed).toBe(true);

    const next = reader.read('pdf', new Uint8Array([3]));
    expect(channels).toHaveLength(2);
    channels[1]!.reply({ id: channels[1]!.posted[0]!.id, ok: true, text: 'fresh' });
    expect(await next).toEqual({ ok: true, text: 'fresh' });
  });

  it('fails the reads waiting when the page goes down, at once', async () => {
    const read = reader.read('pdf', new Uint8Array([1]));
    channels[0]!.crash();
    expect(await read).toEqual({ ok: false, failure: 'unreadable' });
    expect(channels[0]!.closed).toBe(true);
  });

  it('closes the window on quitting', async () => {
    const read = reader.read('pdf', new Uint8Array([1]));
    reader.close();
    expect(await read).toEqual({ ok: false, failure: 'unreadable' });
    expect(channels[0]!.closed).toBe(true);
  });
});

describe("a file's text, as the documents window reads it (3.10: pdf.js and mammoth)", () => {
  it("reads a PDF's lines, page after page", async () => {
    const text = await pdfText(pdfOf([['Sam Rivera', 'Backend (Go) engineer'], ['Page two']]));
    expect(normalizeText(text)).toBe('Sam Rivera\nBackend (Go) engineer\n\nPage two');
  });

  it("reads a PDF's Latin letters", async () => {
    expect(normalizeText(await pdfText(pdfOf([['Résumé, naïve café']])))).toBe('Résumé, naïve café');
  });

  it(`reads at most ${maxPdfPages} pages`, async () => {
    const pages = Array.from({ length: maxPdfPages + 2 }, (_, i) => [`Page ${i + 1}`]);
    const text = await pdfText(pdfOf(pages));
    expect(text).toContain(`Page ${maxPdfPages}`);
    expect(text).not.toContain(`Page ${maxPdfPages + 1}`);
  }, 60_000);

  it("reads a Word document's paragraphs and its table, cell by cell", async () => {
    const text = await docxText(
      docxOf(
        ['Sam Rivera', 'Payments & <ledgers>'],
        [
          ['Go', '7 years'],
          ['Kafka', '4 years'],
        ],
      ),
    );
    expect(normalizeText(text)).toBe('Sam Rivera\n\nPayments & <ledgers>\n\nGo\n\n7 years\n\nKafka\n\n4 years');
  });

  it('throws on a file that is not what it says, and words it as unreadable', async () => {
    await expect(pdfText(text('%PDF-1.4 and then nothing'))).rejects.toThrow();
    await expect(docxText(zipOf({ 'other.xml': '<x/>' }))).rejects.toThrow();
    const error = await pdfText(text('%PDF-1.4 and then nothing')).catch((e: unknown) => e);
    expect(failureOf(error)).toBe('unreadable');
  });

  it('words a password-protected file as protected', () => {
    const protectedError = Object.assign(new Error('No password given'), { name: 'PasswordException' });
    expect(failureOf(protectedError)).toBe('protected');
    expect(failureOf('a string')).toBe('unreadable');
  });
});

describe('what the app window may send about documents (3.10)', () => {
  it('takes a prep doc of up to 100,000 characters and a name of up to 200, trimmed', () => {
    expect(setPrepDocSchema.parse({ text: 'x', name: '  prep.pdf  ', cut: false })).toEqual({
      text: 'x',
      name: 'prep.pdf',
      cut: false,
    });
    expect(setPrepDocSchema.safeParse({ text: 'x'.repeat(100_000), name: 'n'.repeat(200), cut: true }).success).toBe(
      true,
    );
    expect(setPrepDocSchema.safeParse({ text: 'x'.repeat(100_001), name: '', cut: false }).success).toBe(false);
    expect(setPrepDocSchema.safeParse({ text: 'x', name: 'n'.repeat(201), cut: false }).success).toBe(false);
    expect(setPrepDocSchema.safeParse({ text: 'x', name: '', cut: false, path: 'C:/' }).success).toBe(false);
    expect(setPrepDocSchema.safeParse({ text: 'x', name: '' }).success).toBe(false);
  });

  it('reads a file only into a document there is', () => {
    for (const target of ['name', 'resume', 'jobDescription', 'notes', 'prepDoc']) {
      expect(readTargetSchema.safeParse(target).success).toBe(true);
    }
    for (const target of ['prep', 'settings', '', null, 1])
      expect(readTargetSchema.safeParse(target).success).toBe(false);
  });
});
