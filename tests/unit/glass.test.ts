// The glass (Shahin, 2026-11-12): the overlay's clear, as v1's (a transparent window, so what is behind it can be
// read), the app window's frosted where Windows draws its acrylic; what each page is told of it; and the opacity each
// window's background is painted at.
import { readFileSync } from 'node:fs';
import { release } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  acrylicSupported,
  clearWindowOptions,
  firstAcrylicBuild,
  frostedWindowOptions,
  solidBackground,
} from '../../src/main/windows/glass';
import { glassOf } from '../../src/shared/glass';
import {
  defaultSettings,
  minOpacity,
  opacityPercent,
  settingsPatchSchema,
  settingsSchema,
} from '../../src/shared/settings';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe("which computers draw the app window's frosted glass", () => {
  it.each<[string, string, boolean, string]>([
    ['win32', '10.0.26200', true, 'Windows 11 25H2'],
    ['win32', '10.0.26100', true, 'Windows 11 24H2'],
    ['win32', '10.0.22631', true, 'Windows 11 23H2'],
    ['win32', '10.0.22621', true, 'Windows 11 22H2, the first with the backdrop'],
    ['win32', '10.0.22620', false, 'the build before it'],
    ['win32', '10.0.22000', false, 'Windows 11 21H2'],
    ['win32', '10.0.19045', false, 'Windows 10 22H2'],
    ['win32', '10.0.17763', false, 'Windows 10 1809'],
    ['win32', '6.3.9600', false, 'Windows 8.1'],
    ['win32', '10.0.22621.4317', true, 'a release with its revision'],
    ['win32', '10.0', false, 'a release without a build'],
    ['win32', '10.0.', false, 'an empty build'],
    ['win32', '10.0.x', false, 'a build that is not a number'],
    ['win32', '10.0.22621abc', false, 'a build with letters after it'],
    ['win32', '10.0.2262.1', false, 'a short build'],
    ['win32', '', false, 'no release at all'],
    ['darwin', '25.1.0', false, 'macOS, whatever its version'],
    ['linux', '6.8.0-45-generic', false, 'Linux'],
    ['linux', '10.0.26200', false, 'a Windows release on another platform'],
  ])('%s %s: %s (%s)', (platform, osRelease, acrylic) => {
    expect(acrylicSupported(platform, osRelease)).toBe(acrylic);
  });

  it('starts at Windows 11 22H2, the first build Electron draws a system backdrop on', () => {
    expect(firstAcrylicBuild).toBe(22621);
  });

  it('asks this computer when given nothing', () => {
    expect(acrylicSupported()).toBe(acrylicSupported(process.platform, release()));
  });
});

describe('what each window is made with', () => {
  it('the overlay: a transparent window with a clear background and no shadow, as v1’s, on every Windows', () => {
    expect(clearWindowOptions).toEqual({ transparent: true, backgroundColor: '#00000000', hasShadow: false });
  });

  it('the overlay: nothing that blurs what is behind it, so it can be read through', () => {
    expect(clearWindowOptions).not.toHaveProperty('backgroundMaterial');
    expect(clearWindowOptions).not.toHaveProperty('vibrancy');
  });

  it('the app window with the acrylic: behind a clear background, so its page paints the only layer', () => {
    expect(frostedWindowOptions(true)).toEqual({ backgroundMaterial: 'acrylic', backgroundColor: '#00000000' });
  });

  it('the app window without it: the solid background, and no material asked of Windows', () => {
    const options = frostedWindowOptions(false);
    expect(options).toEqual({ backgroundColor: solidBackground });
    expect(options).not.toHaveProperty('backgroundMaterial');
  });

  it("shows the dark theme's window before its page paints, the default theme", () => {
    const tokens = readFileSync(join(root, 'src', 'renderer', 'shared', 'styles', 'tokens.css'), 'utf8');
    const dark = tokens.slice(tokens.indexOf(':root.theme-dark'), tokens.indexOf(':root.theme-light'));
    expect(dark).toContain(`--window: ${solidBackground};`);
    expect(defaultSettings.theme).toBe('dark');
  });
});

describe('what a page is told of the glass behind it', () => {
  it.each<[string, 'clear' | 'frosted' | null]>([
    ['?glass=clear', 'clear'],
    ['?glass=frosted', 'frosted'],
    ['?x=2&glass=clear', 'clear'],
    ['', null],
    ['?glass=1', null],
    ['?glass=', null],
    ['?glass', null],
    ['?glass=Clear', null],
    ['?glass=blur', null],
    ['?Glass=clear', null],
    ['#glass=clear', null],
    ['?glass=clear&glass=frosted', 'clear'],
  ])('%j names %s', (search, glass) => {
    expect(glassOf(search)).toBe(glass);
  });
});

describe("each window's background opacity", () => {
  const steps = Array.from({ length: (100 - minOpacity) / 5 + 1 }, (_, i) => minOpacity + i * 5);

  it('goes from 30 to 100 percent, in steps of 5: fifteen of them', () => {
    expect(minOpacity).toBe(30);
    expect(steps).toHaveLength(15);
    for (const percent of steps) expect(opacityPercent.safeParse(percent).success, String(percent)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['below the least', 25],
    ['far below it', 0],
    ['negative', -50],
    ['above full', 105],
    ['far above it', 1000],
    ['off the steps', 42],
    ['one short of a step', 74],
    ['a fraction', 72.5],
    ['a fraction of a percent', 0.75],
    ['a string', '75'],
    ['not a number', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['nothing', null],
    ['missing', undefined],
    ['true', true],
  ])('refuses one %s (%s)', (_, value) => {
    expect(opacityPercent.safeParse(value).success).toBe(false);
  });

  it('is kept for each window on its own, and the old single field is no setting', () => {
    expect(settingsPatchSchema.safeParse({ overlayOpacity: 30 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ appOpacity: 100 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ overlayOpacity: 55, appOpacity: 90 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ overlayOpacity: 20 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ appOpacity: 101 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ opacity: 80 }).success).toBe(false);
  });

  it('starts at 75 for the overlay and 80 for the app window: see-through, with the text readable', () => {
    expect(defaultSettings).toMatchObject({ overlayOpacity: 75, appOpacity: 80 });
    expect(settingsSchema.safeParse(defaultSettings).success).toBe(true);
  });

  it('needs both: settings without one are not settings', () => {
    for (const field of ['overlayOpacity', 'appOpacity'] as const) {
      const without: Partial<typeof defaultSettings> = { ...defaultSettings };
      delete without[field];
      expect(settingsSchema.safeParse(without).success, field).toBe(false);
    }
  });
});
