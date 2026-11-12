import { describe, expect, it } from 'vitest';
import {
  cutOut,
  encodeShot,
  isBlank,
  maxShotBytes,
  maxShotEdge,
  minAreaPx,
} from '../../src/main/screenshots/shot-image';
import { minGapMs, ScreenCapture, type CaptureDependencies } from '../../src/main/screenshots/screen-capture';
import { ScreenshotShelf } from '../../src/main/screenshots/screenshot-shelf';
import { overlayCommandSchema } from '../../src/shared/ipc';
import { areaOf, captureCode, screenshotIdSchema, selectionSchema, type Selection } from '../../src/shared/screenshots';
import { dragArea, dragMinPx, pressCounts, settleMs } from '../../src/renderer/selector/drag';
import { FakeImage } from './fake-image';

describe('a screenshot picture (3.6, v1 shot)', () => {
  it.each([
    [0, true],
    [7, true],
    [8, false],
    [200, false],
  ])('reads a display filled with %i as blank: %s (a lock screen or protected video captures black)', (fill, blank) => {
    expect(isBlank(new FakeImage(1920, 1080, fill))).toBe(blank);
  });

  it('reads one lit pixel on black as a real picture', () => {
    const onePixel = (w: number, h: number) => {
      const b = new Uint8Array(w * h * 4);
      b[4 * 5 + 2] = 255;
      return b;
    };
    expect(isBlank(new FakeImage(1920, 1080, 0, undefined, onePixel))).toBe(false);
  });

  it('cuts the area out in the display’s own pixels', () => {
    const picture = new FakeImage(2000, 1000);

    const cut = cutOut(picture, { x: 0.25, y: 0.5, w: 0.5, h: 0.25 });

    expect(picture.crops).toEqual([{ x: 500, y: 500, width: 1000, height: 250 }]);
    expect(cut.getSize()).toEqual({ width: 1000, height: 250 });
  });

  it('never cuts past the display’s edge', () => {
    const picture = new FakeImage(1000, 1000);
    cutOut(picture, { x: 0.9, y: 0.95, w: 0.5, h: 0.5 });
    expect(picture.crops).toEqual([{ x: 900, y: 950, width: 100, height: 50 }]);
  });

  it.each([
    [minAreaPx - 1, 100, true],
    [100, minAreaPx - 1, true],
    [minAreaPx, minAreaPx, false],
  ])('takes the whole display for a sliver (%i × %i px): %s', (w, h, whole) => {
    const picture = new FakeImage(1000, 1000);
    const cut = cutOut(picture, { x: 0.1, y: 0.1, w: w / 1000, h: h / 1000 });
    expect(cut === picture).toBe(whole);
  });

  it('keeps a small picture as PNG, the crispest text', () => {
    const shot = encodeShot(new FakeImage(800, 600))!;
    expect(shot).toMatchObject({ mime: 'image/png', width: 800, height: 600 });
    expect(shot.bytes.length).toBe(800 * 600 * 0.5);
    expect(Object.getPrototypeOf(shot.bytes)).toBe(Uint8Array.prototype);
  });

  it('caps the long edge at 2,048 pixels, keeping the shape', () => {
    const shot = encodeShot(new FakeImage(4096, 2304))!;
    expect(shot).toMatchObject({ width: maxShotEdge, height: 1152 });
  });

  it('falls back to JPEG at the best quality that fits, then shrinks once more', () => {
    // PNG at a byte a pixel is 2.36 MB; JPEG at 85 and 75 still too much, at 65 1.53 MB, within 1.5 × 1024².
    const jpeg = encodeShot(new FakeImage(2048, 1152, 200, { png: 1, jpeg: 1 }))!;
    expect(jpeg).toMatchObject({ mime: 'image/jpeg', width: 2048, height: 1152 });
    expect(jpeg.bytes.length).toBe(Math.round(2048 * 1152 * 0.65));

    const shrunk = encodeShot(new FakeImage(2048, 1152, 200, { png: 2, jpeg: 1.5 }))!;
    expect(shrunk).toMatchObject({ width: 1536, height: 864 });
    expect(shrunk.bytes.length).toBeLessThanOrEqual(maxShotBytes);
  });

  it('gives up on a picture nothing makes small enough, and on an empty one', () => {
    expect(encodeShot(new FakeImage(2048, 1152, 200, { png: 50, jpeg: 50 }))).toBeNull();
    expect(encodeShot(new FakeImage(0, 0))).toBeNull();
  });

  it('never makes more than 1.5 MB, whatever the size and weight', () => {
    for (const [w, h] of [
      [640, 480],
      [1920, 1080],
      [3840, 2160],
      [5120, 1440],
      [1080, 1920],
    ] as const) {
      for (const weight of [0.1, 0.5, 1, 2, 3]) {
        const shot = encodeShot(new FakeImage(w, h, 200, { png: weight * 2, jpeg: weight }));
        if (!shot) continue;
        expect(shot.bytes.length).toBeLessThanOrEqual(maxShotBytes);
        expect(Math.max(shot.width, shot.height)).toBeLessThanOrEqual(maxShotEdge);
      }
    }
  });
});

describe('taking a screenshot (3.6, v1 capture-screen)', () => {
  function capture(
    over: Partial<CaptureDependencies<string>> & { picture?: FakeImage; selection?: Selection | null } = {},
  ) {
    let clock = 10_000;
    const calls: string[] = [];
    const deps: CaptureDependencies<string> = {
      display: () => 'display-1',
      grab: async (display) => {
        calls.push(`grab ${display}`);
        return over.picture ?? new FakeImage(2000, 1000);
      },
      select: async () => {
        calls.push('select');
        return over.selection === undefined ? { kind: 'full' } : over.selection;
      },
      selectorSupported: () => true,
      now: () => clock,
      ...over,
    };
    return { capturer: new ScreenCapture(deps), calls, later: (ms: number) => (clock += ms) };
  }

  it('freezes the display under the pointer into the selector and takes what was chosen', async () => {
    const { capturer, calls } = capture({ selection: { kind: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 } });

    const taken = await capturer.capture();

    expect(calls).toEqual(['grab display-1', 'select']);
    expect(taken).toMatchObject({ ok: true, shot: { width: 1000, height: 500 } });
  });

  it('takes the whole display for a click', async () => {
    expect(await capture().capturer.capture()).toMatchObject({ ok: true, shot: { width: 2000, height: 1000 } });
  });

  it('takes the whole display, with no selector, where the selector could show in a share', async () => {
    const { capturer, calls } = capture({ selectorSupported: () => false });
    expect(await capturer.capture()).toMatchObject({ ok: true, shot: { width: 2000, height: 1000 } });
    expect(calls).toEqual(['grab display-1']);
  });

  it.each([
    ['a cancel', { kind: 'cancel' } as Selection],
    ['no selector at all', null],
  ])('makes nothing of %s', async (_what, selection) => {
    expect(await capture({ selection }).capturer.capture()).toEqual({ ok: false, failure: 'cancelled' });
  });

  it('says a black picture is blank, and an empty or failed grab failed', async () => {
    expect(await capture({ picture: new FakeImage(100, 100, 0) }).capturer.capture()).toEqual({
      ok: false,
      failure: 'blank',
    });
    expect(await capture({ picture: new FakeImage(0, 0) }).capturer.capture()).toEqual({
      ok: false,
      failure: 'failed',
    });
    const failing = capture({ grab: async () => Promise.reject(new Error('timed out')) });
    expect(await failing.capturer.capture()).toEqual({ ok: false, failure: 'failed' });
  });

  it('says busy while one is under way, and wait a moment right after one', async () => {
    let release: () => void = () => {};
    let selecting: () => void = () => {};
    const selectorShows = new Promise<void>((resolve) => (selecting = resolve));
    let selections = 0;
    const { capturer, later } = capture({
      // The first selection is held open until released; any after it answers at once.
      select: () =>
        selections++ > 0
          ? Promise.resolve({ kind: 'full' as const })
          : new Promise((resolve) => {
              release = () => resolve({ kind: 'full' });
              selecting();
            }),
    });

    const first = capturer.capture();
    await selectorShows;
    expect(await capturer.capture()).toEqual({ ok: false, failure: 'busy' });
    release();
    expect(await first).toMatchObject({ ok: true });

    expect(await capturer.capture()).toEqual({ ok: false, failure: 'too_soon' });
    later(minGapMs);
    expect(await capturer.capture()).toMatchObject({ ok: true });
  });

  it('shows the overlay again after the grab, even one that failed', async () => {
    let restored = 0;
    const { capturer } = capture({
      hideForGrab: async () => () => (restored += 1),
      grab: async () => Promise.reject(new Error('no screen')),
    });
    await capturer.capture();
    expect(restored).toBe(1);
  });
});

describe('the session’s screenshots, kept in memory (3.6)', () => {
  const shot = { bytes: Uint8Array.of(1, 2, 3), mime: 'image/png' as const, width: 2, height: 2 };

  it('names each with an id the server takes, never twice', () => {
    const shelf = new ScreenshotShelf(() => 1_800_000_000_000);
    const ids = Array.from({ length: 50 }, () => shelf.keep(shot));
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(screenshotIdSchema.safeParse(id).success).toBe(true);
  });

  it('draws one as a data URL of its own type, and nothing for one let go', () => {
    const shelf = new ScreenshotShelf();
    const id = shelf.keep({ ...shot, mime: 'image/jpeg' });
    expect(shelf.dataUrl(id)).toBe('data:image/jpeg;base64,AQID');
    shelf.drop(id);
    expect(shelf.dataUrl(id)).toBeNull();
    expect(shelf.get(id)).toBeNull();
  });

  it('lets nothing go while within its limit', () => {
    const shelf = new ScreenshotShelf(Date.now, 3);
    const ids = [shelf.keep(shot), shelf.keep(shot), shelf.keep(shot)];
    shelf.prune([]);
    expect(ids.every((id) => shelf.get(id))).toBe(true);
  });

  it('over its limit, lets the oldest go that nothing uses, until within it', () => {
    const shelf = new ScreenshotShelf(Date.now, 2);
    const [a, b, c, d] = [shelf.keep(shot), shelf.keep(shot), shelf.keep(shot), shelf.keep(shot)];
    shelf.prune([a]);
    expect([a, b, c, d].map((id) => shelf.get(id) !== null)).toEqual([true, false, false, true]);
  });

  it('keeps everything in use, past its limit if it must', () => {
    const shelf = new ScreenshotShelf(Date.now, 1);
    const ids = [shelf.keep(shot), shelf.keep(shot), shelf.keep(shot)];
    shelf.prune(ids);
    expect(shelf.size).toBe(3);
  });

  it('lets everything go at the end', () => {
    const shelf = new ScreenshotShelf();
    shelf.keep(shot);
    shelf.clear();
    expect(shelf.size).toBe(0);
  });
});

describe("what the selector page may answer (3.6: it's untrusted input)", () => {
  it.each([
    [{ kind: 'full' }, true],
    [{ kind: 'cancel' }, true],
    [{ kind: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, true],
    [{ kind: 'rect', x: 0.1, y: 0.2, w: 0.3 }, false],
    [{ kind: 'rect', x: '0.1', y: 0.2, w: 0.3, h: 0.4 }, false],
    [{ kind: 'rect', x: Number.NaN, y: 0.2, w: 0.3, h: 0.4 }, false],
    [{ kind: 'rect', x: Number.POSITIVE_INFINITY, y: 0.2, w: 0.3, h: 0.4 }, false],
    [{ kind: 'full', extra: 1 }, false],
    [{ kind: 'everything' }, false],
    [null, false],
    ['full', false],
  ])('takes %j: %s', (value, valid) => {
    expect(selectionSchema.safeParse(value).success).toBe(valid);
  });

  it('brings any area inside the display', () => {
    expect(areaOf({ kind: 'rect', x: -1, y: 2, w: 5, h: -3 })).toEqual({ x: 0, y: 1, w: 1, h: 0 });
    expect(areaOf({ kind: 'rect', x: 0.75, y: 0.5, w: 0.5, h: 0.25 })).toEqual({ x: 0.75, y: 0.5, w: 0.25, h: 0.25 });
  });

  it('gives each capture failure its own client code', () => {
    expect(captureCode('too_soon')).toBe('capture_too_soon');
  });
});

describe('a press on the selector (3.6)', () => {
  const screen = { width: 1000, height: 500 };

  it('is a click below six pixels of movement either way, and a drag from six', () => {
    expect(dragArea({ x: 100, y: 100 }, { x: 100 + dragMinPx - 1, y: 100 + dragMinPx - 1 }, screen)).toBeNull();
    expect(dragArea({ x: 100, y: 100 }, { x: 100 + dragMinPx, y: 100 }, screen)).toEqual({
      kind: 'rect',
      x: 0.1,
      y: 0.2,
      w: dragMinPx / 1000,
      h: 0,
    });
  });

  it('reads a drag any way round as the same area', () => {
    const down = dragArea({ x: 100, y: 50 }, { x: 600, y: 300 }, screen);
    const up = dragArea({ x: 600, y: 300 }, { x: 100, y: 50 }, screen);
    expect(down).toEqual(up);
    expect(down).toEqual({ kind: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });

  it('is nothing without a start, an end, or a window', () => {
    expect(dragArea(null, { x: 1, y: 1 }, screen)).toBeNull();
    expect(dragArea({ x: 1, y: 1 }, null, screen)).toBeNull();
    expect(dragArea({ x: 0, y: 0 }, { x: 50, y: 50 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('a press on the selector as it settles (3.6, found 2026-11-12)', () => {
  it.each<[number | null, number, boolean]>([
    [null, 10_000, false],
    [1_000, 1_000, false],
    [1_000, 1_000 + settleMs - 1, false],
    [1_000, 1_000 + settleMs, true],
    [1_000, 1_000 + 60_000, true],
    [1_000, 999, false],
  ])('shown at %j, counts a press at %i: %s', (shownAt, at, counts) => {
    expect(pressCounts(at, shownAt)).toBe(counts);
  });

  it('settles for less than anyone reacts, and long enough for a double-click to end', () => {
    expect(settleMs).toBeGreaterThanOrEqual(250);
    expect(settleMs).toBeLessThanOrEqual(500);
  });
});

describe('the overlay’s screenshot commands (3.6)', () => {
  it('takes a capture with a note of up to 500 characters, trimmed, or none', () => {
    expect(overlayCommandSchema.parse({ type: 'capture', hint: '  the loop  ' })).toEqual({
      type: 'capture',
      hint: 'the loop',
    });
    expect(overlayCommandSchema.safeParse({ type: 'capture', hint: null }).success).toBe(true);
    expect(overlayCommandSchema.safeParse({ type: 'capture', hint: 'n'.repeat(500) }).success).toBe(true);
    expect(overlayCommandSchema.safeParse({ type: 'capture', hint: 'n'.repeat(501) }).success).toBe(false);
    expect(overlayCommandSchema.safeParse({ type: 'capture' }).success).toBe(false);
  });

  it.each(['shot-mf3x2k-1', 'a', 'A_b-9'.padEnd(40, 'x')])(
    'takes back or attaches again a screenshot named %s',
    (id) => {
      expect(overlayCommandSchema.safeParse({ type: 'detachScreenshot', id }).success).toBe(true);
      expect(overlayCommandSchema.safeParse({ type: 'reattachScreenshot', id }).success).toBe(true);
    },
  );

  it.each(['', '../x', 'shot 1', 'x'.repeat(41), 'shot/1'])('refuses a screenshot named %j', (id) => {
    expect(overlayCommandSchema.safeParse({ type: 'detachScreenshot', id }).success).toBe(false);
    expect(overlayCommandSchema.safeParse({ type: 'reattachScreenshot', id }).success).toBe(false);
  });
});
