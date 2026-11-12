// The glass (Shahin, 2026-11-12): Windows 11 draws a system backdrop behind a window, its acrylic material, which
// blurs whatever is on screen behind it. The page then paints its background at the opacity the user chose, so the
// screen shows through, blurred, while the text stays solid. Windows 10 and older Windows 11 builds have no such
// backdrop: their windows stay solid, as before.
import { release } from 'node:os';
import type { BrowserWindowConstructorOptions } from 'electron';

/** Windows 11 22H2, the first build that draws a window's system backdrop (Electron's `backgroundMaterial`). */
export const firstGlassBuild = 22621;

/** The solid background a window shows before its page paints, and keeps where there is no glass. */
export const solidBackground = '#111113';

/** Whether this computer draws the glass: Windows, build 22621 or later. */
export function glassSupported(platform: string = process.platform, osRelease: string = release()): boolean {
  if (platform !== 'win32') return false;
  const build = Number(osRelease.split('.')[2]);
  return Number.isInteger(build) && build >= firstGlassBuild;
}

/** What a window is made with: the acrylic backdrop behind a clear background, or the solid background. */
export function glassWindowOptions(
  glass: boolean,
): Pick<BrowserWindowConstructorOptions, 'backgroundColor' | 'backgroundMaterial'> {
  return glass ? { backgroundMaterial: 'acrylic', backgroundColor: '#00000000' } : { backgroundColor: solidBackground };
}
