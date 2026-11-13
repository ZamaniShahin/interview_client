// The hidden capture window (1.11), never shown, with no UI and no network. It turns this computer's sound (the
// output's loopback: the call, as the user hears it) into 24 kHz PCM16 frames of 100 ms, made by the AudioWorklet, and
// sends them to main through the port main handed over. Main starts and stops it, through `window.sottoCapture`.
// While a session is recorded (3.12, Q51), it also opens the microphone, and only then: the call and the microphone go
// through one channel merger in the same graph, on one clock, and come out as stereo frames for the recording.
import { sampleRate } from '../../shared/audio/frames';
import { IpcChannels } from '../../shared/ipc-channels';
import workletUrl from './pcm-worklet.ts?worker&url';

/** What goes back to main; main checks each one (main/capture/audio-capture.ts). */
type ToMain =
  | { type: 'started' }
  | { type: 'frame'; pcm: ArrayBuffer }
  | { type: 'lost'; reason: string }
  | { type: 'failed'; reason: string }
  | { type: 'record'; pcm: ArrayBuffer }
  | { type: 'mic-started' }
  | { type: 'mic-lost'; reason: string }
  | { type: 'mic-failed'; reason: string };

let port: MessagePort | null = null;
let running: { context: AudioContext; stream: MediaStream; source: MediaStreamAudioSourceNode } | null = null;
let starting = false;

/** Whether main wants the session recorded; the microphone is open only while it does. */
let recordingWanted = false;
let micStream: MediaStream | null = null;
let micStarting = false;
/** The recording's part of the graph, on the running context. */
let recording: { merger: ChannelMergerNode; framer: AudioWorkletNode; mic: MediaStreamAudioSourceNode | null } | null =
  null;

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
    const source = context.createMediaStreamSource(stream);
    source.connect(framer);
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
    running = { context, stream, source };
    send({ type: 'started' });
    // A device reopened while the session is recorded: the recording goes on in the new graph.
    connectRecording();
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
  // The microphone stays open across a reopen of the call's device: only the graph goes.
  recording = null;
  for (const track of running.stream.getTracks()) track.stop();
  void running.context.close();
  running = null;
}

/**
 * Records the session (3.12): opens the microphone (the one time it is asked for), then joins the call and it in the
 * running graph. A microphone that can't be had leaves the call recorded alone, its side silent; main asks again later.
 */
async function startRecording(): Promise<void> {
  recordingWanted = true;
  if (!micStream && !micStarting) {
    micStarting = true;
    try {
      // As it is, as the call's sound is taken: the recording keeps the voice as it was said.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      if (!recordingWanted) {
        // Stopped while the device opened.
        for (const track of stream.getTracks()) track.stop();
      } else {
        micStream = stream;
        stream.getAudioTracks()[0]?.addEventListener('ended', () => {
          if (micStream !== stream) return;
          dropMic();
          send({ type: 'mic-lost', reason: 'ended' });
        });
        send({ type: 'mic-started' });
      }
    } catch (error) {
      send({ type: 'mic-failed', reason: error instanceof DOMException ? error.name : 'Error' });
    } finally {
      micStarting = false;
    }
  }
  connectRecording();
}

function stopRecording(): void {
  recordingWanted = false;
  disconnectRecording();
  dropMic();
}

/** Builds the recording's part of the graph on the running context, or adds the microphone to it once it is open. */
function connectRecording(): void {
  if (!running || !recordingWanted) return;
  const { context, source } = running;
  if (!recording) {
    // Two mono inputs (each downmixed by the speaker rules, as the server's frames are): the call, the microphone.
    const merger = context.createChannelMerger(2);
    const framer = new AudioWorkletNode(context, 'sotto-stereo-framer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });
    framer.port.onmessage = (event: MessageEvent<ArrayBuffer>) => send({ type: 'record', pcm: event.data });
    source.connect(merger, 0, 0);
    merger.connect(framer);
    framer.connect(context.destination);
    recording = { merger, framer, mic: null };
  }
  if (micStream && !recording.mic) {
    recording.mic = context.createMediaStreamSource(micStream);
    recording.mic.connect(recording.merger, 0, 1);
  }
}

function disconnectRecording(): void {
  if (!recording) return;
  recording.mic?.disconnect();
  running?.source.disconnect(recording.merger);
  recording.merger.disconnect();
  recording.framer.port.onmessage = null;
  recording.framer.disconnect();
  recording = null;
}

function dropMic(): void {
  if (recording?.mic) {
    recording.mic.disconnect();
    recording.mic = null;
  }
  for (const track of micStream?.getTracks() ?? []) track.stop();
  micStream = null;
}

declare global {
  interface Window {
    /** Main's handle, called with a user gesture (`executeJavaScript(…, true)`), which display media asks for. */
    sottoCapture?: {
      start(): Promise<void>;
      stop(): void;
      startRecording(): Promise<void>;
      stopRecording(): void;
    };
  }
}

window.sottoCapture = { start, stop, startRecording, stopRecording };
