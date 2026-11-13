// The call's sound, from the hidden capture window to the session (1.11). Main starts capture when a session starts
// and stops it when the session ends. It checks every message the window sends, hands each frame to the session's
// driver (which uploads it, 1.12), and tells the overlay how capture is going: the meter's level, the no-sound
// warning (Q18), and whether the device is down while it reopens (after 1.5 s, as v1 did). While a session is
// recorded (3.12, Q51), the window also opens the microphone and sends the recording's stereo frames, which go to the
// recorder; a microphone that is lost is asked for again after 1.5 s, one that is refused after 10 s.
import { frameBytes, hasSound, meterLevel, stereoFrameBytes } from '../../shared/audio/frames';
import { idleCapture, type CaptureStatus } from '../../shared/live/view-state';
import { NoSoundWatch } from './no-sound-watch';

/** What the capture window sends back over its port; anything else is dropped. */
export type CaptureMessage =
  | { type: 'started' }
  | { type: 'frame'; pcm: ArrayBuffer }
  | { type: 'lost'; reason: string }
  | { type: 'failed'; reason: string }
  | { type: 'record'; pcm: ArrayBuffer }
  | { type: 'mic-started' }
  | { type: 'mic-lost'; reason: string }
  | { type: 'mic-failed'; reason: string };

/** The hidden window, as the controller drives it; a fake stands in for it in tests. */
export interface CaptureChannel {
  start(): void;
  stop(): void;
  /** Opens the microphone and sends the recording's frames (3.12). */
  startRecording(): void;
  stopRecording(): void;
  onMessage(listener: (message: unknown) => void): void;
  close(): void;
}

/** Whether the recording has the microphone: on, or the call alone while it can't be had. */
export type MicState = 'on' | 'down';

export interface AudioCaptureDependencies {
  /** Opens the hidden window and its port (windows/capture-window.ts). */
  open: () => CaptureChannel;
  /** A frame of the call's sound, 4,800 bytes of PCM16, and when it was captured (Unix ms). */
  onFrame: (pcm: Uint8Array, capturedAtMs: number) => void;
  onStatus: (status: CaptureStatus) => void;
  /** A frame of the recording, 9,600 bytes of stereo PCM16: the call on the left, the microphone on the right. */
  onRecord?: (pcm: Uint8Array) => void;
  /** The microphone opened, or was lost or refused, while the session is recorded. */
  onMic?: (state: MicState) => void;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  /** v1's pause before reopening a device; the microphone's too, when it was lost. */
  reopenAfterMs?: number;
  /** The pause before asking again for a microphone that was refused, or isn't there. */
  micRetryMs?: number;
  /** How often the meter moves, and the no-sound warning is checked. */
  tickMs?: number;
}

export class AudioCapture {
  private channel: CaptureChannel | null = null;
  private reopenTimer: unknown = null;
  private tickTimer: unknown = null;
  private micTimer: unknown = null;
  /** The session is recorded: the window keeps the microphone open and sends the recording's frames. */
  private recording = false;
  private readonly watch = new NoSoundWatch();
  private status: CaptureStatus = idleCapture;
  /** The loudest frame since the meter last moved. */
  private peak: number | null = null;

  constructor(private readonly deps: AudioCaptureDependencies) {}

  get running(): boolean {
    return this.channel !== null;
  }

  start(): void {
    if (this.channel) return;
    const channel = this.deps.open();
    this.channel = channel;
    channel.onMessage((message) => {
      // A message from a window already closed (a late frame) changes nothing.
      if (this.channel === channel) this.receive(parse(message));
    });
    this.watch.opened(this.now());
    channel.start();
    if (this.recording) channel.startRecording();
    this.tick();
  }

  get recordingOn(): boolean {
    return this.recording;
  }

  /** Records the session from now on (3.12): the microphone is asked for, and only now. Before start, from its start. */
  startRecording(): void {
    if (this.recording) return;
    this.recording = true;
    this.channel?.startRecording();
  }

  /** Stops recording: the microphone closes. Capture of the call goes on. */
  stopRecording(): void {
    if (!this.recording) return;
    this.recording = false;
    this.clear('mic');
    this.channel?.stopRecording();
  }

  stop(): void {
    // Already stopped: nothing to report, or a caller reacting to the idle status would loop.
    if (!this.channel && this.status === idleCapture) return;
    this.clear('reopen');
    this.clear('tick');
    this.clear('mic');
    // The recording ends with the capture: a next session decides anew.
    this.recording = false;
    const channel = this.channel;
    this.channel = null;
    channel?.stop();
    channel?.close();
    this.watch.closed();
    this.peak = null;
    this.setStatus(idleCapture);
  }

  private receive(message: CaptureMessage | null): void {
    if (!message) return;
    switch (message.type) {
      case 'started':
        this.watch.opened(this.now());
        this.setStatus({ ...this.status, down: false, noSound: false });
        return;

      case 'frame': {
        const pcm = new Uint8Array(message.pcm);
        // Only a whole frame is a frame: the server reads 100 ms at a time (backend docs/03 §6).
        if (pcm.byteLength !== frameBytes) return;
        const capturedAtMs = this.now();
        this.deps.onFrame(pcm, capturedAtMs);
        const samples = new Int16Array(message.pcm);
        this.peak = Math.max(this.peak ?? 0, meterLevel(samples));
        const noSound = this.watch.frame(hasSound(samples), capturedAtMs);
        if (noSound !== this.status.noSound) this.setStatus({ ...this.status, noSound });
        return;
      }

      case 'lost':
      case 'failed':
        this.setStatus({ level: null, noSound: false, down: true });
        this.reopen();
        return;

      case 'record': {
        // Only while recording, and only a whole frame: anything else is left out of the file.
        if (!this.recording || message.pcm.byteLength !== stereoFrameBytes) return;
        this.deps.onRecord?.(new Uint8Array(message.pcm));
        return;
      }

      case 'mic-started':
        if (!this.recording) return;
        this.clear('mic');
        this.deps.onMic?.('on');
        return;

      case 'mic-lost':
      case 'mic-failed':
        if (!this.recording) return;
        this.deps.onMic?.('down');
        this.retryMic(message.type === 'mic-lost' ? (this.deps.reopenAfterMs ?? 1_500) : (this.deps.micRetryMs ?? 10_000));
        return;
    }
  }

  /** The microphone again, after a pause, while the session is still recorded: a headset plugged back in is heard. */
  private retryMic(ms: number): void {
    if (this.micTimer !== null) return;
    this.micTimer = this.timer(() => {
      this.micTimer = null;
      if (this.recording) this.channel?.startRecording();
    }, ms);
  }

  /** v1: a short pause, then the device again. It repeats until capture starts or the session ends. */
  private reopen(): void {
    if (this.reopenTimer !== null) return;
    this.reopenTimer = this.timer(() => {
      this.reopenTimer = null;
      this.channel?.start();
    }, this.deps.reopenAfterMs ?? 1_500);
  }

  /** Moves the meter to the loudest frame since the last tick, and checks for no sound when no frame comes. */
  private tick(): void {
    this.tickTimer = this.timer(() => {
      this.tickTimer = null;
      if (!this.channel) return;
      const level = this.status.down ? null : (this.peak ?? (this.status.level === null ? null : 0));
      this.peak = null;
      const noSound = !this.status.down && this.watch.warning(this.now());
      if (level !== this.status.level || noSound !== this.status.noSound)
        this.setStatus({ ...this.status, level, noSound });
      this.tick();
    }, this.deps.tickMs ?? 200);
  }

  private setStatus(status: CaptureStatus): void {
    this.status = status;
    this.deps.onStatus(status);
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private timer(callback: () => void, ms: number): unknown {
    return (this.deps.setTimer ?? ((cb: () => void, delay: number) => setTimeout(cb, delay)))(callback, ms);
  }

  private clear(which: 'reopen' | 'tick' | 'mic'): void {
    const timer = which === 'reopen' ? this.reopenTimer : which === 'tick' ? this.tickTimer : this.micTimer;
    if (timer === null) return;
    (this.deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>)))(timer);
    if (which === 'reopen') this.reopenTimer = null;
    else if (which === 'tick') this.tickTimer = null;
    else this.micTimer = null;
  }
}

/** The capture window is a renderer: everything it sends is checked, and anything unexpected is dropped. */
export function parse(message: unknown): CaptureMessage | null {
  if (typeof message !== 'object' || message === null) return null;
  const m = message as Record<string, unknown>;
  switch (m['type']) {
    case 'started':
      return { type: 'started' };
    case 'frame':
      return m['pcm'] instanceof ArrayBuffer ? { type: 'frame', pcm: m['pcm'] } : null;
    case 'lost':
    case 'failed':
    case 'mic-lost':
    case 'mic-failed':
      return { type: m['type'], reason: typeof m['reason'] === 'string' ? m['reason'].slice(0, 64) : 'unknown' };
    case 'record':
      return m['pcm'] instanceof ArrayBuffer ? { type: 'record', pcm: m['pcm'] } : null;
    case 'mic-started':
      return { type: 'mic-started' };
    default:
      return null;
  }
}
