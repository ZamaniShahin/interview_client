/// <reference lib="dom" />
// Screenshots in the built app, against the preview (3.6): the region selector laid over the screen out of captures,
// a drag attaching its area in MANUAL, a right-click giving up, and AUTO answering about the screen at once with the
// note typed. It needs a desktop to capture: run it with the screen unlocked.
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { displayAffinity, excludedFromCapture, launch, page, runAppTests as run } from './windows';

describe.skipIf(!run)('screenshots in the built app, against the preview (3.6)', { timeout: 90_000 }, () => {
  let app: ElectronApplication;
  let overlay: Page;

  /** The selector window, once it is on screen: whether it is visible, and left out of captures. */
  async function selectorWindow(): Promise<{ visible: boolean; excluded: boolean } | null> {
    const found = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('selector/index.html'));
      return w ? { handle: w.getNativeWindowHandle().readBigUInt64LE(0).toString(), visible: w.isVisible() } : null;
    });
    if (!found) return null;
    return { visible: found.visible, excluded: displayAffinity([found.handle])[0] === excludedFromCapture };
  }

  async function shownSelector(): Promise<Page> {
    const selector = await page(app, 'selector/index.html');
    await expect.poll(selectorWindow, { timeout: 10_000 }).toEqual({ visible: true, excluded: true });
    return selector;
  }

  async function selectorGone(): Promise<void> {
    await expect.poll(selectorWindow, { timeout: 10_000 }).toBeNull();
  }

  beforeAll(async () => {
    app = await launch();
    const home = await page(app, 'app/index.html');
    await home.locator('input[type=checkbox]').check();
    await home.getByRole('button', { name: 'Start session' }).click();
    overlay = await page(app, 'overlay/index.html');
    await overlay
      .getByText(/MANUAL|AUTO/)
      .first()
      .waitFor({ timeout: 20_000 });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('in MANUAL, lays the selector over the screen out of captures, and attaches the area dragged', async () => {
    await overlay.getByRole('button', { name: 'MANUAL' }).click();
    await overlay.getByRole('button', { name: /^Screenshot of an area, for your next question/ }).click();

    const selector = await shownSelector();
    // Windows may swallow the press on a window that can't take focus: a move with the button held starts the drag.
    await selector.mouse.move(100, 100);
    await selector.mouse.down();
    await selector.mouse.move(420, 340, { steps: 8 });
    await selector.mouse.up();

    await selectorGone();
    const tray = overlay.getByRole('region', { name: 'Screenshots for your next question' });
    await tray.getByText('1 of 5').waitFor({ timeout: 10_000 });
    expect(await tray.locator('img').getAttribute('src')).toMatch(/^data:image\/(png|jpeg);base64,/);
    // The area is smaller than the screen: the picture is the dragged one, not the whole display.
    const size = await tray
      .locator('img')
      .evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    const screen = await overlay.evaluate(() => ({
      w: window.screen.width * devicePixelRatio,
      h: window.screen.height * devicePixelRatio,
    }));
    expect(size.w).toBeLessThan(screen.w);
    expect(size.h).toBeLessThan(screen.h);
  });

  it('gives a selection up on a right-click, attaching nothing', async () => {
    // The last capture's gap first (1.5 s).
    await new Promise((resolve) => setTimeout(resolve, 1_600));
    await overlay.getByRole('button', { name: /^Screenshot of an area/ }).click();

    const selector = await shownSelector();
    await selector.mouse.click(300, 300, { button: 'right' });

    await selectorGone();
    await overlay.getByText('1 of 5').waitFor();
    expect(await overlay.locator('.tray img').count()).toBe(1);
  });

  it('answers what was heard with the screenshots attached, which then show under the answer', async () => {
    await overlay.getByRole('button', { name: /Answer with the screenshots/ }).click();

    await overlay
      .getByRole('list', { name: 'Screenshots this answer read' })
      .locator('img')
      .first()
      .waitFor({ timeout: 10_000 });
    expect(await overlay.getByRole('region', { name: 'Screenshots for your next question' }).count()).toBe(0);
  });

  it('in AUTO, answers about the whole screen at once, with the note typed', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_600));
    await overlay.getByRole('button', { name: 'AUTO' }).click();
    await overlay.locator('textarea').fill('the loop on the left');
    await overlay.getByRole('button', { name: /^Screenshot of an area, answered at once/ }).click();

    const selector = await shownSelector();
    // A click, not a drag: the whole display.
    await selector.mouse.click(500, 400);

    await selectorGone();
    await overlay.getByRole('heading', { name: 'About the screen: the loop on the left' }).waitFor({ timeout: 10_000 });
    expect(await overlay.locator('textarea').inputValue()).toBe('');
  });
});
