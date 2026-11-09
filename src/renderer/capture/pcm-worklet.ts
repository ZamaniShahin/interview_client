// Runs on the audio thread (1.11): the call's sound in, already at 24 kHz (the AudioContext's rate), 100 ms PCM16
// frames out to the capture page. Each frame's buffer is transferred, not copied. It writes nothing to its output, so
// the graph plays silence: no sound during a live session (CLAUDE.md, rule 9).
import { PcmFramer } from '../../shared/audio/frames';

/** One render quantum of silence: Chromium's blocks are 128 samples. */
const quiet = new Float32Array(128);

class PcmFramerProcessor extends AudioWorkletProcessor {
  private readonly framer = new PcmFramer();

  override process(inputs: Float32Array[][]): boolean {
    // The first channel, as v1 took it: an interviewer's voice is the same in both. With nothing playing, Windows'
    // loopback can deliver no data at all, and the input has no channel: that is silence, and it is framed as such,
    // so frames keep coming ten a second and the server hears the quiet that ends a question.
    const channel = inputs[0]?.[0] ?? quiet;
    for (const frame of this.framer.push(channel)) this.port.postMessage(frame.buffer, [frame.buffer]);
    return true;
  }
}

registerProcessor('sotto-pcm-framer', PcmFramerProcessor);
