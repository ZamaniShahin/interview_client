import { describe, expect, it } from 'vitest';
import {
  frameBytes,
  frameSamples,
  hasSound,
  meterLevel,
  PcmFramer,
  rms,
  sampleRate,
  silenceRms,
  toPcm16,
} from '../../src/shared/audio/frames';

/** `n` samples of a sine at `amplitude` (0…1 of full scale). */
function sine(n: number, amplitude: number, hz = 440): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate));
}

describe('the frames the server takes', () => {
  it('are 100 ms of 24 kHz mono PCM16: 4,800 bytes', () => {
    expect(sampleRate).toBe(24_000);
    expect(frameSamples).toBe(2_400);
    expect(frameBytes).toBe(4_800);
  });

  it.each([
    [0, 0],
    [1, 32_767],
    [-1, -32_768],
    [0.5, 16_384],
    [-0.5, -16_384],
    [2, 32_767],
    [-7, -32_768],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('turns the float sample %f into %i', (sample, pcm) => {
    expect(toPcm16(sample)).toBe(pcm);
  });

  it("hand out whole frames only, keeping what's left for the next block", () => {
    const framer = new PcmFramer();
    // The audio thread's blocks are 128 samples: 18 of them make 2,304, short of a frame.
    let frames: Int16Array[] = [];
    for (let block = 0; block < 18; block++) frames = frames.concat(framer.push(sine(128, 0.5)));
    expect(frames).toHaveLength(0);

    frames = framer.push(sine(128, 0.5));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.length).toBe(frameSamples);
    expect(frames[0]!.byteLength).toBe(frameBytes);
  });

  it('carry every sample across frames, in order', () => {
    const framer = new PcmFramer();
    const ramp = Float32Array.from({ length: 5_000 }, (_, i) => (i % 2_000) / 2_000 - 0.5);

    const frames = framer.push(ramp);

    expect(frames).toHaveLength(2);
    const joined = [...frames[0]!, ...frames[1]!];
    expect(joined).toEqual(Array.from(ramp.slice(0, 4_800), toPcm16));
  });

  it('never hand out the same buffer twice, so a transferred frame stays intact', () => {
    const framer = new PcmFramer();
    const [first] = framer.push(sine(frameSamples, 0.3));
    const [second] = framer.push(sine(frameSamples, 0.6));
    expect(first!.buffer).not.toBe(second!.buffer);
  });
});

describe('how loud a frame is', () => {
  const frameOf = (amplitude: number) => new PcmFramer().push(sine(frameSamples, amplitude))[0]!;

  it('reads silence as nothing', () => {
    const silent = new Int16Array(frameSamples);
    expect(rms(silent)).toBe(0);
    expect(meterLevel(silent)).toBe(0);
    expect(hasSound(silent)).toBe(false);
  });

  it('reads a full-scale sine near the top of the meter', () => {
    const loud = frameOf(1);
    expect(rms(loud)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(meterLevel(loud)).toBeGreaterThan(0.9);
  });

  it('reads speech-like levels in the middle of the meter', () => {
    // About −20 dBFS RMS.
    expect(meterLevel(frameOf(0.14))).toBeGreaterThan(0.55);
    expect(meterLevel(frameOf(0.14))).toBeLessThan(0.75);
  });

  it('grows with the sound, and stays between 0 and 1', () => {
    const levels = [0.001, 0.01, 0.05, 0.2, 0.8].map((a) => meterLevel(frameOf(a)));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('tells a quiet line from no sound at all', () => {
    // About −40 dBFS: a call's line noise, or a quiet voice.
    expect(hasSound(frameOf(0.014))).toBe(true);
    // A few least-significant bits of dither: an idle output.
    expect(hasSound(Int16Array.from({ length: frameSamples }, (_, i) => (i % 2 ? 2 : -2)))).toBe(false);
    expect(silenceRms).toBeLessThan(0.01);
  });
});
