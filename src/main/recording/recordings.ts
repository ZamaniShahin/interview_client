// The recordings folder (3.12, Q51): `userData/recordings`, one encrypted file per recorded interview, named at random
// and noted in history (the `recordings` table). Files are made, deleted with their interview, saved as a WAV where the
// user chooses, and swept at start: a file no interview holds goes, as does a recording too short to keep.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { SecretStore } from '../auth/secret-store';
import { minKeepSeconds, type RecordingHistory, type RecordingPlace } from './call-recorder';
import { exportWav, recordingSeconds, RecordingWriter } from './recording-file';

/** A recording's file name: what this app makes, and nothing else is ever opened or deleted. */
const fileName = /^[0-9a-f]{24}\.srec$/;

export function isRecordingFile(name: string): boolean {
  return fileName.test(name);
}

/** The recordings' key: made once, 32 random bytes as hex, kept among the secrets, apart from the database's. */
export async function recordingKey(secrets: SecretStore): Promise<Buffer> {
  const kept = await secrets.get('recording-key');
  if (kept && /^[0-9a-f]{64}$/.test(kept)) return Buffer.from(kept, 'hex');
  const made = randomBytes(32).toString('hex');
  await secrets.set('recording-key', made);
  return Buffer.from(made, 'hex');
}

/** What the sweep reads and changes in history. */
export interface SweptHistory extends RecordingHistory {
  recordingFiles(): { interviewId: number; file: string; seconds: number | null }[];
}

export interface RecordingsOptions {
  /** The folder (resolved when first needed: Electron's paths are ready by then). */
  dir: () => string;
  /** The recordings' key, or null where this computer can't keep secrets encrypted: then nothing is recorded. */
  key: () => Promise<Buffer | null>;
}

export class Recordings implements RecordingPlace {
  constructor(private readonly options: RecordingsOptions) {}

  async create(): Promise<{ file: string; writer: RecordingWriter } | null> {
    const key = await this.options.key();
    if (!key) return null;
    const dir = this.options.dir();
    mkdirSync(dir, { recursive: true });
    const file = `${randomBytes(12).toString('hex')}.srec`;
    return { file, writer: RecordingWriter.create(join(dir, file), key) };
  }

  delete(file: string): void {
    if (!isRecordingFile(file)) return;
    try {
      rmSync(join(this.options.dir(), file), { force: true });
    } catch {
      // In use or locked: the next start's sweep takes it, its interview gone.
    }
  }

  /** Writes a recording as a stereo WAV at `target`; the seconds written. Throws when it can't. */
  async saveAs(file: string, target: string): Promise<number> {
    if (!isRecordingFile(file)) throw new Error('Not a recording.');
    const key = await this.options.key();
    if (!key) throw new Error("This computer can't read its recordings.");
    return exportWav(join(this.options.dir(), file), key, target);
  }

  /**
   * At start, before history drops what is empty: files no interview holds go (an app that quit between making one
   * and noting it, or a delete that failed); a recording whose file is gone, or too short to keep, goes from history;
   * one an app left open when it quit is measured from its file. How many recordings and files went.
   */
  sweep(history: SweptHistory): number {
    const dir = this.options.dir();
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      names = [];
    }
    const rows = history.recordingFiles();
    const held = new Set(rows.map((row) => row.file));
    let gone = 0;
    for (const name of names) {
      if (isRecordingFile(name) && !held.has(name)) {
        this.delete(name);
        gone += 1;
      }
    }
    for (const row of rows) {
      const seconds = row.seconds ?? (isRecordingFile(row.file) ? recordingSeconds(join(dir, row.file)) : null);
      if (seconds === null || seconds < minKeepSeconds || !names.includes(row.file)) {
        this.delete(row.file);
        history.dropRecording(row.interviewId);
        gone += 1;
      } else if (row.seconds === null) {
        history.finishRecording(row.interviewId, seconds);
      }
    }
    return gone;
  }
}
