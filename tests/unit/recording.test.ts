// Recording a live session (3.12, Q51), in main: the recorder over the recordings folder and history, as main wires
// them, against a real (in-memory) history and a real folder; the sweep at start; deleting with the interview.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerKind, ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import { stereoFrameBytes } from '../../src/shared/audio/frames';
import { recordingFileName, recordingLength } from '../../src/shared/history';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import { HistoryService } from '../../src/main/history/history-service';
import { CallRecorder, minKeepSeconds, type RecordingPlace } from '../../src/main/recording/call-recorder';
import { chunkBytes, recordingAudio } from '../../src/main/recording/recording-file';
import { isRecordingFile, recordingKey, Recordings } from '../../src/main/recording/recordings';
import { HistoryStore } from '../../src/main/storage/history-store';
import { openDatabase } from '../../src/main/storage/local-database';
import { migrations } from '../../src/main/storage/schema';

const frame = (fill = 1) => new Uint8Array(stereoFrameBytes).fill(fill);
/** Frames a second: 100 ms each. */
const perSecond = 10;

let dir: string;
let key: Buffer;
let history: HistoryStore;
let recordings: Recordings;

function interview(): number {
  return history.start({ startedAt: 1_700_000_000_000, candidate: 'Sam', role: 'Payments', tier: 'smart' });
}

function recorder(
  options: {
    keeping?: () => number | null;
    failed?: (e: unknown) => void;
    place?: RecordingPlace;
    paused?: () => boolean;
  } = {},
) {
  return new CallRecorder({
    place: options.place ?? recordings,
    history: () => history,
    keeping: options.keeping ?? (() => null),
    failed: options.failed,
    paused: options.paused,
    now: () => 1_700_000_000_000,
  });
}

const files = () => (existsSync(dir) ? readdirSync(dir).sort() : []);

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), 'sotto-recordings-')), 'recordings');
  key = randomBytes(32);
  history = new HistoryStore(openDatabase(null, null, migrations));
  recordings = new Recordings({ dir: () => dir, key: async () => key });
});

afterEach(() => rmSync(join(dir, '..'), { recursive: true, force: true }));

describe('a session recorded', () => {
  it.each([2, 2.5, 7.3, 61])('keeps %s seconds with its interview, noted from its start', async (seconds) => {
    const id = interview();
    const r = recorder();

    expect(await r.start(id)).toBe(true);
    const noted = history.recordingOf(id);
    expect(noted).toMatchObject({ seconds: null });
    expect(isRecordingFile(noted!.file)).toBe(true);
    expect(files()).toEqual([noted!.file]);

    for (let i = 0; i < Math.round(seconds * perSecond); i++) r.write(frame((i % 250) + 1));
    expect(r.stop()).toBeCloseTo(seconds, 9);

    expect(history.recordingOf(id)).toEqual({ file: noted!.file, seconds: expect.closeTo(seconds, 9) });
    expect(history.list()[0]!.recordingSeconds).toBeCloseTo(seconds, 9);
    const kept = Buffer.concat([...recordingAudio(join(dir, noted!.file), key)]);
    expect(kept.length).toBe(Math.round(seconds * perSecond) * stereoFrameBytes);
    expect(kept[0]).toBe(1);
  });

  it.each([0, 1, 19])(
    'lets go of %i frames, under two seconds: the file and the row go, and an interview that kept nothing else',
    async (frames) => {
      const id = interview();
      const r = recorder();
      await r.start(id);
      for (let i = 0; i < frames; i++) r.write(frame());

      expect(r.stop()).toBeLessThan(minKeepSeconds);

      expect(files()).toEqual([]);
      expect(history.recordingOf(id)).toBeNull();
      expect(history.list()).toEqual([]);
    },
  );

  it('lets go of a short recording but keeps an interview that kept answers', async () => {
    const id = interview();
    history.addAnswer(id, { askedAt: 1, kind: AnswerKind.Typed, question: 'Why?', answer: 'Because.' });
    const r = recorder();
    await r.start(id);
    r.write(frame());

    r.stop();

    expect(history.list()).toEqual([expect.objectContaining({ id, answers: 1, recordingSeconds: null })]);
  });

  it('never drops an interview history is still keeping: history does that itself when it ends', async () => {
    const id = interview();
    const r = recorder({ keeping: () => id });
    await r.start(id);

    r.stop();

    expect(history.recordingOf(id)).toBeNull();
    expect(history.list().map((i) => i.id)).toEqual([id]);
    expect(history.dropIfEmpty(id)).toBe(true);
  });

  it('keeps the interview while its recording runs, though nothing else was kept yet', async () => {
    const id = interview();
    const r = recorder();
    await r.start(id);

    expect(history.dropIfEmpty(id)).toBe(false);
    expect(history.dropEmpty()).toBe(0);
  });

  it('leaves out anything but a whole stereo frame, and anything once stopped', async () => {
    const id = interview();
    const r = recorder();
    await r.start(id);
    for (let i = 0; i < 2 * perSecond; i++) r.write(frame());
    r.write(new Uint8Array(stereoFrameBytes - 4));
    r.write(new Uint8Array(stereoFrameBytes / 2));
    r.write(new Uint8Array(0));

    expect(r.stop()).toBe(2);
    r.write(frame());
    expect(r.stop()).toBeNull();
    expect(history.recordingOf(id)!.seconds).toBe(2);
  });

  it('records one interview at a time: a new start ends the last one first', async () => {
    const a = interview();
    const b = interview();
    const r = recorder();
    await r.start(a);
    for (let i = 0; i < 3 * perSecond; i++) r.write(frame());

    await r.start(b);

    expect(r.interviewId).toBe(b);
    expect(history.recordingOf(a)!.seconds).toBe(3);
    expect(history.recordingOf(b)!.seconds).toBeNull();
  });

  it('records nothing where there is no key, or no history', async () => {
    const id = interview();
    const none = new CallRecorder({
      place: new Recordings({ dir: () => dir, key: async () => null }),
      history: () => history,
      keeping: () => null,
    });
    const noHistory = new CallRecorder({ place: recordings, history: () => null, keeping: () => null });

    expect(await none.start(id)).toBe(false);
    expect(await noHistory.start(id)).toBe(false);
    expect(none.running || noHistory.running).toBe(false);
    expect(files()).toEqual([]);
    expect(history.recordingOf(id)).toBeNull();
  });

  it('takes its file back when history refuses to note it (an interview no longer there)', async () => {
    const failed = vi.fn();
    const r = recorder({ failed });

    expect(await r.start(999)).toBe(false);

    expect(failed).toHaveBeenCalledOnce();
    expect(files()).toEqual([]);
  });

  it('stops at a write that fails, keeps what was sealed, says so once, and takes no more', async () => {
    const id = interview();
    let writes = 0;
    const place: RecordingPlace = {
      async create() {
        const made = await recordings.create();
        const writer = made!.writer;
        const append = writer.append.bind(writer);
        // The disk fills on the 35th frame: three whole seconds were sealed by then.
        writer.append = (pcm: Uint8Array) => {
          if (++writes === 35) throw new Error('ENOSPC: no space left on device');
          append(pcm);
        };
        return made;
      },
      delete: (file) => recordings.delete(file),
    };
    const failed = vi.fn();
    const r = recorder({ place, failed });
    await r.start(id);

    for (let i = 0; i < 50; i++) r.write(frame());

    expect(failed).toHaveBeenCalledOnce();
    expect(r.running).toBe(false);
    expect(writes).toBe(35);
    expect(history.recordingOf(id)!.seconds).toBeCloseTo(3.4, 9);
  });

  it('a recording that failed while too short goes, file and row', async () => {
    const id = interview();
    const place: RecordingPlace = {
      async create() {
        const made = await recordings.create();
        made!.writer.append = () => {
          throw new Error('EIO');
        };
        return made;
      },
      delete: (file) => recordings.delete(file),
    };
    const r = recorder({ place, failed: () => {} });
    await r.start(id);

    r.write(frame());

    expect(files()).toEqual([]);
    expect(history.recordingOf(id)).toBeNull();
  });
});

describe('a session paused (v1 records nothing while paused)', () => {
  /** A session as frames of 100 ms: `r` heard while running, `p` heard while paused. Its kept frames, in order. */
  const recordPattern = async (pattern: string) => {
    const id = interview();
    let paused = false;
    const r = recorder({ paused: () => paused });
    await r.start(id);
    const recorded: number[] = [];
    [...pattern].forEach((step, i) => {
      paused = step === 'p';
      const fill = (i % 250) + 1;
      r.write(frame(fill));
      if (!paused) recorded.push(fill);
    });
    const file = history.recordingOf(id)!.file;
    return { id, file, seconds: r.stop()!, recorded };
  };

  it.each([
    ['never paused', 'r'.repeat(25)],
    ['paused at the start', 'p'.repeat(5) + 'r'.repeat(20)],
    ['paused at the end', 'r'.repeat(20) + 'p'.repeat(5)],
    ['paused in the middle, two seconds either side', 'r'.repeat(20) + 'p'.repeat(30) + 'r'.repeat(20)],
    ['paused in the middle, exactly two seconds in all', 'r'.repeat(10) + 'p'.repeat(30) + 'r'.repeat(10)],
    ['paused and resumed at every frame', 'rp'.repeat(25)],
    ['paused one frame in three', 'rrp'.repeat(15)],
    ['paused for one frame either side', 'p' + 'r'.repeat(20) + 'p'],
    ['paused many times, briefly', ('r'.repeat(7) + 'p'.repeat(3)).repeat(5)],
  ])('%s: keeps only what was heard while running, in order, with no gap filled', async (_, pattern) => {
    const { id, file, seconds, recorded } = await recordPattern(pattern);

    expect(seconds).toBeCloseTo(recorded.length / perSecond, 9);
    expect(history.recordingOf(id)).toEqual({ file, seconds: expect.closeTo(recorded.length / perSecond, 9) });
    const kept = Buffer.concat([...recordingAudio(join(dir, file), key)]);
    expect(kept.length).toBe(recorded.length * stereoFrameBytes);
    // Each frame read back is one heard while running: no paused frame among them, none of them lost.
    recorded.forEach((fill, f) => {
      expect(kept[f * stereoFrameBytes]).toBe(fill);
      expect(kept[(f + 1) * stereoFrameBytes - 1]).toBe(fill);
    });
  });

  it.each([
    ['paused throughout', 'p'.repeat(25)],
    ['paused throughout a long session', 'p'.repeat(600)],
    ['just under two seconds heard, around a long pause', 'r'.repeat(10) + 'p'.repeat(100) + 'r'.repeat(9)],
    ['a second heard, then paused to the end', 'r'.repeat(10) + 'p'.repeat(50)],
  ])('%s: under two seconds heard, so nothing is kept', async (_, pattern) => {
    const { id, seconds } = await recordPattern(pattern);

    expect(seconds).toBeLessThan(minKeepSeconds);
    expect(files()).toEqual([]);
    expect(history.recordingOf(id)).toBeNull();
    // The interview kept nothing else, so it goes too.
    expect(history.list()).toEqual([]);
  });

  it('reads the pause at each frame, not once at the start', async () => {
    const id = interview();
    const asked: boolean[] = [];
    let paused = true;
    const r = recorder({
      paused: () => {
        asked.push(paused);
        return paused;
      },
    });
    await r.start(id);

    for (let i = 0; i < 5; i++) r.write(frame());
    paused = false;
    for (let i = 0; i < 20; i++) r.write(frame());

    expect(asked).toEqual([...Array<boolean>(5).fill(true), ...Array<boolean>(20).fill(false)]);
    expect(r.stop()).toBe(2);
  });

  it('asks nothing of the pause for frames it would leave out anyway', async () => {
    const id = interview();
    const paused = vi.fn(() => false);
    const r = recorder({ paused });

    r.write(frame());
    await r.start(id);
    r.write(new Uint8Array(stereoFrameBytes - 4));
    r.write(new Uint8Array(0));

    expect(paused).not.toHaveBeenCalled();
    r.stop();
  });

  it('a paused session leaves its running recording open: it goes on once resumed, in the same file', async () => {
    const id = interview();
    let paused = false;
    const r = recorder({ paused: () => paused });
    await r.start(id);
    const file = history.recordingOf(id)!.file;
    for (let i = 0; i < 15; i++) r.write(frame(7));

    paused = true;
    for (let i = 0; i < 40; i++) r.write(frame(9));
    expect(r.running).toBe(true);
    expect(files()).toEqual([file]);
    paused = false;
    for (let i = 0; i < 15; i++) r.write(frame(8));

    expect(r.stop()).toBe(3);
    const kept = Buffer.concat([...recordingAudio(join(dir, file), key)]);
    expect([...new Set(kept)]).toEqual([7, 8]);
  });
});

describe('the recordings folder', () => {
  it('makes the key once, keeps it among the secrets, and replaces one that is no key', async () => {
    const secrets = new MemorySecretStore();
    const first = await recordingKey(secrets);
    const again = await recordingKey(secrets);
    await secrets.set('recording-key', 'not a key');
    const replaced = await recordingKey(secrets);

    expect(first.length).toBe(32);
    expect(again.equals(first)).toBe(true);
    expect(replaced.equals(first)).toBe(false);
    expect(await secrets.get('recording-key')).toBe(replaced.toString('hex'));
    expect(await secrets.get('database-key')).toBeNull();
  });

  it.each(['../secrets/refresh-token.bin', 'notes.txt', '0123456789abcdef01234567.wav', '0123456789ABCDEF01234567.srec', ''])(
    'never deletes %j: only the names it makes',
    (name) => {
      mkdirSync(dir, { recursive: true });
      const outside = join(dir, '..', 'kept.txt');
      writeFileSync(outside, 'kept');
      if (name && !name.includes('/')) writeFileSync(join(dir, name), 'kept');

      recordings.delete(name);

      expect(existsSync(outside)).toBe(true);
      if (name && !name.includes('/')) expect(existsSync(join(dir, name))).toBe(true);
    },
  );

  it('deletes a file that is already gone without a fuss', () => {
    expect(() => recordings.delete('0123456789abcdef01234567.srec')).not.toThrow();
  });

  it('refuses to save a name it did not make, or without its key', async () => {
    await expect(recordings.saveAs('../x.srec', join(dir, 'out.wav'))).rejects.toThrow();
    const keyless = new Recordings({ dir: () => dir, key: async () => null });
    await expect(keyless.saveAs('0123456789abcdef01234567.srec', join(dir, 'out.wav'))).rejects.toThrow();
  });

  it('saves a kept recording as a WAV', async () => {
    const id = interview();
    const r = recorder();
    await r.start(id);
    for (let i = 0; i < 2 * perSecond; i++) r.write(frame(5));
    r.stop();
    const target = join(dir, '..', 'Interview.wav');

    expect(await recordings.saveAs(history.recordingOf(id)!.file, target)).toBe(2);
    expect(existsSync(target)).toBe(true);
  });
});

describe('the sweep at start', () => {
  /** A recording file with `seconds` of audio, noted in history as an app that quit would leave it, or not at all. */
  async function leave(seconds: number, noted: 'open' | 'finished' | 'not noted', id = interview()) {
    const made = (await recordings.create())!;
    made.writer.append(new Uint8Array(Math.round(seconds * chunkBytes)));
    made.writer.close();
    if (noted !== 'not noted') history.startRecording(id, made.file, 1);
    if (noted === 'finished') history.finishRecording(id, seconds);
    return { id, file: made.file };
  }

  it('takes away files no interview holds, and leaves anything else in the folder alone', async () => {
    const orphan = await leave(5, 'not noted');
    const kept = await leave(5, 'finished');
    writeFileSync(join(dir, 'notes.txt'), 'not ours');

    expect(recordings.sweep(history)).toBe(1);

    expect(files()).toEqual([kept.file, 'notes.txt'].sort());
    expect(existsSync(join(dir, orphan.file))).toBe(false);
  });

  it('measures a recording an app left open, and keeps it if it is long enough', async () => {
    const open = await leave(4, 'open');

    recordings.sweep(history);

    expect(history.recordingOf(open.id)).toEqual({ file: open.file, seconds: 4 });
  });

  it('lets go of one left open too short, and one whose file is gone', async () => {
    const short = await leave(1, 'open');
    const gone = await leave(9, 'finished');
    rmSync(join(dir, gone.file));

    expect(recordings.sweep(history)).toBe(2);

    expect(history.recordingOf(short.id)).toBeNull();
    expect(history.recordingOf(gone.id)).toBeNull();
    expect(files()).toEqual([]);
    // Nothing else was kept of either: history drops them next.
    expect(history.dropEmpty()).toBe(2);
  });

  it('counts only the whole seconds of a file cut off mid-chunk', async () => {
    const cut = await leave(3, 'open');
    truncateSync(join(dir, cut.file), 32 + 2 * (4 + 12 + chunkBytes + 16) + 100);

    recordings.sweep(history);

    expect(history.recordingOf(cut.id)!.seconds).toBe(2);
  });

  it('finds nothing to do in a folder never made', () => {
    expect(recordings.sweep(history)).toBe(0);
  });
});

describe('deleting history deletes its recordings', () => {
  function service(running: number | null = null) {
    return new HistoryService({
      store: () => history,
      running: () => running,
      job: async () => ({}),
      changed: () => {},
      forgetRecording: (file) => recordings.delete(file),
    });
  }

  async function recorded(): Promise<{ id: number; file: string }> {
    const id = interview();
    const r = recorder();
    await r.start(id);
    for (let i = 0; i < 2 * perSecond; i++) r.write(frame());
    r.stop();
    return { id, file: history.recordingOf(id)!.file };
  }

  it('one interview: its recording file goes with it', async () => {
    const one = await recorded();
    const other = await recorded();

    expect(service().delete(one.id)).toEqual({ ok: true });

    expect(files()).toEqual([other.file]);
    expect(history.recordingOf(one.id)).toBeNull();
  });

  it('all of them, but the one a session is keeping', async () => {
    const a = await recorded();
    const b = await recorded();
    const running = await recorded();

    expect(service(running.id).clear()).toEqual({ ok: true });

    expect(files()).toEqual([running.file]);
    expect(history.list().map((i) => i.id)).toEqual([running.id]);
    expect([a, b].some((x) => history.recordingOf(x.id))).toBe(false);
  });

  it('refuses the running one, and keeps its recording', async () => {
    const running = await recorded();

    expect(service(running.id).delete(running.id)).toMatchObject({ ok: false, code: ErrorCodes.Session.AlreadyInSession });
    expect(files()).toEqual([running.file]);
  });

  it('a deleted interview takes its row with it (the database cascades)', async () => {
    const one = await recorded();

    history.delete(one.id);

    expect(history.recordingFiles()).toEqual([]);
  });
});

describe('how a recording is named and timed', () => {
  it.each([
    [0, '0:00'],
    [1.9, '0:01'],
    [59, '0:59'],
    [60, '1:00'],
    [754, '12:34'],
    [3_599, '59:59'],
    [3_600, '1:00:00'],
    [3_723, '1:02:03'],
    [-5, '0:00'],
    [Number.NaN, '0:00'],
  ])('%s seconds read %s', (seconds, text) => {
    expect(recordingLength(seconds)).toBe(text);
  });

  const at = new Date(2026, 10, 13, 9, 5).getTime();

  it.each([
    ['Senior Backend Engineer', 'Sotto – Senior Backend Engineer – 2026-11-13 09.05.wav'],
    ['', 'Sotto – Interview – 2026-11-13 09.05.wav'],
    ['   ', 'Sotto – Interview – 2026-11-13 09.05.wav'],
    ['C#/.NET <Lead>: "Payments" | Team?*', 'Sotto – C# .NET Lead Payments Team – 2026-11-13 09.05.wav'],
    ['Ends in dots...', 'Sotto – Ends in dots – 2026-11-13 09.05.wav'],
    ['tab\there\nnew line', 'Sotto – tab here new line – 2026-11-13 09.05.wav'],
  ])('a role of %j is offered as %j', (role, name) => {
    expect(recordingFileName({ role, startedAt: at })).toBe(name);
  });

  it('is never longer than 120 characters, and never has a character a file name cannot hold', () => {
    const name = recordingFileName({ role: 'x'.repeat(500) + '<>:"/\\|?*', startedAt: at });

    expect(name.length).toBeLessThanOrEqual(120);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
    expect(name.endsWith('.wav')).toBe(true);
  });
});
