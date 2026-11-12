// The glass behind each window (Shahin, 2026-11-12; shared/glass.ts). The overlay's is clear, as v1's was: a
// transparent window, the page drawing everything, so what is behind it shows through as it is. The app window's is
// frosted: Windows 11 draws a system backdrop behind it, its acrylic, which blurs whatever is on screen behind it.
// Windows 10 and older Windows 11 builds have no such backdrop: their app window stays solid, as before.
import { release } from 'node:os';
import type { BrowserWindowConstructorOptions } from 'electron';

/** Windows 11 22H2, the first build that draws a window's system backdrop (Electron's `backgroundMaterial`). */
export const firstAcrylicBuild = 22621;

/** The solid background a window shows before its page paints, and keeps where there is no glass. */
export const solidBackground = '#111113';

/** Whether this computer draws the acrylic behind a window: Windows, build 22621 or later. */
export function acrylicSupported(platform: string = process.platform, osRelease: string = release()): boolean {
  if (platform !== 'win32') return false;
  const build = Number(osRelease.split('.')[2]);
  return Number.isInteger(build) && build >= firstAcrylicBuild;
}

/**
 * The overlay: a transparent window, its page the only thing drawn, so the screen behind it shows through, sharp,
 * wherever the page lets it. Windows draws a transparent window no corners, edge or shadow: the page draws the first
 * two (overlay/window.css), and there is no shadow, as v1 had none.
 */
export const clearWindowOptions = {
  transparent: true,
  backgroundColor: '#00000000',
  hasShadow: false,
} as const satisfies Pick<BrowserWindowConstructorOptions, 'transparent' | 'backgroundColor' | 'hasShadow'>;

/** The app window: the acrylic behind a clear background, or the solid background. */
export function frostedWindowOptions(
  acrylic: boolean,
): Pick<BrowserWindowConstructorOptions, 'backgroundColor' | 'backgroundMaterial'> {
  return acrylic
    ? { backgroundMaterial: 'acrylic', backgroundColor: '#00000000' }
    : { backgroundColor: solidBackground };
}
