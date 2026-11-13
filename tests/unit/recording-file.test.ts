// The recording's file (3.12, Q51): stereo PCM16 sealed a second at a time with AES-256-GCM, each second bound to its
// file and its place; read back in order up to any damage; written out as a WAV only when asked.
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chunkBytes,
  exportWav,
  headerBytes,
  recordingAudio,
  recordingChannels,
  recordingRate,
  recordingSeconds,
  RecordingWriter,
  stereoFrameBytes,
  wavHeader,
} from '../../src/main/recording/recording-file';

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

/** Stereo PCM16 of `frames` sample frames, every byte drawn from the generator. */
function audio(random: () => number, frames: number): Uint8Array {
  return Uint8Array.from({ length: frames * stereoFrameBytes }, () => Math.floor(random() * 256));
}

const read = (path: string, key: Buffer) => Buffer.concat([...recordingAudio(path, key)]);

/** Where each chunk starts in the file, by walking the lengths. */
function chunkStarts(path: string): number[] {
  const bytes = readFileSync(path);
  const starts: number[] = [];
  for (let at = headerBytes; at + 4 <= bytes.length; ) {
    starts.push(at);
    at += 4 + 12 + bytes.readUInt32LE(at) + 16;
  }
  return starts;
}

let dir: string;
let key: Buffer;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sotto-recording-'));
  key = randomBytes(32);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a recording written and read back', () => {
  it.each(Array.from({ length: 24 }, (_, i) => i + 1))(
    'random run %i: what was written reads back whole, in order, however it was cut into appends',
    (seed) => {
      const random = generator(seed);
      const path = join(dir, `r${seed}.srec`);
      const writer = RecordingWriter.create(path, key);
      const written: Uint8Array[] = [];
      const appends = 1 + Math.floor(random() * 40);
      for (let i = 0; i < appends; i++) {
        // From a single sample frame to more than a chunk at once.
        const frames = 1 + Math.floor(random() * (random() < 0.2 ? 40_000 : 3_000));
        const pcm = audio(random, frames);
        writer.append(pcm);
        written.push(pcm);
      }
      const total = written.reduce((n, w) => n + w.length, 0);
      expect(writer.seconds).toBeCloseTo(total / chunkBytes, 9);

      const seconds = writer.close();

      expect(seconds).toBeCloseTo(total / chunkBytes, 9);
      expect(read(path, key).equals(Buffer.concat(written))).toBe(true);
      expect(recordingSeconds(path)).toBeCloseTo(seconds, 9);
      // Whole seconds sealed as they filled, the rest in one last chunk.
      expect(chunkStarts(path)).toHaveLength(Math.ceil(total / chunkBytes));
    },
  );

  it('keeps what waits for its chunk out of the file until it fills or the recording closes', () => {
    const path = join(dir, 'r.srec');
    const writer = RecordingWriter.create(path, key);

    writer.append(new Uint8Array(chunkBytes - stereoFrameBytes));
    expect(statSync(path).size).toBe(headerBytes);
    expect(writer.sealedSeconds).toBe(0);

    writer.append(new Uint8Array(stereoFrameBytes * 2));
    expect(writer.sealedSeconds).toBe(1);
    expect(writer.seconds).toBeCloseTo(1 + stereoFrameBytes / chunkBytes, 9);

    expect(writer.close()).toBeCloseTo(1 + stereoFrameBytes / chunkBytes, 9);
    expect(chunkStarts(path)).toHaveLength(2);
  });

  it('copies what it is given: the caller may reuse its buffer', () => {
    const path = join(dir, 'r.srec');
    const writer = RecordingWriter.create(path, key);
    const buffer = new Uint8Array(stereoFrameBytes * 10).fill(1);

    writer.append(buffer);
    buffer.fill(2);
    writer.close();

    expect([...read(path, key)].every((b) => b === 1)).toBe(true);
  });

  it('takes only whole stereo frames, and nothing once closed; closing twice is harmless', () => {
    const writer = RecordingWriter.create(join(dir, 'r.srec'), key);

    expect(() => writer.append(new Uint8Array(6))).toThrow();
    writer.append(new Uint8Array(0));
    expect(writer.close()).toBe(0);
    expect(writer.close()).toBe(0);
    expect(writer.open).toBe(false);
    expect(() => writer.append(new Uint8Array(4))).toThrow();
  });

  it('never writes over a file that is there, and refuses a key of the wrong size', () => {
    const path = join(dir, 'there.srec');
    writeFileSync(path, 'kept');

    expect(() => RecordingWriter.create(path, key)).toThrow();
    expect(readFileSync(path, 'utf8')).toBe('kept');
    expect(() => RecordingWriter.create(join(dir, 'new.srec'), randomBytes(16))).toThrow();
    expect(existsSync(join(dir, 'new.srec'))).toBe(false);
  });

  it('an empty recording is a header and nothing else, 0 seconds long', () => {
    const path = join(dir, 'r.srec');
    RecordingWriter.create(path, key).close();

    expect(statSync(path).size).toBe(headerBytes);
    expect(recordingSeconds(path)).toBe(0);
    expect(read(path, key).length).toBe(0);
  });
});

describe('a recording that was changed, cut short or mixed up', () => {
  /** A recording of `seconds` whole seconds, each second filled with its own number. */
  function recording(name: string, seconds: number, withKey = key): string {
    const path = join(dir, name);
    const writer = RecordingWriter.create(path, withKey);
    for (let s = 0; s < seconds; s++) writer.append(new Uint8Array(chunkBytes).fill(s + 1));
    writer.close();
    return path;
  }

  const seconds = (path: string, withKey = key) => [...recordingAudio(path, withKey)].map((c) => c[0]);

  it.each([0, 1, 2, 4])('reads up to a chunk whose audio was changed, here the chunk %i, and no further', (bad) => {
    const path = recording('r.srec', 5);
    const bytes = readFileSync(path);
    const at = chunkStarts(path)[bad]! + 4 + 12 + 100;
    bytes[at] = bytes[at]! ^ 0x01;
    writeFileSync(path, bytes);

    expect(seconds(path)).toEqual([1, 2, 3, 4, 5].slice(0, bad));
  });

  it.each([
    ['its nonce', 4],
    ['its tag', 4 + 12 + chunkBytes],
  ])('reads up to a chunk whose %s was changed', (_, offset) => {
    const path = recording('r.srec', 3);
    const bytes = readFileSync(path);
    const at = chunkStarts(path)[1]! + offset;
    bytes[at] = bytes[at]! ^ 0x80;
    writeFileSync(path, bytes);

    expect(seconds(path)).toEqual([1]);
  });

  it('reads up to the first of two chunks swapped: each is bound to its place', () => {
    const path = recording('r.srec', 4);
    const bytes = readFileSync(path);
    const [, second, third, fourth] = chunkStarts(path);
    const swapped = Buffer.concat([
      bytes.subarray(0, second),
      bytes.subarray(third!, fourth),
      bytes.subarray(second!, third),
      bytes.subarray(fourth!),
    ]);
    writeFileSync(path, swapped);

    expect(seconds(path)).toEqual([1]);
  });

  it("reads up to a chunk taken from another recording, even one sealed with the same key at the same place", () => {
    const mine = recording('mine.srec', 3);
    const theirs = recording('theirs.srec', 3);
    const a = readFileSync(mine);
    const b = readFileSync(theirs);
    const [, second, third] = chunkStarts(mine);
    writeFileSync(mine, Buffer.concat([a.subarray(0, second), b.subarray(second!, third), a.subarray(third!)]));

    expect(seconds(mine)).toEqual([1]);
  });

  it('gives nothing under another key', () => {
    const path = recording('r.srec', 2);

    expect(seconds(path, randomBytes(32))).toEqual([]);
  });

  it.each([1, 17, chunkBytes / 2, chunkBytes + 31])(
    'an app that quit mid-chunk (cut %i bytes into the last one) leaves every whole second before it',
    (into) => {
      const path = recording('r.srec', 3);
      truncateSync(path, chunkStarts(path)[2]! + into);

      expect(seconds(path)).toEqual([1, 2]);
      expect(recordingSeconds(path)).toBe(2);
    },
  );

  it.each([
    ['another magic', 0, 0x41],
    ['a newer version', 4, 2],
    ['another channel count', 5, 1],
  ])('is not a recording with %s', (_, at, value) => {
    const path = recording('r.srec', 1);
    const bytes = readFileSync(path);
    bytes[at] = value;
    writeFileSync(path, bytes);

    expect(recordingSeconds(path)).toBeNull();
    expect(() => read(path, key)).toThrow('not a Sotto recording');
  });

  it('a file that is missing, empty or something else is no recording', () => {
    writeFileSync(join(dir, 'empty.srec'), '');
    writeFileSync(join(dir, 'text.srec'), 'just some text, not a recording at all');

    expect(recordingSeconds(join(dir, 'missing.srec'))).toBeNull();
    expect(recordingSeconds(join(dir, 'empty.srec'))).toBeNull();
    expect(recordingSeconds(join(dir, 'text.srec'))).toBeNull();
  });

  it('a chunk whose length is out of bounds ends the recording there', () => {
    const path = recording('r.srec', 3);
    const bytes = readFileSync(path);
    bytes.writeUInt32LE(chunkBytes + 4, chunkStarts(path)[1]!);
    writeFileSync(path, bytes);

    expect(recordingSeconds(path)).toBe(1);
    expect(seconds(path)).toEqual([1]);
  });
});

describe('a recording saved as a WAV', () => {
  it('has the header a player reads: PCM, 2 channels, 24 kHz, 16 bits, and the lengths', () => {
    const header = wavHeader(96_000);

    expect(header.toString('ascii', 0, 4)).toBe('RIFF');
    expect(header.readUInt32LE(4)).toBe(36 + 96_000);
    expect(header.toString('ascii', 8, 16)).toBe('WAVEfmt ');
    expect(header.readUInt32LE(16)).toBe(16);
    expect(header.readUInt16LE(20)).toBe(1);
    expect(header.readUInt16LE(22)).toBe(recordingChannels);
    expect(header.readUInt32LE(24)).toBe(recordingRate);
    expect(header.readUInt32LE(28)).toBe(recordingRate * 4);
    expect(header.readUInt16LE(32)).toBe(4);
    expect(header.readUInt16LE(34)).toBe(16);
    expect(header.toString('ascii', 36, 40)).toBe('data');
    expect(header.readUInt32LE(40)).toBe(96_000);
  });

  it.each([0, 1, 2, 7])('writes %i random appends as the same audio after its header', (seed) => {
    const random = generator(100 + seed);
    const source = join(dir, 'r.srec');
    const writer = RecordingWriter.create(source, key);
    const written = audio(random, Math.floor(random() * 60_000));
    writer.append(written);
    writer.close();

    const target = join(dir, 'Interview.wav');
    const seconds = exportWav(source, key, target);
    const wav = readFileSync(target);

    expect(seconds).toBeCloseTo(written.length / chunkBytes, 9);
    expect(wav.subarray(0, 44).equals(wavHeader(written.length))).toBe(true);
    expect(wav.subarray(44).equals(Buffer.from(written))).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(['Interview.wav', 'r.srec']);
  });

  it('replaces a file of the same name the user chose', () => {
    const source = join(dir, 'r.srec');
    const writer = RecordingWriter.create(source, key);
    writer.append(new Uint8Array(stereoFrameBytes * 3).fill(9));
    writer.close();
    const target = join(dir, 'there.wav');
    writeFileSync(target, 'old');

    exportWav(source, key, target);

    expect(readFileSync(target).length).toBe(44 + stereoFrameBytes * 3);
  });

  it('leaves nothing behind when the source is no recording', () => {
    const source = join(dir, 'fake.srec');
    writeFileSync(source, 'not a recording');
    const target = join(dir, 'out.wav');

    expect(() => exportWav(source, key, target)).toThrow();
    expect(existsSync(target)).toBe(false);
    expect(existsSync(`${target}.part`)).toBe(false);
  });
});
