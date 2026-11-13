// The deep round over recording (3.12, Q51), 2026-11-13: random lives of recordings, seeded, against a small model of
// the rules, on a real history and a real folder: sessions recorded for random lengths, some under two seconds, some
// over interviews that kept answers; frames of the wrong size among the right ones; the session's end in either order
// (the recorder first, or history first); a new start over a running one; interviews deleted one at a time or all at
// once; the app restarted (the sweep); recordings saved as WAVs. After every step the folder, history and the model
// must agree; then every outcome is shown to occur.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { frameBytes, stereoFrameBytes } from '../../src/shared/audio/frames';
import { AnswerKind } from '../../src/shared/contracts/sotto-contracts';
import { AudioCapture, type CaptureChannel, type MicState } from '../../src/main/capture/audio-capture';
import { HistoryService } from '../../src/main/history/history-service';
import { CallRecorder, minKeepSeconds } from '../../src/main/recording/call-recorder';
import { chunkBytes, recordingAudio, recordingSeconds } from '../../src/main/recording/recording-file';
import { Recordings } from '../../src/main/recording/recordings';
import { HistoryStore } from '../../src/main/storage/history-store';
import { openDatabase } from '../../src/main/storage/local-database';
import { migrations } from '../../src/main/storage/schema';

/** A seeded generator (mulberry32): the same stream on every run. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the model holds of one interview. */
interface Kept {
  answered: boolean;
  /** Each frame's fill byte, in order: what its recording must read back as. */
  frames: number[];
  recording: 'running' | 'kept' | 'none';
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sotto-deep-recording-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** One random life of `steps` steps; the outcomes it went through. */
async function live(seed: number, steps = 60): Promise<Set<string>> {
  const random = generator(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;
  const outcomes = new Set<string>();
  const dir = join(root, `run-${seed}`, 'recordings');
  const key = randomBytes(32);
  const history = new HistoryStore(openDatabase(null, null, migrations));
  const recordings = new Recordings({ dir: () => dir, key: async () => key });
  let keeping: number | null = null;
  const recorder = new CallRecorder({ place: recordings, history: () => history, keeping: () => keeping });
  const service = new HistoryService({
    store: () => history,
    running: () => keeping,
    job: async () => ({}),
    changed: () => {},
    forgetRecording: (file) => recordings.delete(file),
  });
  const model = new Map<number, Kept>();

  /** The session's interview ends in history, as HistoryRecorder ends it: and goes if it kept nothing. */
  const historyEnds = (id: number) => {
    history.end(id, 2, 'user');
    if (history.dropIfEmpty(id)) model.delete(id);
    keeping = null;
  };

  /** The model's word on a recording that stopped. */
  const stopped = (id: number) => {
    const kept = model.get(id)!;
    const seconds = (kept.frames.length * stereoFrameBytes) / chunkBytes;
    if (seconds >= minKeepSeconds) {
      kept.recording = 'kept';
      outcomes.add('kept');
    } else {
      kept.recording = 'none';
      kept.frames = [];
      outcomes.add(kept.answered ? 'too short, its interview kept for its answers' : 'too short, its interview gone');
      if (!kept.answered && keeping !== id) model.delete(id);
    }
  };

  /** Ends the running session: the recorder and history in either order. */
  const endSession = () => {
    const id = recorder.interviewId!;
    const historyFirst = random() < 0.5;
    if (historyFirst) {
      // History ends first: the recording keeps the interview until the recorder decides.
      keeping = null;
      history.end(id, 2, 'user');
      expect(history.dropIfEmpty(id)).toBe(false);
      recorder.stop();
      stopped(id);
      outcomes.add('history ended first');
    } else {
      recorder.stop();
      stopped(id);
      historyEnds(id);
      outcomes.add('the recorder ended first');
    }
  };

  for (let step = 0; step < steps; step++) {
    const action = random();
    if (action < 0.22) {
      // A session starts: its interview, maybe answers, and its recording. A running one ends first.
      if (recorder.running) {
        if (random() < 0.3) {
          const before = recorder.interviewId!;
          const id = history.start({ startedAt: step, candidate: '', role: 'Role', tier: null });
          model.set(id, { answered: false, frames: [], recording: 'none' });
          // A new start over a running one ends it first, history still keeping the old.
          keeping = before;
          expect(await recorder.start(id)).toBe(true);
          stopped(before);
          historyEnds(before);
          keeping = id;
          model.get(id)!.recording = 'running';
          outcomes.add('a new start ended the last');
          continue;
        }
        endSession();
      }
      const id = history.start({ startedAt: step, candidate: '', role: 'Role', tier: null });
      const answered = random() < 0.3;
      if (answered) history.addAnswer(id, { askedAt: step, kind: AnswerKind.Typed, question: 'Q?', answer: 'A.' });
      model.set(id, { answered, frames: [], recording: 'running' });
      keeping = id;
      expect(await recorder.start(id)).toBe(true);
    } else if (action < 0.55) {
      // Frames, some not whole, while a session runs, or none.
      const count = Math.floor(random() * (random() < 0.2 ? 60 : 12));
      for (let i = 0; i < count; i++) {
        if (random() < 0.05) {
          recorder.write(new Uint8Array(pick([0, 4, stereoFrameBytes - 4, stereoFrameBytes + 4, stereoFrameBytes / 2])));
          outcomes.add('a frame of the wrong size left out');
          continue;
        }
        const fill = 1 + Math.floor(random() * 250);
        recorder.write(new Uint8Array(stereoFrameBytes).fill(fill));
        if (recorder.running) model.get(recorder.interviewId!)!.frames.push(fill);
      }
    } else if (action < 0.68) {
      if (recorder.running) endSession();
    } else if (action < 0.78) {
      // One interview deleted from History (never the running one).
      const ids = [...model.keys()].filter((id) => id !== keeping);
      if (ids.length === 0) continue;
      const id = pick(ids);
      const file = history.recordingOf(id)?.file ?? null;
      expect(service.delete(id)).toEqual({ ok: true });
      model.delete(id);
      if (file) {
        expect(existsSync(join(dir, file))).toBe(false);
        outcomes.add('deleted with its interview');
      }
    } else if (action < 0.82) {
      // All deleted, but the running one.
      const before = [...model.keys()].filter((id) => id !== keeping && model.get(id)!.recording === 'kept').length;
      service.clear();
      for (const id of [...model.keys()]) if (id !== keeping) model.delete(id);
      if (before > 0) outcomes.add('cleared with all history');
    } else if (action < 0.9) {
      // The app quits and starts again: the session ends as it quits, then the sweep and history's own clean-up.
      if (recorder.running) endSession();
      const gone = recordings.sweep(history);
      history.dropEmpty();
      expect(gone).toBe(0);
      outcomes.add('a restart found nothing to sweep');
    } else {
      // A kept recording saved as a WAV.
      const ids = [...model.keys()].filter((id) => model.get(id)!.recording === 'kept');
      if (ids.length === 0) continue;
      const id = pick(ids);
      const target = join(root, `run-${seed}`, `saved-${step}.wav`);
      const seconds = await recordings.saveAs(history.recordingOf(id)!.file, target);
      const wav = readFileSync(target);
      const frames = model.get(id)!.frames;
      expect(seconds).toBeCloseTo((frames.length * stereoFrameBytes) / chunkBytes, 9);
      expect(wav.length).toBe(44 + frames.length * stereoFrameBytes);
      for (let f = 0; f < frames.length; f++) expect(wav[44 + f * stereoFrameBytes]).toBe(frames[f]);
      outcomes.add('saved as a WAV');
    }

    // The folder, history and the model agree, whatever happened.
    const rows = history.recordingFiles();
    const onDisk = existsSync(dir) ? readdirSync(dir).sort() : [];
    expect(rows.map((r) => r.file).sort()).toEqual(onDisk);
    expect(history.list().map((i) => i.id).sort((a, b) => a - b)).toEqual([...model.keys()].sort((a, b) => a - b));
    for (const [id, kept] of model) {
      const row = history.recordingOf(id);
      if (kept.recording === 'none') {
        expect(row).toBeNull();
        continue;
      }
      expect(row).not.toBeNull();
      if (kept.recording === 'running') {
        expect(row!.seconds).toBeNull();
        expect(recorder.interviewId).toBe(id);
      } else {
        const seconds = (kept.frames.length * stereoFrameBytes) / chunkBytes;
        expect(row!.seconds).toBeCloseTo(seconds, 9);
        expect(row!.seconds!).toBeGreaterThanOrEqual(minKeepSeconds);
        expect(recordingSeconds(join(dir, row!.file))).toBeCloseTo(seconds, 9);
      }
    }
  }

  // At the end, every kept recording reads back as the frames it was given, in order.
  if (recorder.running) endSession();
  for (const [id, kept] of model) {
    if (kept.recording !== 'kept') continue;
    const audio = Buffer.concat([...recordingAudio(join(dir, history.recordingOf(id)!.file), key)]);
    expect(audio.length).toBe(kept.frames.length * stereoFrameBytes);
    kept.frames.forEach((fill, f) => expect(audio[f * stereoFrameBytes + stereoFrameBytes - 1]).toBe(fill));
  }
  return outcomes;
}

describe('the deep round over recording (3.12)', () => {
  it.each(Array.from({ length: 40 }, (_, i) => i + 1))(
    'random life %i keeps every rule',
    async (seed) => {
      const outcomes = await live(seed);
      expect(outcomes.size).toBeGreaterThan(0);
    },
    30_000,
  );

  it('every outcome of a recording happens over the lives', async () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (const o of await live(seed)) outcomes.add(o);

    expect([...outcomes].sort()).toEqual(
      [
        'kept',
        'too short, its interview gone',
        'too short, its interview kept for its answers',
        'history ended first',
        'the recorder ended first',
        'a new start ended the last',
        'a frame of the wrong size left out',
        'deleted with its interview',
        'cleared with all history',
        'a restart found nothing to sweep',
        'saved as a WAV',
      ].sort(),
    );
    // Forty lives of files written, read and swept: more than the default 5 s on a busy run of the whole suite.
  }, 60_000);
});

// ---- The capture side: random interleavings of what main asks and what the window says -----------------------------

/** The window, as main drives it: counts what it is asked. */
class FakeWindow implements CaptureChannel {
  recordingStarts = 0;
  recordingStops = 0;
  listener: ((message: unknown) => void) | null = null;
  start(): void {}
  stop(): void {}
  startRecording(): void {
    this.recordingStarts++;
  }
  stopRecording(): void {
    this.recordingStops++;
  }
  onMessage(listener: (message: unknown) => void): void {
    this.listener = listener;
  }
  close(): void {}
}

/** One random run of capture with recording; what it went through. */
function capture(seed: number): Set<string> {
  const random = generator(seed);
  const outcomes = new Set<string>();
  let now = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let ids = 0;
  const windows: FakeWindow[] = [];
  const records: number[] = [];
  const mics: MicState[] = [];
  const c = new AudioCapture({
    open: () => {
      const w = new FakeWindow();
      windows.push(w);
      return w;
    },
    onFrame: () => {},
    onStatus: () => {},
    onRecord: (pcm) => records.push(pcm[0]!),
    onMic: (state) => mics.push(state),
    now: () => now,
    setTimer: (run, ms) => {
      timers.push({ at: now + ms, run, id: ++ids });
      return ids;
    },
    clearTimer: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
  });
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.run();
    }
    now = until;
  };

  // The model: whether capture runs, and whether the session is recorded.
  let running = false;
  let recording = false;
  for (let step = 0; step < 150; step++) {
    const win = windows.at(-1) ?? null;
    const asksBefore = win?.recordingStarts ?? 0;
    const recordsBefore = records.length;
    const micsBefore = mics.length;
    const r = random();
    if (r < 0.08) {
      c.start();
      running = true;
    } else if (r < 0.12) {
      c.stop();
      running = false;
      recording = false;
    } else if (r < 0.2) {
      c.startRecording();
      recording = true;
    } else if (r < 0.25) {
      c.stopRecording();
      recording = false;
    } else if (r < 0.6) {
      // A frame of the recording, whole or not, or a call frame.
      const bytes = random() < 0.85 ? stereoFrameBytes : random() < 0.5 ? frameBytes : stereoFrameBytes - 4;
      win?.listener?.({ type: 'record', pcm: new Uint8Array(bytes).fill(step % 250).buffer });
      const taken = records.length > recordsBefore;
      expect(taken).toBe(running && recording && bytes === stereoFrameBytes && win !== null);
      outcomes.add(taken ? 'a frame recorded' : 'a frame left out');
    } else if (r < 0.75) {
      const kind = random() < 0.4 ? 'mic-started' : random() < 0.5 ? 'mic-lost' : 'mic-failed';
      win?.listener?.({ type: kind, reason: 'x' });
      // The microphone is heard of only while the session is recorded.
      expect(mics.length > micsBefore).toBe(running && recording && win !== null);
      if (mics.length > micsBefore) outcomes.add(kind === 'mic-started' ? 'microphone in' : `microphone down (${kind})`);
    } else {
      advance(Math.floor(random() * 12_000));
      const asked = (windows.at(-1)?.recordingStarts ?? 0) - asksBefore;
      if (asked > 0) outcomes.add('microphone asked for again');
      // Asked again only while recorded.
      if (asked > 0) expect(running && recording).toBe(true);
    }

    expect(c.running).toBe(running);
    expect(c.recordingOn).toBe(recording);
    // At most one ask for the microphone waits at a time.
    expect(timers.filter((t) => t.at > now).length).toBeLessThanOrEqual(running ? 2 : 0);
  }
  return outcomes;
}

describe('the deep round over capture while recording (3.12)', () => {
  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('random run %i keeps every rule', (seed) => {
    expect(capture(seed).size).toBeGreaterThan(0);
  });

  it('every outcome happens over the runs', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (const o of capture(seed)) outcomes.add(o);

    expect([...outcomes].sort()).toEqual(
      [
        'a frame recorded',
        'a frame left out',
        'microphone in',
        'microphone down (mic-lost)',
        'microphone down (mic-failed)',
        'microphone asked for again',
      ].sort(),
    );
  });
});
