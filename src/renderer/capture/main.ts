// The hidden capture window (1.11), never shown, with no UI and no network. It turns this computer's sound (the
// output's loopback: the call, as the user hears it) into 24 kHz PCM16 frames of 100 ms, made by the AudioWorklet, and
// sends them to main through the port main handed over. Main starts and stops it, through `window.sottoCapture`.
import { sampleRate } from '../../shared/audio/frames';
import { IpcChannels } from '../../shared/ipc-channels';
import workletUrl from './pcm-worklet.ts?worker&url';

/** What goes back to main; main checks each one (main/capture/audio-capture.ts). */
type ToMain =
  | { type: 'started' }
  | { type: 'frame'; pcm: ArrayBuffer }
  | { type: 'lost'; reason: string }
  | { type: 'failed'; reason: string };

let port: MessagePort | null = null;
let running: { context: AudioContext; stream: MediaStream } | null = null;
let starting = false;

window.addEventListener('message', (event) => {
  // Only the preload's message, from this page's own window, carries the port.
  if (event.source !== window || event.data !== IpcChannels.capturePort || port) return;
  port = event.ports[0] ?? null;
});

/**
 * Copied, never transferred: Electron silently drops a message that transfers a buffer to a port ending in main
 * (checked with scripts/capture-check.mjs, Electron 45), and a frame is only 4.8 KB.
 */
function send(message: ToMain): void {
  port?.postMessage(message);
}

async function start(): Promise<void> {
  if (starting) return;
  starting = true;
  stop();
  let stream: MediaStream | null = null;
  try {
    // Display media is how Chromium offers an output's loopback; main's handler answers with the screen and
    // `audio: 'loopback'`. The picture isn't wanted: its track stops at once. Chromium also cleans the sound up by
    // default, as for a microphone (the capture check found all three on): echo cancellation would take out the very
    // voice this captures, and noise suppression and gain control would change it. The call's sound goes as it is.
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: true,
    });
    for (const track of stream.getVideoTracks()) {
      track.stop();
      stream.removeTrack(track);
    }
    const [audio] = stream.getAudioTracks();
    if (!audio) throw new DOMException('No audio track came with the capture.', 'NotFoundError');

    // The context runs at the server's rate, so Chromium resamples the output (48 kHz, say) on the way in.
    const context = new AudioContext({ sampleRate, latencyHint: 'playback' });
    await context.audioWorklet.addModule(workletUrl);
    // One input channel, mixed down by Web Audio's speaker rules: stereo becomes (L + R) / 2, and 5.1 keeps its centre,
    // where a voice usually sits. The first channel alone would be the front left.
    const framer = new AudioWorkletNode(context, 'sotto-pcm-framer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    framer.port.onmessage = (event: MessageEvent<ArrayBuffer>) => send({ type: 'frame', pcm: event.data });
    context.createMediaStreamSource(stream).connect(framer);
    // Connected so the graph keeps pulling it; it outputs only silence.
    framer.connect(context.destination);
    await context.resume();
    if (context.state !== 'running')
      throw new DOMException(`The audio context is ${context.state}.`, 'InvalidStateError');

    // The device went away (unplugged, switched): main reopens after a moment, as v1 did.
    audio.addEventListener('ended', () => {
      stop();
      send({ type: 'lost', reason: 'ended' });
    });
    running = { context, stream };
    send({ type: 'started' });
  } catch (error) {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stop();
    // The error's name only (NotAllowedError, NotFoundError…): it never carries what was heard.
    send({ type: 'failed', reason: error instanceof DOMException ? error.name : 'Error' });
  } finally {
    starting = false;
  }
}

function stop(): void {
  if (!running) return;
  for (const track of running.stream.getTracks()) track.stop();
  void running.context.close();
  running = null;
}

declare global {
  interface Window {
    /** Main's handle, called with a user gesture (`executeJavaScript(…, true)`), which display media asks for. */
    sottoCapture?: { start(): Promise<void>; stop(): void };
  }
}

window.sottoCapture = { start, stop };
