// Reading a document's file (3.10). Main never parses a file itself: the bytes go to a hidden, sandboxed window of
// their own (no Node, no network, no permission; windows/documents-window.ts), where pdf.js and mammoth turn them into
// text, and only text comes back, checked. A file that keeps the reader busy too long, or that brings its page down,
// takes the window with it; the next read opens a fresh one.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/** What main sends the reader: a file's bytes, PDF or Word. Copied, never transferred. */
export interface ReadRequest {
  id: string;
  kind: 'pdf' | 'docx';
  bytes: Uint8Array;
}

/** The documents window, as main talks to it. */
export interface DocumentsChannel {
  post(request: ReadRequest): void;
  onMessage(listener: (message: unknown) => void): void;
  /** The page is gone (crashed, or killed): every read waiting on it fails. */
  onGone(listener: () => void): void;
  close(): void;
}

/** A read longer than this is given up, and the window with it. */
export const readTimeoutMs = 20_000;

/** The most text a reply may carry: far past any document's limit, and still bounded. */
export const maxReplyChars = 2_000_000;

export type ReadFailure = 'unreadable' | 'protected' | 'empty' | 'timeout';
export type ReadOutcome = { ok: true; text: string } | { ok: false; failure: ReadFailure };

const replySchema = z.discriminatedUnion('ok', [
  z.object({ id: z.string(), ok: z.literal(true), text: z.string().max(maxReplyChars) }).strict(),
  z.object({ id: z.string(), ok: z.literal(false), reason: z.enum(['unreadable', 'protected', 'empty']) }).strict(),
]);

interface Waiting {
  settle: (outcome: ReadOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DocumentReader {
  private channel: DocumentsChannel | null = null;
  private readonly waiting = new Map<string, Waiting>();

  constructor(
    private readonly open: () => DocumentsChannel,
    private readonly timeoutMs = readTimeoutMs,
  ) {}

  read(kind: ReadRequest['kind'], bytes: Uint8Array): Promise<ReadOutcome> {
    const channel = this.ensureChannel();
    const id = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve({ ok: false, failure: 'timeout' });
        // A file that keeps the reader busy this long may never let it go: the window goes too.
        this.drop('timeout');
      }, this.timeoutMs);
      this.waiting.set(id, { settle: resolve, timer });
      channel.post({ id, kind, bytes });
    });
  }

  /** Closes the window, if one is open (quitting). */
  close(): void {
    this.drop('unreadable');
  }

  private ensureChannel(): DocumentsChannel {
    if (this.channel) return this.channel;
    const channel = this.open();
    channel.onMessage((message) => this.received(message));
    channel.onGone(() => {
      if (this.channel === channel) this.drop('unreadable');
    });
    this.channel = channel;
    return channel;
  }

  /** A reply, checked: anything else from the page is ignored. */
  private received(message: unknown): void {
    const reply = replySchema.safeParse(message);
    if (!reply.success) return;
    const waiting = this.waiting.get(reply.data.id);
    if (!waiting) return;
    this.waiting.delete(reply.data.id);
    clearTimeout(waiting.timer);
    waiting.settle(reply.data.ok ? { ok: true, text: reply.data.text } : { ok: false, failure: reply.data.reason });
  }

  /** The window goes, and every read still waiting on it fails. */
  private drop(failure: ReadFailure): void {
    const channel = this.channel;
    this.channel = null;
    for (const { settle, timer } of this.waiting.values()) {
      clearTimeout(timer);
      settle({ ok: false, failure });
    }
    this.waiting.clear();
    channel?.close();
  }
}
