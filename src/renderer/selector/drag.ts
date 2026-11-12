// What a press on the region selector chose (3.6): the area dragged, as fractions of the window, or nothing when it
// was too small to be a drag (v1's 6 px), which makes it a click. Pure, so the tests read it without a page.
import type { Selection } from '../../shared/screenshots';

export interface Point {
  x: number;
  y: number;
}

/** Less movement than this either way is a click, not a drag. */
export const dragMinPx = 6;

/**
 * For this long after the selector shows, presses and releases don't count: a double-click on the screenshot button,
 * or a release that started before the window was there, must never take the whole screen. Shorter than anyone reacts.
 */
export const settleMs = 400;

/** Whether a press or release at `at` (ms) counts, the selector having shown at `shownAt` (null while it hasn't). */
export function pressCounts(at: number, shownAt: number | null): boolean {
  return shownAt !== null && at - shownAt >= settleMs;
}

export function dragArea(
  anchor: Point | null,
  current: Point | null,
  window: { width: number; height: number },
): Extract<Selection, { kind: 'rect' }> | null {
  if (!anchor || !current || window.width <= 0 || window.height <= 0) return null;
  if (Math.abs(current.x - anchor.x) < dragMinPx && Math.abs(current.y - anchor.y) < dragMinPx) return null;
  return {
    kind: 'rect',
    x: Math.min(anchor.x, current.x) / window.width,
    y: Math.min(anchor.y, current.y) / window.height,
    w: Math.abs(current.x - anchor.x) / window.width,
    h: Math.abs(current.y - anchor.y) / window.height,
  };
}
