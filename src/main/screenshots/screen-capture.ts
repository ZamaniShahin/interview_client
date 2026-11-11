// Taking a screenshot (3.6, v1's capture-screen): the display under the pointer, frozen into the region selector
// where the selector stays out of a screen share, the chosen area cut out and encoded. It fails soft: a capture that
// goes wrong never leaves a window over the screen, and says why in words (shared/screenshots.ts).
import { areaOf, type CaptureFailure, type Selection } from '../../shared/screenshots';
import { cutOut, encodeShot, isBlank, type EncodedShot, type ShotImage } from './shot-image';

export type CaptureOutcome = { ok: true; shot: EncodedShot } | { ok: false; failure: CaptureFailure };

/** What a capture needs from Electron, so the tests can stand in for it. `D` is a display. */
export interface CaptureDependencies<D> {
  /** The display under the pointer: the one the user is looking at. */
  display(): D;
  /** Its picture at full resolution; throws when it can't be had. */
  grab(display: D): Promise<ShotImage>;
  /** The region selector over the frozen picture: what was chosen, or null when it was cancelled or couldn't show. */
  select(display: D, picture: ShotImage): Promise<Selection | null>;
  /** The selector stays out of a share here (Windows 10 2004 and later); elsewhere the whole display is taken. */
  selectorSupported(): boolean;
  /** Where content protection can't leave the overlay out of a capture, hides it for the grab; how to show it again. */
  hideForGrab?(): Promise<(() => void) | null>;
  now?(): number;
}

/** At least this long between screenshots: rapid repeats get "wait a moment" rather than more captures (v1). */
export const minGapMs = 1_500;

export class ScreenCapture<D> {
  private busy = false;
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly deps: CaptureDependencies<D>) {}

  async capture(): Promise<CaptureOutcome> {
    const now = this.deps.now ?? Date.now;
    if (this.busy) return { ok: false, failure: 'busy' };
    if (now() - this.lastAt < minGapMs) return { ok: false, failure: 'too_soon' };
    this.busy = true;
    try {
      const display = this.deps.display();
      const restore = (await this.deps.hideForGrab?.()) ?? null;
      let picture: ShotImage;
      try {
        picture = await this.deps.grab(display);
      } finally {
        restore?.();
      }
      if (picture.isEmpty()) return { ok: false, failure: 'failed' };
      if (isBlank(picture)) return { ok: false, failure: 'blank' };
      if (this.deps.selectorSupported()) {
        const choice = await this.deps.select(display, picture);
        if (!choice || choice.kind === 'cancel') return { ok: false, failure: 'cancelled' };
        if (choice.kind === 'rect') picture = cutOut(picture, areaOf(choice));
      }
      const shot = encodeShot(picture);
      return shot ? { ok: true, shot } : { ok: false, failure: 'failed' };
    } catch {
      return { ok: false, failure: 'failed' };
    } finally {
      this.busy = false;
      // The gap counts from the end of the last capture, as v1 counted it.
      this.lastAt = now();
    }
  }
}
