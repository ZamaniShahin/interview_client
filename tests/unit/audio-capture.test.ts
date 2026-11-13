import { describe, expect, it } from 'vitest';
import { AudioCapture, parse, type CaptureChannel, type MicState } from '../../src/main/capture/audio-capture';
import { frameBytes, frameSamples, stereoFrameBytes } from '../../src/shared/audio/frames';
import { idleCapture, type CaptureStatus } from '../../src/shared/live/view-state';

/** Plays the hidden capture window: the test sends what the page would send. */
class FakeWindow implements CaptureChannel {
  starts = 0;
  stops = 0;
  recordingStarts = 0;
  recordingStops = 0;
  closed = false;
  private listener: ((message: unknown) => void) | null = null;

  start(): void {
    this.starts++;
  }

  stop(): void {
    this.stops++;
  }

  startRecording(): void {
    this.recordingStarts++;
  }

  stopRecording(): void {
    this.recordingStops++;
  }

  onMessage(listener: (message: unknown) => void): void {
    this.listener = listener;
  }

  close(): void {
    this.closed = true;
  }

  send(message: unknown): void {
    this.listener?.(message);
  }
}

/** A frame of a sine at `amplitude` (0 gives digital silence), as the page sends it. */
function frame(amplitude: number): { type: 'frame'; pcm: ArrayBuffer } {
  const samples = Int16Array.from({ length: frameSamples }, (_, i) => Math.round(amplitude * 32_767 * Math.sin(i / 5)));
  return { type: 'frame', pcm: samples.buffer };
}

/** A clock and timers the test moves by hand. */
function harness() {
  let now = 1_000_000;
  let timers: { at: number; callback: () => void; id: number }[] = [];
  let nextId = 0;
  const windows: FakeWindow[] = [];
  const frames: { bytes: number; at: number }[] = [];
  const statuses: CaptureStatus[] = [];
  const records: Uint8Array[] = [];
  const mics: MicState[] = [];

  const capture = new AudioCapture({
    open: () => {
      const win = new FakeWindow();
      windows.push(win);
      return win;
    },
    onFrame: (pcm, at) => frames.push({ bytes: pcm.byteLength, at }),
    onStatus: (status) => statuses.push(status),
    onRecord: (pcm) => records.push(pcm),
    onMic: (state) => mics.push(state),
    now: () => now,
    setTimer: (callback, ms) => {
      const timer = { at: now + ms, callback, id: nextId++ };
      timers.push(timer);
      return timer.id;
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
      due.callback();
    }
    now = until;
  };

  return {
    capture,
    windows,
    frames,
    statuses,
    records,
    mics,
    advance,
    last: () => statuses.at(-1) ?? idleCapture,
    timers: () => timers.length,
  };
}

describe("capturing the call's sound in main (1.11)", () => {
  it('opens the hidden window when a session starts, and closes it when it ends', () => {
    const h = harness();

    h.capture.start();
    expect(h.windows).toHaveLength(1);
    expect(h.windows[0]!.starts).toBe(1);
    expect(h.capture.running).toBe(true);

    h.capture.stop();
    expect(h.windows[0]).toMatchObject({ stops: 1, closed: true });
    expect(h.capture.running).toBe(false);
    expect(h.last()).toEqual(idleCapture);
  });

  it('hands every whole frame to the session, stamped with when it was captured', () => {
    const h = harness();
    h.capture.start();
    h.windows[0]!.send({ type: 'started' });

    h.windows[0]!.send(frame(0.3));
    h.windows[0]!.send(frame(0.3));

    expect(h.frames).toEqual([
      { bytes: frameBytes, at: 1_000_000 },
      { bytes: frameBytes, at: 1_000_000 },
    ]);
  });

  it('drops anything that is not a whole frame or a known message', () => {
    const h = harness();
    h.capture.start();
    const win = h.windows[0]!;

    win.send({ type: 'frame', pcm: new ArrayBuffer(100) });
    win.send({ type: 'frame', pcm: 'not audio' });
    win.send({ type: 'frame' });
    win.send({ type: 'shell', command: 'calc' });
    win.send('frame');
    win.send(null);

    expect(h.frames).toHaveLength(0);
  });

  it('moves the meter to the loudest frame, five times a second', () => {
    const h = harness();
    h.capture.start();
    const win = h.windows[0]!;
    win.send({ type: 'started' });

    win.send(frame(0.05));
    win.send(frame(0.5));
    h.advance(200);
    const loud = h.last().level!;
    win.send(frame(0.05));
    h.advance(200);
    const quieter = h.last().level!;

    expect(loud).toBeGreaterThan(0.8);
    expect(quieter).toBeLessThan(loud);
  });

  it('drops the meter to zero when frames stop, and keeps it still before the first one', () => {
    const h = harness();
    h.capture.start();
    h.advance(400);
    expect(h.last().level).toBeNull();

    h.windows[0]!.send(frame(0.5));
    h.advance(200);
    h.advance(200);
    expect(h.last().level).toBe(0);
  });

  it('warns after 20 s of nothing heard, and stops warning once something is', () => {
    const h = harness();
    h.capture.start();
    const win = h.windows[0]!;
    win.send({ type: 'started' });

    for (let i = 0; i < 199; i++) {
      win.send(frame(0));
      h.advance(100);
    }
    expect(h.last().noSound).toBe(false);
    win.send(frame(0));
    h.advance(200);
    expect(h.last().noSound).toBe(true);

    win.send(frame(0.2));
    expect(h.last().noSound).toBe(false);
  });

  it('warns even when no frame comes at all', () => {
    const h = harness();
    h.capture.start();

    h.advance(20_200);

    expect(h.last().noSound).toBe(true);
  });

  it('reopens a lost device after 1.5 s, as v1 did, saying it is down meanwhile', () => {
    const h = harness();
    h.capture.start();
    const win = h.windows[0]!;
    win.send({ type: 'started' });

    win.send({ type: 'lost', reason: 'ended' });
    expect(h.last()).toMatchObject({ down: true, level: null });
    h.advance(1_499);
    expect(win.starts).toBe(1);
    h.advance(1);
    expect(win.starts).toBe(2);

    win.send({ type: 'started' });
    expect(h.last().down).toBe(false);
  });

  it('keeps trying a refused device every 1.5 s, until the session ends', () => {
    const h = harness();
    h.capture.start();
    const win = h.windows[0]!;

    for (let attempt = 0; attempt < 3; attempt++) {
      win.send({ type: 'failed', reason: 'NotAllowedError' });
      h.advance(1_500);
    }
    expect(win.starts).toBe(4);

    h.capture.stop();
    win.send({ type: 'failed', reason: 'NotAllowedError' });
    h.advance(10_000);
    expect(win.starts).toBe(4);
  });

  it('ignores a late message from a window it already closed', () => {
    const h = harness();
    h.capture.start();
    const old = h.windows[0]!;
    h.capture.stop();
    h.capture.start();

    old.send(frame(0.5));

    expect(h.frames).toHaveLength(0);
  });

  it('reports nothing when stopped twice, so a listener reacting to the idle status cannot loop', () => {
    const h = harness();
    h.capture.start();
    h.capture.stop();
    const reports = h.statuses.length;

    h.capture.stop();
    h.capture.stop();

    expect(h.statuses).toHaveLength(reports);
  });
});

describe('what main accepts from the capture window', () => {
  it.each([
    [{ type: 'started' }, { type: 'started' }],
    [
      { type: 'lost', reason: 'ended' },
      { type: 'lost', reason: 'ended' },
    ],
    [
      { type: 'failed', reason: 42 },
      { type: 'failed', reason: 'unknown' },
    ],
    [
      { type: 'failed', reason: 'x'.repeat(500) },
      { type: 'failed', reason: 'x'.repeat(64) },
    ],
  ])('reads %j as %j', (message, parsed) => {
    expect(parse(message)).toEqual(parsed);
  });

  it.each([null, undefined, 'started', 42, {}, { type: 'frame', pcm: [1, 2] }, { type: 'eval', code: '1' }])(
    'drops %j',
    (message) => {
      expect(parse(message)).toBeNull();
    },
  );
});

/** A stereo frame of the recording, as the page sends it: `fill` in every byte. */
function stereo(fill = 7, bytes = stereoFrameBytes): { type: 'record'; pcm: ArrayBuffer } {
  return { type: 'record', pcm: new Uint8Array(bytes).fill(fill).buffer };
}

describe('the recording in main (3.12)', () => {
  it('asks the window for the microphone only once recording is on, and from the start when it was on before', () => {
    const h = harness();
    h.capture.start();
    expect(h.windows[0]!.recordingStarts).toBe(0);

    h.capture.startRecording();
    h.capture.startRecording();
    expect(h.windows[0]!.recordingStarts).toBe(1);
    expect(h.capture.recordingOn).toBe(true);

    h.capture.stop();
    // A stopped capture records nothing more: the next session decides anew.
    expect(h.capture.recordingOn).toBe(false);
    h.capture.startRecording();
    h.capture.start();
    expect(h.windows[1]!.recordingStarts).toBe(1);
  });

  it('forgets a recording asked for before a capture that never started, so the next one opens no microphone', () => {
    // Found by the deep round: stop() returned early when nothing ran, and kept the recording for the next capture,
    // which may be the sound check's.
    const h = harness();
    h.capture.startRecording();

    h.capture.stop();
    h.capture.start();

    expect(h.capture.recordingOn).toBe(false);
    expect(h.windows[0]!.recordingStarts).toBe(0);
  });

  it('hands only whole stereo frames to the recorder, and only while recording', () => {
    const h = harness();
    h.capture.start();
    h.windows[0]!.send(stereo());
    expect(h.records).toHaveLength(0);

    h.capture.startRecording();
    h.windows[0]!.send(stereo(1));
    h.windows[0]!.send(stereo(2, stereoFrameBytes - 4));
    h.windows[0]!.send(stereo(3, frameBytes));
    h.windows[0]!.send(stereo(4));
    expect(h.records.map((r) => [r.byteLength, r[0]])).toEqual([
      [stereoFrameBytes, 1],
      [stereoFrameBytes, 4],
    ]);
    // Recording frames never reach the session's upload.
    expect(h.frames).toHaveLength(0);

    h.capture.stopRecording();
    h.windows[0]!.send(stereo(5));
    expect(h.records).toHaveLength(2);
    expect(h.windows[0]!.recordingStops).toBe(1);
  });

  it('says when the microphone is in, and asks again 1.5 s after it is lost, 10 s after it is refused', () => {
    const h = harness();
    h.capture.start();
    h.capture.startRecording();
    const win = h.windows[0]!;

    win.send({ type: 'mic-started' });
    win.send({ type: 'mic-lost', reason: 'ended' });
    expect(h.mics).toEqual(['on', 'down']);
    h.advance(1_499);
    expect(win.recordingStarts).toBe(1);
    h.advance(1);
    expect(win.recordingStarts).toBe(2);

    win.send({ type: 'mic-failed', reason: 'NotAllowedError' });
    h.advance(9_999);
    expect(win.recordingStarts).toBe(2);
    h.advance(1);
    expect(win.recordingStarts).toBe(3);
    expect(h.mics).toEqual(['on', 'down', 'down']);
  });

  it('asks only once at a time, and not at all once recording stops or the capture ends', () => {
    const h = harness();
    h.capture.start();
    h.capture.startRecording();
    const win = h.windows[0]!;

    win.send({ type: 'mic-failed', reason: 'NotFoundError' });
    win.send({ type: 'mic-lost', reason: 'ended' });
    h.advance(10_000);
    expect(win.recordingStarts).toBe(2);

    win.send({ type: 'mic-lost', reason: 'ended' });
    h.capture.stopRecording();
    h.advance(10_000);
    expect(win.recordingStarts).toBe(2);

    h.capture.startRecording();
    win.send({ type: 'mic-lost', reason: 'ended' });
    h.capture.stop();
    h.advance(10_000);
    expect(win.recordingStarts).toBe(3);
  });

  it('ignores what the microphone says while nothing is recorded', () => {
    const h = harness();
    h.capture.start();

    h.windows[0]!.send({ type: 'mic-started' });
    h.windows[0]!.send({ type: 'mic-failed', reason: 'NotAllowedError' });
    h.advance(20_000);

    expect(h.mics).toEqual([]);
    expect(h.windows[0]!.recordingStarts).toBe(0);
  });

  it.each([
    [{ type: 'record', pcm: new ArrayBuffer(8) }, { type: 'record', pcm: new ArrayBuffer(8) }],
    [{ type: 'mic-started', extra: 1 }, { type: 'mic-started' }],
    [{ type: 'mic-lost', reason: 'x'.repeat(100) }, { type: 'mic-lost', reason: 'x'.repeat(64) }],
    [{ type: 'mic-failed' }, { type: 'mic-failed', reason: 'unknown' }],
    [{ type: 'record', pcm: [1, 2] }, null],
    [{ type: 'record' }, null],
  ])('reads %j from the window as %j', (message, read) => {
    expect(parse(message)).toEqual(read);
  });
});
