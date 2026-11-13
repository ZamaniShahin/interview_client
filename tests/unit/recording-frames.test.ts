// The recording's audio before it reaches main (3.12, Q51): the stereo framer the capture window's worklet runs, the
// database migrated to keep recordings, and the overlay's state of the recording.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frameSamples, StereoFramer, stereoFrameBytes, toPcm16 } from '../../src/shared/audio/frames';
import { reduceLive } from '../../src/shared/live/reducer';
import { initialLiveState, type RecordingState } from '../../src/shared/live/view-state';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';

/** A seeded generator (mulberry32). */
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

describe('the stereo framer', () => {
  it('is 100 ms of two channels: 9,600 bytes a frame', () => {
    expect(stereoFrameBytes).toBe(9_600);
  });

  it.each(Array.from({ length: 16 }, (_, i) => i + 1))(
    'random run %i: every sample lands on its side, in order, in whole frames, whatever the blocks',
    (seed) => {
      const random = generator(seed);
      const framer = new StereoFramer();
      const left: number[] = [];
      const right: number[] = [];
      const frames: Int16Array[] = [];
      for (let block = 0; block < 200; block++) {
        // The audio thread's 128, or any other size a block may come in.
        const length = random() < 0.7 ? 128 : Math.floor(random() * 3_000);
        const l = Float32Array.from({ length }, () => random() * 2.2 - 1.1);
        const missing = random() < 0.1 ? (random() < 0.5 ? 'left' : 'right') : null;
        const r = Float32Array.from({ length }, () => random() * 2 - 1);
        frames.push(...framer.push(missing === 'left' ? null : l, missing === 'right' ? null : r));
        for (let i = 0; i < length; i++) {
          // As an Int16Array keeps it: -0 is 0.
          left.push(missing === 'left' ? 0 : toPcm16(l[i]!) | 0);
          right.push(missing === 'right' ? 0 : toPcm16(r[i]!) | 0);
        }
      }

      expect(frames.every((f) => f.length === frameSamples * 2)).toBe(true);
      expect(frames).toHaveLength(Math.floor(left.length / frameSamples));
      const out = frames.flatMap((f) => [...f]);
      for (let i = 0; i < out.length / 2; i++) {
        expect(out[2 * i]).toBe(left[i]);
        expect(out[2 * i + 1]).toBe(right[i]);
      }
    },
  );

  it('makes a channel that brings no data silent, and a channel shorter than the other silent past its end', () => {
    const framer = new StereoFramer();

    const frames = framer.push(new Float32Array(frameSamples).fill(0.5), Float32Array.from({ length: 10 }, () => -0.5));

    expect(frames).toHaveLength(1);
    expect(frames[0]![0]).toBe(toPcm16(0.5));
    expect(frames[0]![1]).toBe(toPcm16(-0.5));
    expect(frames[0]![21]).toBe(0);
    expect(new StereoFramer().push(null, null)).toEqual([]);
  });

  it('clips what goes past full scale, and reads what is no number as silence', () => {
    const framer = new StereoFramer();
    const left = new Float32Array(frameSamples);
    const right = new Float32Array(frameSamples);
    left[0] = 3;
    right[0] = -3;
    left[1] = Number.NaN;
    right[1] = Number.POSITIVE_INFINITY;

    const [frame] = framer.push(left, right);

    expect([...frame!.slice(0, 4)]).toEqual([32_767, -32_768, 0, 0]);
  });
});

describe('the database, migrated to keep recordings (migration 5)', () => {
  it('keeps every interview it held, with no recording, and takes recordings from then on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sotto-migrate-'));
    try {
      const file = join(dir, 'sotto.db');
      const key = 'ab'.repeat(32);
      const old = openDatabase(file, key, migrations.slice(0, 4));
      const id = new LocalStore(old).history.start({ startedAt: 1, candidate: 'Sam', role: 'Payments', tier: null });
      old
        .prepare('INSERT INTO qa (interview_id, asked_at, kind, question, answer) VALUES (?, ?, 1, ?, ?)')
        .run(id, new Date(1).toISOString(), 'Why?', 'Because.');
      old.close();

      const db = openDatabase(file, key, migrations);
      const store = new LocalStore(db);

      expect(db.pragma('user_version', { simple: true })).toBe(5);
      expect(store.history.list()).toEqual([expect.objectContaining({ id, answers: 1, recordingSeconds: null })]);
      store.history.startRecording(id, '0123456789abcdef01234567.srec', 2);
      store.history.finishRecording(id, 12.5);
      expect(store.history.list()[0]!.recordingSeconds).toBe(12.5);
      expect(() => store.history.startRecording(id, 'another.srec', 3)).toThrow();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a recording of negative length, and a file two interviews would share', () => {
    const db = openDatabase(null, null, migrations);
    const store = new LocalStore(db);
    const a = store.history.start({ startedAt: 1, candidate: '', role: '', tier: null });
    const b = store.history.start({ startedAt: 2, candidate: '', role: '', tier: null });
    store.history.startRecording(a, 'same.srec', 1);

    expect(() => store.history.startRecording(b, 'same.srec', 2)).toThrow();
    expect(() => store.history.finishRecording(a, -1)).toThrow();
  });
});

describe("the overlay's state of the recording", () => {
  it.each<RecordingState>(['on', 'call-only', 'off'])('takes main\'s word: %s', (state) => {
    expect(reduceLive({ ...initialLiveState, phase: 'live' }, { type: 'recording', state }).recording).toBe(state);
  });

  it('starts off, and a new session starts it off again', () => {
    expect(initialLiveState.recording).toBe('off');
    const recorded = reduceLive(initialLiveState, { type: 'recording', state: 'on' });
    expect(reduceLive(recorded, { type: 'starting' }).recording).toBe('off');
  });

  it("is this computer's: nothing from the server changes it", () => {
    const recorded = reduceLive({ ...initialLiveState, phase: 'live' }, { type: 'recording', state: 'on' });
    const after = reduceLive(recorded, {
      type: 'event',
      event: { name: 'status', e: { Seq: 1, AtMs: 1, Auto: false, Paused: true, Stt: 'ok', InterviewType: 'intro' } },
    });
    expect(after.recording).toBe('on');
    expect(reduceLive(after, { type: 'connectionLost' }).recording).toBe('on');
  });
});
