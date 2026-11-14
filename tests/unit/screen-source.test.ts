// Which screen a screenshot takes (3.6; found in the deep round of 2026-11-14): by its display id when the capturer
// gives one, the only screen when there is one, and, when it gives none (a laptop on two graphics adapters), by the
// display's place, but only when nothing is a guess.
import { describe, expect, it } from 'vitest';
import { pickScreenSource, type ScreenSource } from '../../src/main/screenshots/screen-source';

const laptop = { id: 1527227920 };
const external = { id: 3917381677 };
const fullHd = { width: 1920, height: 1080 };

function source(index: number | string, displayId: string, size = fullHd): ScreenSource {
  return {
    id: typeof index === 'number' ? `screen:${index}:0` : index,
    display_id: displayId,
    thumbnail: { getSize: () => size },
  };
}

describe('the screen a screenshot takes', () => {
  it('is the one the capturer names by the display id', () => {
    const sources = [source(0, String(external.id)), source(1, String(laptop.id))];

    expect(pickScreenSource(sources, laptop, [laptop, external], fullHd)).toBe(sources[1]);
    expect(pickScreenSource(sources, external, [laptop, external], fullHd)).toBe(sources[0]);
  });

  it('is the only screen when there is one, named or not', () => {
    const only = [source(0, '')];

    expect(pickScreenSource(only, laptop, [laptop], fullHd)).toBe(only[0]);
    expect(pickScreenSource(only, laptop, [laptop, external], { width: 1, height: 1 })).toBe(only[0]);
  });

  it("is found by the display's place when the capturer names no screen: this laptop, on two graphics adapters", () => {
    const sources = [source(0, ''), source(1, '')];

    expect(pickScreenSource(sources, laptop, [laptop, external], fullHd)).toBe(sources[0]);
    expect(pickScreenSource(sources, external, [laptop, external], fullHd)).toBe(sources[1]);
  });

  it("goes by the screens' indices, not the order the capturer listed them in", () => {
    const sources = [source(2, ''), source(0, ''), source(1, '')];
    const third = { id: 77 };

    expect(pickScreenSource(sources, laptop, [laptop, external, third], fullHd)).toBe(sources[1]);
    expect(pickScreenSource(sources, external, [laptop, external, third], fullHd)).toBe(sources[2]);
    expect(pickScreenSource(sources, third, [laptop, external, third], fullHd)).toBe(sources[0]);
  });

  it.each([
    ['the counts differ', [source(0, ''), source(1, '')], [laptop, external, { id: 9 }], laptop, fullHd],
    ['the display is not among the displays', [source(0, ''), source(1, '')], [laptop, external], { id: 5 }, fullHd],
    [
      "the picture is not the display's size",
      [source(0, ''), source(1, '')],
      [laptop, external],
      laptop,
      { width: 1536, height: 864 },
    ],
    [
      'a screen has an id of another kind',
      [source('window:4:0', ''), source(1, '')],
      [laptop, external],
      laptop,
      fullHd,
    ],
    ['two screens share an index', [source(1, ''), source(1, '')], [laptop, external], laptop, fullHd],
    [
      'some screens are named and none is this display',
      [source(0, String(external.id)), source(1, '')],
      [laptop, external],
      laptop,
      fullHd,
    ],
    ['there is no screen', [], [laptop], laptop, fullHd],
  ])('is none, never a guess, when %s', (_, sources, displays, display, size) => {
    expect(pickScreenSource(sources, display, displays, size)).toBeNull();
  });

  it('allows a pixel or two of rounding between the display and its picture', () => {
    for (const [width, height, taken] of [
      [1920, 1080, true],
      [1918, 1080, true],
      [1922, 1082, true],
      [1917, 1080, false],
      [1920, 1083, false],
    ] as const) {
      const sources = [source(0, '', { width, height }), source(1, '')];
      expect(pickScreenSource(sources, laptop, [laptop, external], fullHd) !== null).toBe(taken);
    }
  });

  it('prefers a named screen to the order whenever the capturer names one', () => {
    const sources = [source(0, String(laptop.id)), source(1, String(external.id))];

    expect(pickScreenSource(sources, external, [external, laptop], fullHd)).toBe(sources[1]);
  });
});
