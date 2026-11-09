// The call's sound, from the hidden capture window to the session (1.11). Main starts capture when a session starts
// and stops it when the session ends. It checks every message the window sends, hands each frame to the session's
// driver (which uploads it, 1.12), and tells the overlay how capture is going: the meter's level, the no-sound
// warning (Q18), and whether the device is down while it reopens (after 1.5 s, as v1 did).
import { frameBytes, hasSound, meterLevel } from '../../shared/audio/frames';
import { idleCapture, type CaptureStatus } from '../../shared/live/view-state';
import { NoSoundWatch } from './no-sound-watch';

/** What the capture window sends back over its port; anything else is dropped. */
export type CaptureMessage =
  | { type: 'started' }
  | { type: 'frame'; pcm: ArrayBuffer }
  | { type: 'lost'; reason: string }
  | { type: 'failed'; reason: string };

/** The hidden window, as the controller drives it; a fake stands in for it in tests. */
export interface CaptureChannel {
  start(): void;
  stop(): void;
  onMessage(listener: (message: unknown) => void): void;
  close(): void;
}

export interface AudioCaptureDependencies {
  /** Opens the hidden window and its port (windows/capture-window.ts). */
  open: () => CaptureChannel;
  /** A frame of the call's sound, 4,800 bytes of PCM16, and when it was captured (Unix ms). */
  onFrame: (pcm: Uint8Array, capturedAtMs: number) => void;
  onStatus: (status: CaptureStatus) => void;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  /** v1's pause before reopening a device. */
  reopenAfterMs?: number;
  /** How often the meter moves, and the no-sound warning is checked. */
  tickMs?: number;
}

export class AudioCapture {
  private channel: CaptureChannel | null = null;
  private reopenTimer: unknown = null;
  private tickTimer: unknown = null;
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
    this.tick();
  }

  stop(): void {
    // Already stopped: nothing to report, or a caller reacting to the idle status would loop.
    if (!this.channel && this.status === idleCapture) return;
    this.clear('reopen');
    this.clear('tick');
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
    }
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

  private clear(which: 'reopen' | 'tick'): void {
    const timer = which === 'reopen' ? this.reopenTimer : this.tickTimer;
    if (timer === null) return;
    (this.deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>)))(timer);
    if (which === 'reopen') this.reopenTimer = null;
    else this.tickTimer = null;
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
      return { type: m['type'], reason: typeof m['reason'] === 'string' ? m['reason'].slice(0, 64) : 'unknown' };
    default:
      return null;
  }
}
