// A recording on this computer (3.12, Q51): the call and the microphone, stereo PCM16 at 24 kHz, the call on the left.
// Kept encrypted, as everything kept here is (docs/01-product.md): one second at a time, sealed with AES-256-GCM under
// the recordings' own key, each second bound to its file and its place in it, so none can be changed, moved or taken
// from another recording. A WAV is written from it only when the user asks to save one, where they choose.
//
// The file: a 32-byte header (`SREC`, version, channels, rate, the chunk size, the recording's random id), then chunks,
// each its length (4 bytes, little-endian), its nonce (12), the sealed audio, and the tag (16). An app that quits
// mid-chunk leaves a cut-off last chunk, which reads as the end.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { closeSync, fstatSync, openSync, readSync, renameSync, rmSync, writeSync } from 'node:fs';

export const recordingRate = 24_000;
export const recordingChannels = 2;
/** Bytes of one stereo PCM16 sample frame. */
export const stereoFrameBytes = recordingChannels * 2;
/** One second of audio: what each chunk seals. */
export const chunkBytes = recordingRate * stereoFrameBytes;

const magic = Buffer.from('SREC', 'ascii');
const version = 1;
export const headerBytes = 32;
const lengthBytes = 4;
const nonceBytes = 12;
const tagBytes = 16;
const keyBytes = 32;

function makeHeader(id: Buffer): Buffer {
  const header = Buffer.alloc(headerBytes);
  magic.copy(header, 0);
  header.writeUInt8(version, 4);
  header.writeUInt8(recordingChannels, 5);
  header.writeUInt32LE(recordingRate, 8);
  header.writeUInt32LE(chunkBytes, 12);
  id.copy(header, 16);
  return header;
}

/** A header this app wrote, or null: another file, or a newer app's. */
function readHeader(header: Buffer): Buffer | null {
  if (header.length !== headerBytes || !header.subarray(0, 4).equals(magic)) return null;
  if (header.readUInt8(4) !== version || header.readUInt8(5) !== recordingChannels) return null;
  if (header.readUInt32LE(8) !== recordingRate || header.readUInt32LE(12) !== chunkBytes) return null;
  return header;
}

/** What each chunk is bound to: its file's header (and so its id) and its place. */
function boundTo(header: Buffer, index: number): Buffer {
  const place = Buffer.alloc(4);
  place.writeUInt32LE(index);
  return Buffer.concat([header, place]);
}

function checkKey(key: Buffer): void {
  if (key.length !== keyBytes) throw new Error('A recording key is 32 bytes.');
}

/** Writes a recording, a second at a time. Not safe to share between callers: the recorder owns one. */
export class RecordingWriter {
  private readonly pending: Buffer[] = [];
  private pendingBytes = 0;
  private index = 0;
  private written = 0;
  private fd: number | null;

  private constructor(
    fd: number,
    private readonly header: Buffer,
    private readonly key: Buffer,
  ) {
    this.fd = fd;
  }

  /** A new recording at `path`; never over an existing file. */
  static create(path: string, key: Buffer): RecordingWriter {
    checkKey(key);
    const header = makeHeader(randomBytes(16));
    const fd = openSync(path, 'wx');
    try {
      writeSync(fd, header);
    } catch (error) {
      closeSync(fd);
      rmSync(path, { force: true });
      throw error;
    }
    return new RecordingWriter(fd, header, key);
  }

  /** The audio kept so far, in seconds, what is still waiting for its chunk included. */
  get seconds(): number {
    return (this.written + this.pendingBytes) / chunkBytes;
  }

  /** The audio sealed and written so far, in seconds: what the file holds whatever happens next. */
  get sealedSeconds(): number {
    return this.written / chunkBytes;
  }

  get open(): boolean {
    return this.fd !== null;
  }

  /** More stereo PCM16; whole seconds are sealed and written as they fill. */
  append(pcm: Uint8Array): void {
    if (this.fd === null) throw new Error('The recording is closed.');
    if (pcm.byteLength % stereoFrameBytes !== 0) throw new Error('Stereo PCM16 comes in 4-byte frames.');
    if (pcm.byteLength === 0) return;
    // Copied: the caller may reuse its buffer.
    this.pending.push(Buffer.from(pcm));
    this.pendingBytes += pcm.byteLength;
    while (this.pendingBytes >= chunkBytes) this.seal(chunkBytes);
  }

  /** Seals what is left (part of a second) and closes the file; the seconds kept. Closing twice is harmless. */
  close(): number {
    if (this.fd === null) return this.written / chunkBytes;
    try {
      if (this.pendingBytes > 0) this.seal(this.pendingBytes);
    } finally {
      closeSync(this.fd);
      this.fd = null;
    }
    return this.written / chunkBytes;
  }

  private seal(bytes: number): void {
    const all = Buffer.concat(this.pending, this.pendingBytes);
    const plain = all.subarray(0, bytes);
    const rest = all.subarray(bytes);
    const nonce = randomBytes(nonceBytes);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(boundTo(this.header, this.index));
    const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
    const length = Buffer.alloc(lengthBytes);
    length.writeUInt32LE(plain.length);
    writeSync(this.fd!, Buffer.concat([length, nonce, sealed, cipher.getAuthTag()]));
    this.index += 1;
    this.written += plain.length;
    this.pending.length = 0;
    this.pendingBytes = 0;
    if (rest.length > 0) {
      this.pending.push(Buffer.from(rest));
      this.pendingBytes = rest.length;
    }
  }
}

/** Reads `count` bytes at `position`, or fewer at the file's end. */
function readAt(fd: number, count: number, position: number): Buffer {
  const buffer = Buffer.alloc(count);
  let got = 0;
  while (got < count) {
    const n = readSync(fd, buffer, got, count - got, position + got);
    if (n === 0) break;
    got += n;
  }
  return buffer.subarray(0, got);
}

/** The chunks' places, by their lengths alone: what a cut-off or damaged file still holds before its damage. */
function* chunkPlaces(fd: number, size: number): Generator<{ index: number; at: number; length: number }> {
  let at = headerBytes;
  for (let index = 0; at + lengthBytes <= size; index++) {
    const length = readAt(fd, lengthBytes, at).readUInt32LE(0);
    if (length === 0 || length > chunkBytes || length % stereoFrameBytes !== 0) return;
    const end = at + lengthBytes + nonceBytes + length + tagBytes;
    if (end > size) return;
    yield { index, at, length };
    at = end;
  }
}

/** How long a recording is, from its chunks' lengths, without its key; null for a file that isn't one. */
export function recordingSeconds(path: string): number | null {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return null;
  }
  try {
    const size = fstatSync(fd).size;
    if (!readHeader(readAt(fd, headerBytes, 0))) return null;
    let bytes = 0;
    for (const place of chunkPlaces(fd, size)) bytes += place.length;
    return bytes / chunkBytes;
  } finally {
    closeSync(fd);
  }
}

/**
 * The recording's audio, a second at a time, in order. It stops at the first chunk that doesn't open (the end an app
 * that quit left, or damage): what came before is still the recording. Throws for a file that isn't a recording.
 */
export function* recordingAudio(path: string, key: Buffer): Generator<Buffer> {
  checkKey(key);
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const header = readHeader(readAt(fd, headerBytes, 0));
    if (!header) throw new Error('This file is not a Sotto recording.');
    for (const { index, at, length } of chunkPlaces(fd, size)) {
      const record = readAt(fd, nonceBytes + length + tagBytes, at + lengthBytes);
      const decipher = createDecipheriv('aes-256-gcm', key, record.subarray(0, nonceBytes));
      decipher.setAAD(boundTo(header, index));
      decipher.setAuthTag(record.subarray(nonceBytes + length));
      let plain: Buffer;
      try {
        plain = Buffer.concat([decipher.update(record.subarray(nonceBytes, nonceBytes + length)), decipher.final()]);
      } catch {
        return;
      }
      yield plain;
    }
  } finally {
    closeSync(fd);
  }
}

/** A WAV header for `dataBytes` of stereo PCM16 at 24 kHz. */
export function wavHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(recordingChannels, 22);
  header.writeUInt32LE(recordingRate, 24);
  header.writeUInt32LE(recordingRate * stereoFrameBytes, 28);
  header.writeUInt16LE(stereoFrameBytes, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

/**
 * Writes the recording as a stereo WAV at `target`: beside it first, then moved over, so a failure never leaves half a
 * file under the name the user chose. The seconds written.
 */
export function exportWav(source: string, key: Buffer, target: string): number {
  const temporary = `${target}.part`;
  const fd = openSync(temporary, 'w');
  let data = 0;
  try {
    writeSync(fd, wavHeader(0));
    for (const chunk of recordingAudio(source, key)) {
      writeSync(fd, chunk);
      data += chunk.length;
    }
    // The lengths, now known.
    writeSync(fd, wavHeader(data), 0, 44, 0);
  } catch (error) {
    closeSync(fd);
    rmSync(temporary, { force: true });
    throw error;
  }
  closeSync(fd);
  renameSync(temporary, target);
  return data / chunkBytes;
}
