/// <reference lib="dom" />
// Settings in the built app, against the preview (3.13): a hotkey changed by pressing the new keys, kept, and named by
// the overlay in the next session.
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, page, runAppTests as run } from './windows';

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

  it('names the new key in the next session’s overlay', async () => {
    await home.getByRole('button', { name: 'Home', exact: true }).click();
    await home.locator('input[type=checkbox]').check();
    await home.getByRole('button', { name: 'Start session' }).click();
    const overlay = await page(app, 'overlay/index.html');
    await overlay.getByRole('button', { name: /Screenshot of an area, answered at once \(Ctrl\+Alt\+S\)/ }).waitFor();
  });
});
