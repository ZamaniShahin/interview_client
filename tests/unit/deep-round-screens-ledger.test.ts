// The deep round of 2026-11-14 over what it fixed in the app: which screen a screenshot takes (decisions §33) and the
// ledger's words for a session's minutes. The screens are tried in seeded random worlds: one to four displays of real
// sizes and scales, a capturer that names its screens or (its GDI path) doesn't, lists them in any order, numbers them
// with gaps (a display device that is off keeps its number), and scales each screen into the size asked for as Chromium
// does (ComputeLetterboxRegion: the shape kept, rounded down). Then each world is spoiled one way at a time. The pick
// must be the true screen when nothing is spoiled, and never another screen when something is.
import { describe, expect, it } from 'vitest';
import { toLedgerEntries } from '../../src/main/account/account-mapping';
import { pickScreenSource, type ScreenSource } from '../../src/main/screenshots/screen-source';

/** A seeded generator (mulberry32): the same stream on every run. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Size {
  width: number;
  height: number;
}

/** Real screens, in physical pixels: their shapes are 16:9, 16:10, 21:9 and the odd 1366 × 768. */
const resolutions: Size[] = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1600 },
  { width: 3440, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1280, height: 1024 },
];

/** How Chromium scales a screen into the thumbnail size asked for: the shape kept, rounded down (letterboxed). */
function fitInto(box: Size, content: Size): Size {
  const x = content.width * box.height;
  const y = content.height * box.width;
  return y < x
    ? { width: box.width, height: Math.floor(y / content.width) }
    : { width: Math.floor(x / content.height), height: box.height };
}

interface World {
  displays: { id: number; size: Size }[];
  /** The capturer's screens; `of` is the place of the display each one truly shows. */
  sources: (ScreenSource & { of: number })[];
}

type Spoil =
  | 'none'
  | 'a screen missing'
  | 'a screen too many'
  | 'two screens share an index'
  | 'a screen of another kind'
  | 'the display unknown'
  | 'one screen named, the rest not'
  | 'a name that is no display';

function world(random: () => number, named: boolean): World {
  const n = 1 + Math.floor(random() * 4);
  const ids = new Set<number>();
  while (ids.size < n) ids.add(1 + Math.floor(random() * 4_000_000_000));
  const displays = [...ids].map((id) => ({ id, size: resolutions[Math.floor(random() * resolutions.length)]! }));
  // Device numbers rise in the display order, with gaps where a device is off.
  let index = Math.floor(random() * 2);
  const indices = displays.map(() => {
    const mine = index;
    index += 1 + Math.floor(random() * 2);
    return mine;
  });
  const sources = displays.map((d, place) => ({
    id: `screen:${indices[place]}:0`,
    display_id: named ? String(d.id) : '',
    of: place,
    thumbnail: { getSize: () => d.size },
  }));
  // The capturer may list them in any order.
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [sources[i], sources[j]] = [sources[j]!, sources[i]!];
  }
  return { displays, sources };
}

/** The screens as the capturer hands them over when asked for `size`: each scaled into it. */
function captured(w: World, size: Size): (ScreenSource & { of: number })[] {
  return w.sources.map((s) => {
    const own = s.of >= 0 ? w.displays[s.of]!.size : resolutions[0]!;
    const picture = fitInto(size, own);
    return { ...s, thumbnail: { getSize: () => picture } };
  });
}

function spoil(w: World, how: Spoil, random: () => number): World {
  const sources = [...w.sources];
  const displays = [...w.displays];
  const pick = () => Math.floor(random() * sources.length);
  switch (how) {
    case 'none':
      break;
    case 'a screen missing':
      sources.splice(pick(), 1);
      break;
    case 'a screen too many':
      sources.push({ id: 'screen:97:0', display_id: '', of: -1, thumbnail: { getSize: () => resolutions[0]! } });
      break;
    case 'two screens share an index': {
      const i = pick();
      const j = (i + 1) % sources.length;
      sources[j] = { ...sources[j]!, id: sources[i]!.id };
      break;
    }
    case 'a screen of another kind': {
      const i = pick();
      sources[i] = { ...sources[i]!, id: `window:${1000 + i}:0` };
      break;
    }
    case 'the display unknown':
      // The display asked for isn't among Electron's (the loop asks for it by an id no display has).
      break;
    case 'one screen named, the rest not': {
      const i = pick();
      sources[i] = { ...sources[i]!, display_id: String(w.displays[sources[i]!.of]!.id) };
      break;
    }
    case 'a name that is no display': {
      const i = pick();
      sources[i] = { ...sources[i]!, display_id: '12345' };
      break;
    }
  }
  return { displays, sources };
}

const spoils: Spoil[] = [
  'none',
  'a screen missing',
  'a screen too many',
  'two screens share an index',
  'a screen of another kind',
  'the display unknown',
  'one screen named, the rest not',
  'a name that is no display',
];

describe('the screen a screenshot takes, in random worlds', () => {
  const outcomes = new Map<string, number>();
  const seen = (outcome: string) => outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);

  it.each(Array.from({ length: 120 }, (_, i) => 9_001 + i))(
    'world %i: the true screen when nothing is spoiled, never another screen when something is',
    (seed) => {
      const random = generator(seed);
      const named = random() < 0.35;
      const truth = world(random, named);
      for (const how of spoils) {
        const w = spoil(truth, how, random);
        for (const [place, display] of truth.displays.entries()) {
          // Electron's ids are positive: the negated one is no display's.
          const shown = how === 'the display unknown' ? { ...display, id: -display.id } : display;
          const sources = captured(w, display.size);
          const picked = pickScreenSource(sources, shown, w.displays, display.size);
          const only = sources.length === 1;

          if (picked === null) {
            // A refusal is never wrong, but the untouched world must always be told apart.
            expect(how === 'none' && w.sources.length > 0, `seed ${seed}: refused an untouched world`).toBe(false);
            seen(`${named ? 'named' : 'unnamed'}: refused (${how})`);
            continue;
          }
          // The only screen is taken as it is: what the capturer offers is all there is (Wayland's portal, say).
          if (only && picked.of !== place) {
            seen('the only screen, though another display was asked for');
            continue;
          }
          expect(picked.of, `seed ${seed}, ${how}: display ${place} got display ${picked.of}'s screen`).toBe(place);
          seen(
            picked.display_id !== '' && Number(picked.display_id) === shown.id
              ? 'by its name'
              : only
                ? 'the only screen'
                : 'by its place',
          );
        }
      }
    },
  );

  it('meets every outcome in those worlds', () => {
    for (const outcome of [
      'by its name',
      'by its place',
      'the only screen',
      'unnamed: refused (a screen missing)',
      'unnamed: refused (a screen too many)',
      'unnamed: refused (two screens share an index)',
      'unnamed: refused (a screen of another kind)',
      'unnamed: refused (the display unknown)',
      'unnamed: refused (one screen named, the rest not)',
      'unnamed: refused (a name that is no display)',
      'named: refused (the display unknown)',
      'named: refused (a name that is no display)',
    ]) {
      expect(outcomes.get(outcome) ?? 0, outcome).toBeGreaterThan(0);
    }
  });
});

describe('the screen a screenshot takes, at the edges of its rules', () => {
  const panel = { id: 1527227920 };
  const external = { id: 3917381677 };
  const unnamed = (index: number, size: Size): ScreenSource => ({
    id: `screen:${index}:0`,
    display_id: '',
    thumbnail: { getSize: () => size },
  });

  it('takes the place when the screens are of different shapes, each scaled into the size asked for', () => {
    const asked = { width: 1920, height: 1080 };
    const sources = [
      unnamed(0, fitInto(asked, { width: 1920, height: 1080 })),
      unnamed(1, fitInto(asked, { width: 1920, height: 1200 })),
    ];

    expect(pickScreenSource(sources, panel, [panel, external], asked)).toBe(sources[0]);
    // The second screen, 16:10 scaled into 16:9, comes back 1728 × 1080: not the panel's picture.
    expect(sources[1]!.thumbnail.getSize()).toEqual({ width: 1728, height: 1080 });
    expect(pickScreenSource(sources, external, [panel, external], asked)).toBeNull();
  });

  it("can't tell two screens of one shape apart when the capturer's order isn't Electron's: the case to check by eye", () => {
    // Electron lists the external screen first here, the capturer the panel first (its DISPLAY1). Both are 16:9, so
    // each comes back the size asked for, and the place gives the wrong screen. On Shahin's laptop the orders agree
    // (decisions §33); this is what the size check cannot catch.
    const asked = { width: 2560, height: 1440 };
    const panelScreen = { ...unnamed(0, fitInto(asked, { width: 1920, height: 1080 })), shows: 'panel' };
    const externalScreen = { ...unnamed(1, fitInto(asked, { width: 2560, height: 1440 })), shows: 'external' };

    expect(pickScreenSource([panelScreen, externalScreen], external, [external, panel], asked)?.shows).toBe('panel');
  });

  it.each([
    [0, 0, true],
    [2, 2, true],
    [-2, -2, true],
    [3, 0, false],
    [0, 3, false],
    [-3, 0, false],
    [0, -3, false],
  ])('allows %i, %i pixels of rounding: %s', (dw, dh, taken) => {
    const asked = { width: 1920, height: 1080 };
    const sources = [unnamed(0, { width: 1920 + dw, height: 1080 + dh }), unnamed(1, asked)];

    expect(pickScreenSource(sources, panel, [panel, external], asked) !== null).toBe(taken);
  });

  it('reads an index of many digits, and orders by number, not by text', () => {
    const asked = { width: 1920, height: 1080 };
    const sources = [unnamed(10, asked), unnamed(9, asked), unnamed(100, asked)];
    const third = { id: 3 };

    expect(pickScreenSource(sources, panel, [panel, external, third], asked)).toBe(sources[1]);
    expect(pickScreenSource(sources, external, [panel, external, third], asked)).toBe(sources[0]);
    expect(pickScreenSource(sources, third, [panel, external, third], asked)).toBe(sources[2]);
  });

  it.each(['screen:1', 'screen::0', 'screen:a:0', 'screen:-1:0', ' screen:1:0', 'Screen:1:0'])(
    'refuses an id it cannot number (%s)',
    (id) => {
      const asked = { width: 1920, height: 1080 };
      const sources = [unnamed(0, asked), { ...unnamed(1, asked), id }];

      expect(pickScreenSource(sources, panel, [panel, external], asked)).toBeNull();
    },
  );

  it('matches a name by its number, as Electron gives a display id', () => {
    const asked = { width: 1920, height: 1080 };
    const sources = [
      { ...unnamed(0, asked), display_id: '3917381677' },
      { ...unnamed(1, asked), display_id: '1527227920' },
    ];

    expect(pickScreenSource(sources, panel, [panel, external], asked)).toBe(sources[1]);
    expect(pickScreenSource(sources, { id: 42 }, [panel, external], asked)).toBeNull();
  });
});

describe("the ledger's words for a session's minutes", () => {
  const kinds: [string, string, boolean][] = [
    ['grant_trial', 'Trial minutes', false],
    ['grant_plan', 'Plan minutes', false],
    ['purchase', 'Top-up', false],
    ['debit_live', 'Session', true],
    ['debit_practice', 'Practice', true],
    ['refund', 'Refund', false],
    ['expiry', 'Expired', false],
    ['adjustment', 'Adjustment', false],
  ];
  const now = new Date(Date.UTC(2026, 10, 14, 12));

  it.each(kinds.flatMap(([type, kind, debit]) => [1, 2, 59, 60, 61, 600].map((m) => [type, m, kind, debit] as const)))(
    '%s of %i minutes',
    (type, magnitude, kind, debit) => {
      const minutes = debit || type === 'refund' || type === 'expiry' ? -magnitude : magnitude;
      const [entry] = toLedgerEntries(
        {
          entries: [{ number: 1, type, minutes, balanceAfter: 0, sessionId: null, createdAt: '2026-11-14T10:00:00Z' }],
          next: null,
        },
        now,
      );

      expect(entry!.kind).toBe(kind);
      expect(entry!.detail).toBe(debit ? `${magnitude} ${magnitude === 1 ? 'minute' : 'minutes'}` : '');
      expect(entry!.minutes).toBe(minutes);
    },
  );
});
