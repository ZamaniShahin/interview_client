// The deep round over 3.6, 3.8 and 3.10 (Shahin's, 2026-11-11): screenshots. Each part triggered again, widened with
// data points around the ones screenshots.test.ts reads, and every outcome given a test of its own.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import type { CommandResult } from '../../src/shared/ipc';
import type { LiveAction } from '../../src/shared/live/reducer';
import {
  areaOf,
  captureCode,
  captureFailureText,
  screenshotIdSchema,
  selectionSchema,
  type CaptureFailure,
  type Selection,
} from '../../src/shared/screenshots';
import { ScreenCapture, minGapMs, type CaptureDependencies } from '../../src/main/screenshots/screen-capture';
import { ScreenshotShelf, shelfLimit } from '../../src/main/screenshots/screenshot-shelf';
import {
  cutOut,
  encodeShot,
  isBlank,
  maxShotBytes,
  minAreaPx,
  type EncodedShot,
} from '../../src/main/screenshots/shot-image';
import {
  keepScreenshotsOfAnswers,
  SessionController,
  type SessionCommand,
  type SessionDriver,
} from '../../src/main/session/session-controller';
import { dragArea } from '../../src/renderer/selector/drag';
import { FakeImage } from './fake-image';

/** Every code the server sends, to tell the client's own from them. */
function serverCodes(node: unknown = ErrorCodes): string[] {
  if (typeof node === 'string') return [node];
  return Object.values(node as Record<string, unknown>).flatMap(serverCodes);
}

describe('a dragged area brought inside the display, widened (3.6)', () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ kind: 'rect' as const, x, y, w, h });

  it.each<[string, ReturnType<typeof rect>, [number, number, number, number]]>([
    ['the whole display', rect(0, 0, 1, 1), [0, 0, 1, 1]],
    ['a quarter in the middle', rect(0.25, 0.25, 0.5, 0.5), [0.25, 0.25, 0.5, 0.5]],
    ['one starting left of the display, moved in', rect(-0.5, 0.2, 0.3, 0.3), [0, 0.2, 0.3, 0.3]],
    ['one starting above it, moved in', rect(0.2, -3, 0.3, 0.3), [0.2, 0, 0.3, 0.3]],
    ['one starting past its right edge, nothing wide', rect(1.2, 0, 0.5, 0.5), [1, 0, 0, 0.5]],
    ['one starting past its bottom, nothing high', rect(0, 7, 0.5, 0.5), [0, 1, 0.5, 0]],
    ['one running past the corner, cut at it', rect(0.9, 0.8, 0.5, 0.5), [0.9, 0.8, 0.1, 0.2]],
    ['one of negative size, nothing', rect(0.5, 0.5, -0.2, -0.2), [0.5, 0.5, 0, 0]],
    ['one far too large, the rest of the display', rect(0, 0, 1e9, 1e9), [0, 0, 1, 1]],
    ['one at the far corner, nothing', rect(1, 1, 1, 1), [1, 1, 0, 0]],
  ])('brings %s inside it', (_, selection, [x, y, w, h]) => {
    const area = areaOf(selection);
    expect(area.x).toBeCloseTo(x, 12);
    expect(area.y).toBeCloseTo(y, 12);
    expect(area.w).toBeCloseTo(w, 12);
    expect(area.h).toBeCloseTo(h, 12);
    expect(area.x + area.w).toBeLessThanOrEqual(1);
    expect(area.y + area.h).toBeLessThanOrEqual(1);
  });

  it.each([NaN, Infinity, -Infinity])('takes no area with a coordinate of %s from the page', (bad) => {
    for (const key of ['x', 'y', 'w', 'h'] as const) {
      expect(selectionSchema.safeParse({ ...rect(0.1, 0.1, 0.5, 0.5), [key]: bad }).success).toBe(false);
    }
  });

  it.each<[unknown, boolean]>([
    [{ kind: 'full' }, true],
    [{ kind: 'cancel' }, true],
    [rect(0, 0, 0, 0), true],
    [{ kind: 'full', x: 0 }, false],
    [{ kind: 'cancel', reason: 'esc' }, false],
    [{ ...rect(0, 0, 1, 1), extra: true }, false],
    [{ kind: 'rect', x: 0, y: 0, w: 1 }, false],
    [{ kind: 'rect', x: '0', y: 0, w: 1, h: 1 }, false],
    [{ kind: 'area' }, false],
    [null, false],
    ['full', false],
  ])('reads %j from the page as a selection: %s', (payload, valid) => {
    expect(selectionSchema.safeParse(payload).success).toBe(valid);
  });
});

describe('the area cut out, across displays (3.6)', () => {
  const displays: [number, number][] = [
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
    [1080, 1920],
    [5120, 1440],
  ];

  it.each(displays)('cuts the middle quarter of a %i×%i display in its own pixels', (width, height) => {
    const picture = new FakeImage(width, height);
    const cut = cutOut(picture, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(picture.crops).toEqual([
      {
        x: Math.round(width / 4),
        y: Math.round(height / 4),
        width: Math.round(width / 2),
        height: Math.round(height / 2),
      },
    ]);
    expect(cut.getSize()).toEqual({ width: Math.round(width / 2), height: Math.round(height / 2) });
  });

  it.each(displays)(
    `on a %i×%i display, cuts an area ${minAreaPx} pixels across, and keeps the whole for one less`,
    (width, height) => {
      const exact = new FakeImage(width, height);
      expect(cutOut(exact, { x: 0.5, y: 0.5, w: minAreaPx / width, h: minAreaPx / height }).getSize()).toEqual({
        width: minAreaPx,
        height: minAreaPx,
      });
      const sliverWide = new FakeImage(width, height);
      expect(cutOut(sliverWide, { x: 0.5, y: 0.5, w: (minAreaPx - 1) / width, h: 0.3 })).toBe(sliverWide);
      const sliverHigh = new FakeImage(width, height);
      expect(cutOut(sliverHigh, { x: 0.5, y: 0.5, w: 0.3, h: (minAreaPx - 1) / height })).toBe(sliverHigh);
      expect(sliverWide.crops).toEqual([]);
      expect(sliverHigh.crops).toEqual([]);
    },
  );

  it.each(displays)('on a %i×%i display, never cuts past an edge', (width, height) => {
    for (const area of [
      { x: 0.99, y: 0, w: 0.5, h: 1 },
      { x: 0, y: 0.99, w: 1, h: 0.5 },
      { x: 0.995, y: 0.995, w: 1, h: 1 },
      { x: 0, y: 0, w: 1, h: 1 },
    ]) {
      const picture = new FakeImage(width, height);
      cutOut(picture, area);
      for (const crop of picture.crops) {
        expect(crop.x + crop.width).toBeLessThanOrEqual(width);
        expect(crop.y + crop.height).toBeLessThanOrEqual(height);
        expect(crop.width).toBeGreaterThanOrEqual(minAreaPx);
        expect(crop.height).toBeGreaterThanOrEqual(minAreaPx);
      }
    }
  });

  it('keeps the whole display for an area that starts at its far edge', () => {
    const picture = new FakeImage(1920, 1080);
    expect(cutOut(picture, { x: 1, y: 0, w: 0, h: 1 })).toBe(picture);
    expect(cutOut(picture, { x: 0, y: 1, w: 1, h: 0 })).toBe(picture);
    expect(picture.crops).toEqual([]);
  });
});

describe('a blank capture, channel by channel (3.6)', () => {
  /** A 16-wide picture's pixels (BGRA), all `base` but the one at `at`, which is `lit`. */
  const pixels =
    (base: [number, number, number, number], at = -1, lit: [number, number, number, number] = base) =>
    (w: number, h: number) => {
      const out = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) out.set(i === at ? lit : base, i * 4);
      return out;
    };

  it.each<[string, (w: number, h: number) => Uint8Array, boolean]>([
    ['all black', pixels([0, 0, 0, 255]), true],
    ['all black, no alpha', pixels([0, 0, 0, 0]), true],
    ['all of 7, the darkest grey that is still black', pixels([7, 7, 7, 255]), true],
    ['black with a blue of 7 in one pixel', pixels([0, 0, 0, 255], 5, [7, 0, 0, 255]), true],
    ['black with a blue of 8 in one pixel', pixels([0, 0, 0, 255], 5, [8, 0, 0, 255]), false],
    ['black with a green of 8 in one pixel', pixels([0, 0, 0, 255], 5, [0, 8, 0, 255]), false],
    ['black with a red of 8 in one pixel', pixels([0, 0, 0, 255], 5, [0, 0, 8, 255]), false],
    ['black with only its alpha bright', pixels([0, 0, 0, 255], 5, [0, 0, 0, 255]), true],
    ['black with its very first pixel lit', pixels([0, 0, 0, 255], 0, [255, 255, 255, 255]), false],
    ['black with its very last pixel lit', pixels([0, 0, 0, 255], 16 * 9 - 1, [255, 255, 255, 255]), false],
    ['all white', pixels([255, 255, 255, 255]), false],
  ])('reads a picture %s as blank: %s', (_, bitmap, blank) => {
    expect(isBlank(new FakeImage(1920, 1080, 0, undefined, bitmap))).toBe(blank);
  });

  it('reads the picture at 16 pixels wide, whatever its size', () => {
    for (const [width, height] of [
      [1920, 1080],
      [16, 16],
      [3840, 2160],
    ]) {
      const picture = new FakeImage(width!, height!, 0);
      isBlank(picture);
      expect(picture.resizes).toEqual([{ width: 16 }]);
    }
  });
});

describe('a screenshot encoded within the server’s limits, at each step (3.6)', () => {
  // 2048×1152 pixels: past 1.5 MB at a byte a pixel, so each weight below picks one step.
  const [width, height] = [2048, 1152];
  const area = width * height;
  const jpegBytes = (weight: number, quality: number, scale = 1) =>
    Math.round((Math.round(width * scale) * Math.round(height * scale) * weight * quality) / 100);

  it.each<[string, { png: number; jpeg: number }, EncodedShot['mime'], number, number]>([
    ['as PNG when it fits', { png: 0.5, jpeg: 0.2 }, 'image/png', Math.round(area * 0.5), 1],
    ['as JPEG at 85 when PNG is too large', { png: 1, jpeg: 0.7 }, 'image/jpeg', jpegBytes(0.7, 85), 1],
    ['as JPEG at 75 when 85 is too large', { png: 1, jpeg: 0.85 }, 'image/jpeg', jpegBytes(0.85, 75), 1],
    ['as JPEG at 65 when 75 is too large', { png: 1, jpeg: 0.95 }, 'image/jpeg', jpegBytes(0.95, 65), 1],
    ['as JPEG at 60 when 65 is too large', { png: 1, jpeg: 1.08 }, 'image/jpeg', jpegBytes(1.08, 60), 1],
    ['as PNG at three quarters when no JPEG fits', { png: 1, jpeg: 1.2 }, 'image/png', 1536 * 864, 0.75],
    [
      'as JPEG at 85 at three quarters when that PNG is too large',
      { png: 1.5, jpeg: 1.2 },
      'image/jpeg',
      jpegBytes(1.2, 85, 0.75),
      0.75,
    ],
  ])('encodes a 2048×1152 picture %s', (_, weights, mime, bytes, scale) => {
    const shot = encodeShot(new FakeImage(width, height, 200, weights))!;
    expect(shot.mime).toBe(mime);
    expect(shot.bytes.length).toBe(bytes);
    expect(shot.bytes.length).toBeLessThanOrEqual(maxShotBytes);
    expect([shot.width, shot.height]).toEqual([Math.round(width * scale), Math.round(height * scale)]);
  });

  it('gives up on a picture nothing makes small enough', () => {
    expect(encodeShot(new FakeImage(width, height, 200, { png: 10, jpeg: 10 }))).toBeNull();
  });

  it('keeps a PNG of exactly 1.5 MB, and turns to JPEG one row past it', () => {
    expect(encodeShot(new FakeImage(1024, 1536, 200, { png: 1, jpeg: 0.2 }))!.mime).toBe('image/png');
    expect(encodeShot(new FakeImage(1024, 1537, 200, { png: 1, jpeg: 0.2 }))!.mime).toBe('image/jpeg');
  });

  it.each<[number, number, number, number]>([
    [2048, 1152, 2048, 1152],
    [2049, 1153, 2048, 1152],
    [2560, 1440, 2048, 1152],
    [3840, 2160, 2048, 1152],
    [1440, 2560, 1152, 2048],
    [4096, 4096, 2048, 2048],
    [5120, 1440, 2048, 576],
    [1, 1, 1, 1],
    [20000, 1, 2048, 1],
  ])('caps a %i×%i picture to %i×%i, keeping its shape', (w, h, outW, outH) => {
    const shot = encodeShot(new FakeImage(w, h, 200, { png: 0.01, jpeg: 0.01 }))!;
    expect([shot.width, shot.height]).toEqual([outW, outH]);
  });

  it('encodes nothing of an empty picture', () => {
    expect(encodeShot(new FakeImage(0, 0))).toBeNull();
    expect(encodeShot(new FakeImage(0, 100))).toBeNull();
    expect(encodeShot(new FakeImage(100, 0))).toBeNull();
  });
});

describe('taking a screenshot, every outcome (3.6)', () => {
  function capturer(over: Partial<CaptureDependencies<string>> & { picture?: () => FakeImage } = {}) {
    let clock = 100_000;
    const log: string[] = [];
    const deps: CaptureDependencies<string> = {
      display: () => 'display-2',
      grab: async () => {
        log.push('grab');
        return over.picture?.() ?? new FakeImage(1920, 1080);
      },
      select: async () => {
        log.push('select');
        return { kind: 'full' };
      },
      selectorSupported: () => true,
      now: () => clock,
      ...over,
    };
    return { capture: new ScreenCapture(deps), log, later: (ms: number) => (clock += ms) };
  }

  const failure = (outcome: Awaited<ReturnType<ScreenCapture<string>['capture']>>) =>
    outcome.ok ? 'ok' : outcome.failure;

  it.each<[string, Partial<CaptureDependencies<string>> & { picture?: () => FakeImage }, CaptureFailure | 'ok']>([
    ['a click', {}, 'ok'],
    ['a drag', { select: async () => ({ kind: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5 }) }, 'ok'],
    ['no selector where it could show in a share', { selectorSupported: () => false }, 'ok'],
    ['a selector that closed with nothing', { select: async () => null }, 'cancelled'],
    ['Esc or a right-click', { select: async () => ({ kind: 'cancel' }) }, 'cancelled'],
    ['a black picture', { picture: () => new FakeImage(1920, 1080, 0) }, 'blank'],
    ['an empty picture', { picture: () => new FakeImage(0, 0) }, 'failed'],
    ['a grab that throws', { grab: async () => Promise.reject(new Error('no source')) }, 'failed'],
    ['a selector that throws', { select: async () => Promise.reject(new Error('gone')) }, 'failed'],
    [
      'no display to be had',
      {
        display: () => {
          throw new Error('no display');
        },
      },
      'failed',
    ],
    ['an overlay that would not hide', { hideForGrab: async () => Promise.reject(new Error('no')) }, 'failed'],
    [
      'a picture nothing encodes small enough',
      { picture: () => new FakeImage(2048, 1152, 200, { png: 10, jpeg: 10 }) },
      'failed',
    ],
  ])('after %s, says %s', async (_, over, outcome) => {
    const { capture } = capturer(over);
    expect(failure(await capture.capture())).toBe(outcome);
  });

  it('counts the gap from the end of each capture, whatever it made, and takes one again at exactly 1.5 s', async () => {
    for (const select of [async () => null, async () => ({ kind: 'full' as const })]) {
      const { capture, later } = capturer({ select });
      await capture.capture();
      later(minGapMs - 1);
      expect(failure(await capture.capture())).toBe('too_soon');
      later(1);
      expect(failure(await capture.capture())).not.toBe('too_soon');
    }
  });

  it('counts a failed capture’s end too, and a refusal as none', async () => {
    const { capture, later } = capturer({ grab: async () => Promise.reject(new Error('no source')) });
    expect(failure(await capture.capture())).toBe('failed');
    expect(failure(await capture.capture())).toBe('too_soon');
    later(minGapMs - 1);
    // A refusal is no capture: the gap still counts from the failed one.
    expect(failure(await capture.capture())).toBe('too_soon');
    later(1);
    expect(failure(await capture.capture())).toBe('failed');
  });

  it('says busy to every capture asked while one is under way, and takes again once it is over', async () => {
    let release: ((selection: Selection | null) => void) | null = null;
    // The first selection waits for the test; any later one is a click.
    const { capture, later } = capturer({
      select: () =>
        release ? Promise.resolve({ kind: 'full' as const }) : new Promise((resolve) => (release = resolve)),
    });
    const first = capture.capture();
    await vi.waitFor(() => expect(release).not.toBeNull());
    const during = await Promise.all([capture.capture(), capture.capture(), capture.capture()]);
    expect(during.map(failure)).toEqual(['busy', 'busy', 'busy']);
    release!({ kind: 'full' });
    expect(failure(await first)).toBe('ok');
    later(minGapMs);
    expect(failure(await capture.capture())).toBe('ok');
  });

  it.each<[string, Partial<CaptureDependencies<string>> & { picture?: () => FakeImage }]>([
    ['a capture', {}],
    ['a grab that failed', { grab: async () => Promise.reject(new Error('no source')) }],
    ['a cancel', { select: async () => null }],
    ['a blank picture', { picture: () => new FakeImage(1920, 1080, 0) }],
  ])('shows the overlay again once, right after the grab, after %s', async (_, over) => {
    const steps: string[] = [];
    const { capture } = capturer({
      ...over,
      hideForGrab: async () => {
        steps.push('hide');
        return () => steps.push('show');
      },
      select: async (display, picture) => {
        steps.push('select');
        return over.select ? over.select(display, picture) : { kind: 'full' };
      },
    });
    await capture.capture();
    expect(steps.filter((s) => s === 'show')).toHaveLength(1);
    expect(steps.slice(0, 2)).toEqual(['hide', 'show']);
  });

  it('shows nothing again where nothing was hidden', async () => {
    const { capture } = capturer({ hideForGrab: async () => null });
    expect(failure(await capture.capture())).toBe('ok');
  });

  it('grabs the display under the pointer, and lays the selector over that same one', async () => {
    const seen: string[] = [];
    const { capture } = capturer({
      grab: async (display) => {
        seen.push(`grab ${display}`);
        return new FakeImage(1920, 1080);
      },
      select: async (display) => {
        seen.push(`select ${display}`);
        return { kind: 'full' };
      },
    });
    await capture.capture();
    expect(seen).toEqual(['grab display-2', 'select display-2']);
  });
});

describe('the session’s shelf of screenshots, widened (3.6)', () => {
  const shot = (mime: EncodedShot['mime'] = 'image/png', bytes: Uint8Array = Uint8Array.of(1, 2, 3)): EncodedShot => ({
    bytes,
    mime,
    width: 10,
    height: 10,
  });

  it.each([0, 1, Date.UTC(2026, 10, 11), Date.UTC(2099, 0, 1), Number.MAX_SAFE_INTEGER])(
    'names screenshots with ids the server takes, at a clock of %i',
    (at) => {
      const shelf = new ScreenshotShelf(() => at, 1_000_000);
      const ids = Array.from({ length: 500 }, () => shelf.keep(shot()));
      for (const id of ids) expect(screenshotIdSchema.safeParse(id).success).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it('never names two the same in the app’s life, even across sessions at the same moment', () => {
    const shelf = new ScreenshotShelf(() => 5);
    const first = shelf.keep(shot());
    shelf.clear();
    expect(shelf.keep(shot())).not.toBe(first);
  });

  it('keeps an id short enough for the server after a million screenshots', () => {
    const shelf = new ScreenshotShelf(() => Number.MAX_SAFE_INTEGER, 0);
    let id = '';
    for (let i = 0; i < 1_000_000; i++) {
      id = shelf.keep(shot());
      shelf.prune([]);
    }
    expect(id.length).toBeLessThanOrEqual(40);
    expect(screenshotIdSchema.safeParse(id).success).toBe(true);
    expect(shelf.size).toBe(0);
  });

  it.each<[EncodedShot['mime'], Uint8Array]>([
    ['image/png', Uint8Array.of(137, 80, 78, 71)],
    ['image/jpeg', Uint8Array.of(255, 216, 255, 224)],
    ['image/png', new Uint8Array(0)],
    ['image/jpeg', Uint8Array.from({ length: 1000 }, (_, i) => i % 256)],
  ])('draws a %s as a data URL that gives back its bytes', (mime, bytes) => {
    const shelf = new ScreenshotShelf();
    const id = shelf.keep(shot(mime, bytes));
    const url = shelf.dataUrl(id)!;
    expect(url.startsWith(`data:${mime};base64,`)).toBe(true);
    expect(Uint8Array.from(Buffer.from(url.split(',')[1]!, 'base64'))).toEqual(bytes);
  });

  it('does nothing for an id it never kept, or one already let go', () => {
    const shelf = new ScreenshotShelf();
    const id = shelf.keep(shot());
    shelf.drop('shot-never-1');
    expect(shelf.size).toBe(1);
    shelf.drop(id);
    shelf.drop(id);
    expect(shelf.size).toBe(0);
    expect(shelf.get(id)).toBeNull();
    expect(shelf.dataUrl(id)).toBeNull();
  });

  it.each<[number, number, number[], number]>([
    // limit, kept, in use (by order kept), size after
    [0, 3, [], 0],
    [0, 3, [1], 1],
    [1, 3, [], 1],
    [1, 3, [0, 2], 2],
    [2, 5, [0], 2],
    [shelfLimit, shelfLimit, [], shelfLimit],
    [shelfLimit, shelfLimit + 1, [], shelfLimit],
    [shelfLimit, shelfLimit + 10, [0, 1, 2], shelfLimit],
  ])('with a limit of %i and %i kept, %j in use, keeps %i', (limit, kept, inUse, after) => {
    const shelf = new ScreenshotShelf(() => 1, limit);
    const ids = Array.from({ length: kept }, () => shelf.keep(shot()));
    shelf.prune([...inUse.map((i) => ids[i]!), 'shot-unknown-1']);
    expect(shelf.size).toBe(after);
    for (const i of inUse) expect(shelf.get(ids[i]!)).not.toBeNull();
    // The newest go last: whatever is kept beyond those in use is the newest.
    const others = ids.filter((_, i) => !inUse.includes(i));
    const keptOthers = others.filter((id) => shelf.get(id));
    expect(keptOthers).toEqual(others.slice(others.length - keptOthers.length));
  });
});

describe('a press on the selector, widened (3.6)', () => {
  const screen = { width: 1920, height: 1080 };

  it.each<[number, number, boolean]>([
    [0, 0, false],
    [5, 5, false],
    [5.99, 5.99, false],
    [-5, 5, false],
    [6, 0, true],
    [0, 6, true],
    [-6, 0, true],
    [0, -6, true],
    [6.01, 6.01, true],
    [100, 3, true],
    [-400, -300, true],
  ])('reads a move of (%d, %d) as a drag: %s', (dx, dy, drag) => {
    const anchor = { x: 900, y: 500 };
    const area = dragArea(anchor, { x: anchor.x + dx, y: anchor.y + dy }, screen);
    expect(area !== null).toBe(drag);
    if (area) {
      expect(area.x).toBeCloseTo(Math.min(anchor.x, anchor.x + dx) / screen.width, 12);
      expect(area.y).toBeCloseTo(Math.min(anchor.y, anchor.y + dy) / screen.height, 12);
      expect(area.w).toBeCloseTo(Math.abs(dx) / screen.width, 12);
      expect(area.h).toBeCloseTo(Math.abs(dy) / screen.height, 12);
      expect(selectionSchema.safeParse(area).success).toBe(true);
    }
  });

  it.each([
    { width: 0, height: 1080 },
    { width: 1920, height: 0 },
    { width: -1, height: -1 },
  ])('reads nothing in a window of %j', (window) => {
    expect(dragArea({ x: 0, y: 0 }, { x: 500, y: 500 }, window)).toBeNull();
  });

  it('reads a drag from corner to corner as the whole window', () => {
    expect(dragArea({ x: 0, y: 0 }, { x: 1920, y: 1080 }, screen)).toEqual({ kind: 'rect', x: 0, y: 0, w: 1, h: 1 });
    expect(dragArea({ x: 1920, y: 1080 }, { x: 0, y: 0 }, screen)).toEqual({ kind: 'rect', x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('a capture that made nothing, in words and codes (3.6)', () => {
  const failures: CaptureFailure[] = ['cancelled', 'busy', 'too_soon', 'blank', 'failed', 'full'];

  it('gives each failure a code of its own, never one of the server’s', () => {
    const codes = failures.map(captureCode);
    expect(new Set(codes).size).toBe(failures.length);
    for (const code of codes) {
      expect(code).toMatch(/^capture_[a-z_]+$/);
      expect(serverCodes()).not.toContain(code);
    }
  });

  it('words every failure but a cancel, in a sentence each', () => {
    expect(Object.keys(captureFailureText).sort()).toEqual(failures.filter((f) => f !== 'cancelled').sort());
    for (const text of Object.values(captureFailureText)) {
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text.trim()).toBe(text);
    }
    expect(new Set(Object.values(captureFailureText)).size).toBe(failures.length - 1);
  });
});

describe('screenshots through the session controller, widened (3.6)', () => {
  const shot: EncodedShot = { bytes: Uint8Array.of(137, 80, 78, 71), mime: 'image/png', width: 800, height: 600 };

  class Driver implements SessionDriver {
    readonly commands: SessionCommand[] = [];
    reply: CommandResult = { ok: true };
    dispatch: (action: LiveAction) => void = () => {};
    async start(dispatch: (action: LiveAction) => void): Promise<CommandResult> {
      this.dispatch = dispatch;
      dispatch({ type: 'starting' });
      return { ok: true };
    }
    async command(command: SessionCommand): Promise<CommandResult> {
      this.commands.push(command);
      return this.reply;
    }
    dispose(): void {}
  }

  let seq = 0;
  let shelf: ScreenshotShelf;
  let captures: number;
  let controller: SessionController;
  let driver: Driver;

  const event = (e: LiveAction) => driver.dispatch(e);
  const snapshot = (auto: boolean, contextReady: boolean, attachments: string[] = [], max = 5) =>
    event({
      type: 'snapshot',
      snapshot: {
        SessionId: 's',
        Phase: 1,
        Auto: auto,
        Paused: false,
        ContextReady: contextReady,
        Heard: '',
        LastSeq: ++seq,
        Attachments: attachments.map((Id) => ({ Id })),
        MaxAttachments: max,
        PrepDoc: null,
        CustomInstructionsChars: 0,
        PreparedInPrompt: [],
        Practice: null,
      },
    });
  const answer = (screenshotIds: string[]) =>
    event({
      type: 'event',
      event: {
        name: 'answerStart',
        e: {
          Seq: ++seq,
          AtMs: seq,
          AnswerId: `a${seq}`,
          Question: 'q',
          Kind: 0,
          Instruction: null,
          ScreenshotIds: screenshotIds,
        },
      },
    });

  beforeEach(async () => {
    vi.useFakeTimers();
    shelf = new ScreenshotShelf(() => 1_000);
    captures = 0;
    controller = new SessionController(() => {}, {
      capture: async () => {
        captures += 1;
        return { ok: true, shot };
      },
      shelf,
    });
    driver = new Driver();
    await controller.start(driver);
  });

  afterEach(() => vi.useRealTimers());

  it.each<[string, boolean, boolean, SessionCommand['type']]>([
    ['AUTO with the documents', true, true, 'screenshotQuery'],
    ['AUTO without the documents', true, false, 'attachScreenshot'],
    ['MANUAL with the documents', false, true, 'attachScreenshot'],
    ['MANUAL without the documents', false, false, 'attachScreenshot'],
  ])('in %s, sends the screenshot as %s', async (_, auto, contextReady, sent) => {
    snapshot(auto, contextReady);
    expect(await controller.command({ type: 'capture', hint: 'note' })).toEqual({ ok: true });
    expect(driver.commands.map((c) => c.type)).toEqual([sent]);
    expect(shelf.size).toBe(1);
  });

  it('asks about a screenshot at once in AUTO even with every place for attachments taken', async () => {
    snapshot(true, true, ['a', 'b', 'c', 'd', 'e']);
    expect(await controller.command({ type: 'capture', hint: null })).toEqual({ ok: true });
    expect(driver.commands[0]).toMatchObject({ type: 'screenshotQuery', hint: null });
  });

  it.each<[number, number, boolean]>([
    [0, 5, true],
    [4, 5, true],
    [5, 5, false],
    [1, 1, false],
    [0, 0, false],
  ])('in MANUAL with %i of %i attached, takes another: %s', async (count, max, takes) => {
    snapshot(
      false,
      true,
      Array.from({ length: count }, (_, i) => `s${i}`),
      max,
    );
    const result = await controller.command({ type: 'capture', hint: null });
    expect(result.ok).toBe(takes);
    expect(captures).toBe(takes ? 1 : 0);
    if (!takes) expect(result).toEqual({ ok: false, code: 'capture_full', message: captureFailureText.full });
  });

  it('keeps the screenshot the server took, under the id it was sent with', async () => {
    await controller.command({ type: 'capture', hint: null });
    const sent = driver.commands[0] as { id: string; bytes: Uint8Array };
    expect(shelf.get(sent.id)?.bytes).toEqual(sent.bytes);
  });

  it.each([ErrorCodes.Request.InvalidInput, ErrorCodes.Session.NotInSession, 'connection_lost'])(
    'passes a refusal (%s) on, and keeps nothing of it',
    async (code) => {
      driver.reply = { ok: false, code, message: 'No.' };
      expect(await controller.command({ type: 'capture', hint: null })).toEqual({ ok: false, code, message: 'No.' });
      expect(shelf.size).toBe(0);
    },
  );

  it('says it failed when this computer can take no screenshot at all', async () => {
    const without = new SessionController(() => {});
    const own = new Driver();
    await without.start(own);
    expect(await without.command({ type: 'capture', hint: null })).toEqual({
      ok: false,
      code: 'capture_failed',
      message: captureFailureText.failed,
    });
    expect(own.commands).toEqual([]);
  });

  it('attaches nothing again once the session has ended', async () => {
    const id = shelf.keep(shot);
    event({ type: 'ended', reason: 'user' });
    expect(await controller.command({ type: 'reattachScreenshot', id })).toMatchObject({
      ok: false,
      code: ErrorCodes.Session.NotInSession,
    });
    expect(driver.commands).toEqual([]);
  });

  it('passes the server’s refusal of a screenshot attached again on, keeping the copy', async () => {
    const id = shelf.keep(shot);
    driver.reply = { ok: false, code: ErrorCodes.Request.InvalidInput, message: 'No.' };
    expect(await controller.command({ type: 'reattachScreenshot', id })).toMatchObject({ ok: false });
    expect(shelf.get(id)).not.toBeNull();
  });

  it(`always keeps the screenshots under the latest ${keepScreenshotsOfAnswers} answers, and lets older ones go first`, async () => {
    const small = new ScreenshotShelf(() => 1, 0);
    controller = new SessionController(() => {}, { capture: async () => ({ ok: true, shot }), shelf: small });
    driver = new Driver();
    await controller.start(driver);
    // Each screenshot is taken for its answer, which then starts.
    const ids = Array.from({ length: keepScreenshotsOfAnswers + 2 }, () => {
      const id = small.keep(shot);
      answer([id]);
      return id;
    });
    // Each answer's start pruned the shelf: the oldest two answers' screenshots are gone.
    expect(ids.map((id) => small.get(id) !== null)).toEqual([
      false,
      false,
      ...Array.from({ length: keepScreenshotsOfAnswers }, () => true),
    ]);
  });
});
