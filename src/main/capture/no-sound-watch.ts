// When to say the call's sound isn't reaching Sotto (Q18, 2026-11-09): v1's silent failure was "no captions and no
// errors" when the call played on a device nobody was capturing.
//
// The warning is about the device, not about silence: an interviewer listening to a long answer is quiet too. So it
// comes only while nothing at all has been heard since capture opened, after `afterMs`. Once any sound arrives the
// device works, and later quiet is normal. A reopened capture (a device switched) starts the watch over.

export const noSoundAfterMs = 20_000;

export class NoSoundWatch {
  private openedAt: number | null = null;
  private heard = false;

  constructor(private readonly afterMs = noSoundAfterMs) {}

  /** Capture (re)opened: the device may be a different one, so nothing heard counts yet. */
  opened(nowMs: number): void {
    this.openedAt = nowMs;
    this.heard = false;
  }

  closed(): void {
    this.openedAt = null;
  }

  /** A frame arrived, with or without sound; answers whether to warn now. */
  frame(sound: boolean, nowMs: number): boolean {
    if (sound) this.heard = true;
    return this.warning(nowMs);
  }

  /** Whether to warn now: asked on a timer too, since a stalled capture sends no frames at all. */
  warning(nowMs: number): boolean {
    return this.openedAt !== null && !this.heard && nowMs - this.openedAt >= this.afterMs;
  }
}
