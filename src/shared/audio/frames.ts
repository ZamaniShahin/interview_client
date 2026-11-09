// The interviewer's audio as the server takes it (backend docs/02 §4): mono PCM16 at 24 kHz, in 100 ms frames of
// 4,800 bytes, as v1's audio_capture.py made them. Pure: no DOM and no Electron, so the capture window's AudioWorklet,
// main and the tests all run this same code.

/** Samples a second: what OpenAI's realtime transcription takes, and what the server expects. */
export const sampleRate = 24_000;

/** 100 ms of samples. */
export const frameSamples = 2_400;

/** A frame's size on the wire: two bytes a sample. */
export const frameBytes = frameSamples * 2;

/** A float sample (−1…1) as a PCM16 one, clipped; anything that isn't a number reads as silence. */
export function toPcm16(sample: number): number {
  const s = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

/**
 * Collects samples and hands out whole frames. Audio arrives in blocks that don't divide 100 ms evenly (the audio
 * thread's are 128 samples), so what's left over waits for the next block.
 */
export class PcmFramer {
  private frame = new Int16Array(frameSamples);
  private filled = 0;

  push(samples: Float32Array): Int16Array[] {
    const frames: Int16Array[] = [];
    for (const sample of samples) {
      this.frame[this.filled++] = toPcm16(sample);
      if (this.filled === frameSamples) {
        frames.push(this.frame);
        this.frame = new Int16Array(frameSamples);
        this.filled = 0;
      }
    }
    return frames;
  }
}

/** A frame's loudness as RMS, 0…1 of full scale. */
export function rms(frame: Int16Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return Math.sqrt(sum / frame.length) / 32_768;
}

/** How full the meter reads for a frame, 0…1: −60 dBFS and quieter is empty, full scale is full. */
export function meterLevel(frame: Int16Array): number {
  const r = rms(frame);
  if (r <= 0) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(r) + 60) / 60));
}

/**
 * Below this a frame is no sound at all (about −54 dBFS). An output with nothing playing gives digital silence, and a
 * call's line noise sits well above it, so this tells "the call isn't reaching Sotto" from "the interviewer is quiet".
 */
export const silenceRms = 0.002;

/** Whether a frame carries any sound. */
export function hasSound(frame: Int16Array): boolean {
  return rms(frame) >= silenceRms;
}
