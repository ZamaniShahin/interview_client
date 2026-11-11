// Keeps a live session in history as it goes (3.9, v1's create_interview, add_qa and add_transcript): the interview as
// the session starts, each answer once it is over, the interviewer's words when the user keeps transcripts, and the
// end. Each is written at once, so an app that quits mid-session loses at most the answer being written.
import type { HistoryEvent } from '../../shared/live/history-events';
import type { HistoryStore, InterviewStart } from '../storage/history-store';

export interface HistoryRecorderOptions {
  /** Whether the interviewer's words are kept (Settings, "Keep transcripts"): read as each line comes. */
  keepTranscripts: () => boolean;
  /** History changed: the app window's list is read again. */
  changed: () => void;
  now?: () => number;
}

export class HistoryRecorder {
  private current: number | null = null;

  constructor(
    private readonly store: HistoryStore,
    private readonly options: HistoryRecorderOptions,
  ) {}

  /** The interview being kept, if a session runs. */
  get interviewId(): number | null {
    return this.current;
  }

  /** A session started: its interview, from the documents it started with. An earlier one still open ends here. */
  begin(start: Omit<InterviewStart, 'startedAt'>): void {
    if (this.current !== null) this.finish(null);
    this.current = this.store.start({ ...start, startedAt: this.now() });
  }

  record(event: HistoryEvent): void {
    const id = this.current;
    if (id === null) return;
    switch (event.type) {
      case 'answered':
        this.store.addAnswer(id, {
          askedAt: event.answer.startedAtMs,
          kind: event.answer.kind,
          question: event.answer.question,
          answer: event.answer.text,
        });
        this.options.changed();
        return;
      case 'heard':
        if (!this.options.keepTranscripts()) return;
        this.store.addLine(id, { at: event.atMs, speaker: 'interviewer', text: event.text });
        return;
      case 'ended':
        this.finish(event.reason);
        return;
    }
  }

  /** The session is over (or never started): the interview ends, and goes if it kept nothing. */
  finish(reason: string | null): void {
    const id = this.current;
    if (id === null) return;
    this.current = null;
    this.store.end(id, this.now(), reason);
    this.store.dropIfEmpty(id);
    this.options.changed();
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}
