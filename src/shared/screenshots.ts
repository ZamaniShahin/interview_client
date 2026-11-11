// Screenshots (3.6): what the overlay, the region selector and main say about them. The images stay in main, in
// memory: none is written to disk, and the server never sends one back (backend docs/02 §7), so the client keeps its
// own copy of each, to show it and to attach it again after the session moves to another server.
import { z } from 'zod';

/** The client's own name for a screenshot, which the server's events use too: at most 40 characters (the contract). */
export const screenshotIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

/** The note that goes with a screenshot answered at once, as the server takes it (`ScreenshotQueryRequest.Hint`). */
export const screenshotHintMaxChars = 500;

/**
 * What the selector page answers: a click takes the whole display, a drag an area (as fractions of the display, so
 * zoom and scaling don't matter), and Esc or a right-click nothing. Main checks it: the page is untrusted input.
 */
export const selectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('full') }).strict(),
  z.object({ kind: z.literal('rect'), x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict(),
  z.object({ kind: z.literal('cancel') }).strict(),
]);
export type Selection = z.infer<typeof selectionSchema>;

/** An area of the display as fractions of it: each in 0…1, never past the display's edge. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

const unit = (n: number) => Math.min(1, Math.max(0, n));

/** A dragged area brought inside the display: a page can only ever cut out what it was shown. */
export function areaOf(selection: Extract<Selection, { kind: 'rect' }>): Area {
  const x = unit(selection.x);
  const y = unit(selection.y);
  return { x, y, w: Math.min(1 - x, Math.max(0, selection.w)), h: Math.min(1 - y, Math.max(0, selection.h)) };
}

/** The frozen display the selector paints: a JPEG, as a data URL (the pages' CSP takes `data:` images only). */
export interface SelectorFrame {
  image: string;
  width: number;
  height: number;
}

/** Why a capture made no screenshot, as main reports it; `cancelled` is the user's own choice and says nothing. */
export type CaptureFailure = 'cancelled' | 'busy' | 'too_soon' | 'blank' | 'failed' | 'full';

/** The overlay's words for a capture that made nothing (v1's, made calmer); none for a cancel. */
export const captureFailureText: Record<Exclude<CaptureFailure, 'cancelled'>, string> = {
  busy: 'A screenshot is already being taken.',
  too_soon: 'Wait a moment between screenshots.',
  blank: 'The screenshot came out blank: a locked screen, or protected content.',
  failed: "Couldn't take the screenshot. Try again.",
  full: 'This question has all the screenshots it can take. Answer it, or remove one.',
};

/** A client code for each capture failure, in `CommandResult.code`: never one of the server's. */
export function captureCode(failure: CaptureFailure): string {
  return `capture_${failure}`;
}
