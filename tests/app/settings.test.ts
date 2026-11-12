/// <reference lib="dom" />
// Settings in the built app, against the preview (3.13): a hotkey changed by pressing the new keys, kept, and named by
// the overlay in the next session; and the glass (2026-11-12): each window's background at the opacity chosen for it,
// over the backdrop Windows draws, tinted by the theme. What Windows draws is read from Windows, never from the screen.
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { glassSupported } from '../../src/main/windows/glass';
import { acrylicBackdrop, launch, page, runAppTests as run, windowLook, windowsOf } from './windows';

/** Whether this Windows draws the glass (11 22H2 or later); without it, the overlay fades whole and nothing is clear. */
const glass = glassSupported();

/** How Windows draws the window whose page's address contains `part`. */
async function lookOf(app: ElectronApplication, part: string) {
  const window = (await windowsOf(app)).find((w) => w.url.includes(part));
  return windowLook([window!.handle])[0]!;
}

describe.skipIf(!run)('settings in the built app, against the preview (3.13)', { timeout: 90_000 }, () => {
  let app: ElectronApplication;
  let home: Page;

  beforeAll(async () => {
    app = await launch();
    home = await page(app, 'app/index.html');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('changes the screenshot key by pressing the new keys, and refuses one that clashes', async () => {
    await home.getByRole('button', { name: 'Settings', exact: true }).click();
    await home.getByRole('button', { name: 'Change “Screenshot of an area”' }).click();
    await home.keyboard.press('Control+Shift+KeyH');
    await home.getByRole('alert').getByText('“Hide or show the overlay” has that one.').waitFor();
    await home.keyboard.press('Control+Alt+KeyS');
    await home.getByRole('button', { name: 'Save', exact: true }).click();

    const keys = home
      .getByRole('list', { name: 'Hotkeys' })
      .getByRole('listitem')
      .filter({ hasText: 'Screenshot of an area' });
    await keys.getByRole('button', { name: 'Put back “Screenshot of an area”' }).waitFor();
    expect(await keys.textContent()).toContain('Alt');
  });

  it("paints the app window's background at the opacity chosen for it, the text solid, on glass the theme tints", async () => {
    await home.getByRole('button', { name: 'Settings', exact: true }).click();
    const background = () => home.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const dark = () => app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors);
    expect(await home.evaluate(() => document.documentElement.classList.contains('glass'))).toBe(glass);

    if (glass) {
      const slider = home.getByRole('slider', { name: 'Window background' });
      expect(await slider.inputValue()).toBe('80');
      await slider.focus();
      await home.keyboard.press('ArrowLeft');
      await home.keyboard.press('ArrowLeft');
      await expect.poll(background).toBe('rgba(17, 17, 19, 0.7)');
      // Only the window's own background fades: the page under it is clear, the text over it solid.
      expect(await home.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(
        'rgba(0, 0, 0, 0)',
      );
      expect(await home.evaluate(() => getComputedStyle(document.querySelector('h1')!).color)).toBe(
        'rgb(244, 244, 245)',
      );
      expect(await lookOf(app, '/app/')).toEqual({ layered: false, backdrop: acrylicBackdrop, dark: true });
    } else {
      expect(await background()).toBe('rgb(17, 17, 19)');
    }

    // The theme chosen here tints what Windows draws, not Windows' own theme.
    const theme = home.getByRole('group', { name: 'Theme' });
    await theme.getByRole('button', { name: 'Light' }).click();
    await expect.poll(dark).toBe(false);
    if (glass) {
      await expect.poll(background).toBe('rgba(243, 243, 245, 0.7)');
      await expect.poll(async () => (await lookOf(app, '/app/')).dark).toBe(false);
    }
    await theme.getByRole('button', { name: 'Dark' }).click();
    await expect.poll(dark).toBe(true);
    if (glass) await expect.poll(async () => (await lookOf(app, '/app/')).dark).toBe(true);

    // The overlay's, two steps up from 75%, for the session below.
    const overlay = home.getByRole('slider', { name: glass ? 'Overlay background' : 'Overlay opacity' });
    expect(await overlay.inputValue()).toBe('75');
    await overlay.focus();
    await home.keyboard.press('ArrowRight');
    await home.keyboard.press('ArrowRight');
    await expect.poll(() => overlay.getAttribute('aria-valuetext')).toBe('85%');
  });

  it('names the new key in the next session’s overlay', async () => {
    await home.getByRole('button', { name: 'Home', exact: true }).click();
    await home.locator('input[type=checkbox]').check();
    await home.getByRole('button', { name: 'Start session' }).click();
    const overlay = await page(app, 'overlay/index.html');
    await overlay.getByRole('button', { name: /Screenshot of an area, answered at once \(Ctrl\+Alt\+S\)/ }).waitFor();
  });

  it("paints the overlay's background at the overlay's own opacity, the window itself left whole", async () => {
    const overlay = await page(app, 'overlay/index.html');
    const opacity = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('/overlay/'))!
          .getOpacity(),
      );
    if (glass) {
      await expect
        .poll(() => overlay.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe('rgba(17, 17, 19, 0.85)');
      // Never faded as a window, so never made a layered one: the glass is drawn on it as on the app window.
      expect(await opacity()).toBe(1);
      expect(await lookOf(app, '/overlay/')).toEqual({ layered: false, backdrop: acrylicBackdrop, dark: true });
    } else {
      // Windows keeps a window's opacity in a byte: 85% is 216/255.
      expect(await opacity()).toBeCloseTo(0.85, 2);
    }
  });
});
