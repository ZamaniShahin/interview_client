// Records a live session (3.12, Q51): the capture window's stereo frames (the call on the left, the microphone on the
// right, already lined up on one clock) into the session's recording, kept with its interview in history. Under two
// seconds kept, a recording is no recording (v1's MIN_KEEP_SECONDS): it goes. A write that fails (a full disk) stops the
// recording and keeps what was written; the session goes on.
import { stereoFrameBytes } from '../../shared/audio/frames';
import type { RecordingWriter } from './recording-file';

/** v1's MIN_KEEP_SECONDS: anything shorter is an idle start, not an interview. */
export const minKeepSeconds = 2;

/** Where recordings are made and deleted: the recordings folder (recordings.ts), or a fake. */
export interface RecordingPlace {
  /** A new recording file, open for writing; null when recordings can't be kept on this computer (no key). */
  create(): Promise<{ file: string; writer: RecordingWriter } | null>;
  delete(file: string): void;
}

/** What history keeps of a recording (history-store.ts). */
export interface RecordingHistory {
  startRecording(interviewId: number, file: string, startedAt: number): void;
  finishRecording(interviewId: number, seconds: number): void;
  dropRecording(interviewId: number): void;
  dropIfEmpty(interviewId: number): boolean;
}

export interface CallRecorderDependencies {
  place: RecordingPlace;
  history: () => RecordingHistory | null;
  /** The interview history is still keeping, if any: an interview it keeps is never dropped from under it. */
  keeping: () => number | null;
  /** The recording stopped early (a write failed); what was written is kept. */
  failed?: (error: unknown) => void;
  now?: () => number;
}

interface Running {
  interviewId: number;
  file: string;
  writer: RecordingWriter;
}

export class CallRecorder {
  private current: Running | null = null;

  constructor(private readonly deps: CallRecorderDependencies) {}

  /** The interview being recorded, if any. */
  get interviewId(): number | null {
    return this.current?.interviewId ?? null;
  }

  get running(): boolean {
    return this.current !== null;
  }

  /** Starts recording an interview's session; false when it can't be recorded here. One recording at a time. */
  async start(interviewId: number): Promise<boolean> {
    this.stop();
    const history = this.deps.history();
    if (!history) return false;
    let made: { file: string; writer: RecordingWriter } | null;
    try {
      made = await this.deps.place.create();
    } catch (error) {
      this.deps.failed?.(error);
      return false;
    }
    if (!made) return false;
    try {
      // Noted at once, so history keeps the interview for it, and an app that quits mid-session leaves it findable.
      history.startRecording(interviewId, made.file, this.now());
    } catch (error) {
      made.writer.close();
      this.deps.place.delete(made.file);
      this.deps.failed?.(error);
      return false;
    }
    this.current = { interviewId, file: made.file, writer: made.writer };
    return true;
  }

  /** One frame of the recording. Anything but a whole stereo frame is left out. */
  write(pcm: Uint8Array): void {
    const current = this.current;
    if (!current || pcm.byteLength !== stereoFrameBytes) return;
    try {
      current.writer.append(pcm);
    } catch (error) {
      this.current = null;
      this.finish(current);
      this.deps.failed?.(error);
    }
  }

  /** Ends the recording: kept with its interview, or gone if it is under two seconds. Its seconds, or null if none ran. */
  stop(): number | null {
    const current = this.current;
    if (!current) return null;
    this.current = null;
    return this.finish(current);
  }

  private finish(record: Running): number {
    let seconds: number;
    try {
      seconds = record.writer.close();
    } catch (error) {
      // The last part couldn't be written: what was sealed before it is still the recording.
      this.deps.failed?.(error);
      seconds = record.writer.sealedSeconds;
    }
    const history = this.deps.history();
    if (seconds >= minKeepSeconds) {
      history?.finishRecording(record.interviewId, seconds);
      return seconds;
    }
    this.deps.place.delete(record.file);
    history?.dropRecording(record.interviewId);
    // An interview that kept nothing else goes too, unless history is still keeping it (it drops it itself at the end).
    if (this.deps.keeping() !== record.interviewId) history?.dropIfEmpty(record.interviewId);
    return seconds;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
