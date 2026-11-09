/// <reference lib="dom" />
// The account and plan screens (2.13) in the built app's own window, against the preview: a top-up is bought in the
// browser while the window waits, and the minutes arrive by themselves; the ledger pages; a computer is removed after
// asking. A purchase never opens a window of the app's own: the provider's page is the browser's.
//
//   node scripts/app-tests.mjs      Windows only; the rest of the suite skips it
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, page, runAppTests, windowsOf } from './windows';

describe.skipIf(!runAppTests)(
  'the account and plan screens in the built app, against the preview (2.13)',
  { timeout: 90_000 },
  () => {
    let app: ElectronApplication;
    let home: Page;

    const heading = async () => (await home.locator('h1').first().textContent())?.trim();
    /** A button by its words; one that opens the browser also says so to screen readers, after them. */
    const click = (name: string) =>
      home
        .getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
        .first()
        .click();

    beforeAll(async () => {
      app = await launch();
      home = await page(app, 'app/index.html');
      await home.getByRole('button', { name: 'Account', exact: true }).click();
    }, 60_000);

    afterAll(async () => {
      await app?.close();
    }, 30_000);

    it("shows the plan with its state's word, when it renews, and the minutes with their lots", async () => {
      expect(await heading()).toBe('Account');
      await home.getByText('Renews Dec 1', { exact: true }).waitFor();
      expect(await home.locator('.tag').first().textContent()).toBe('Active');
      expect(await home.getByText('187 min', { exact: true }).count()).toBe(1);
    });

    it('tops up in the browser while the window waits, and says the minutes arrived', async () => {
      const before = (await windowsOf(app)).length;

      await click('Top up +100 minutes');
      await home.getByText('Finish in your browser.').waitFor();
      await home.getByText('100 minutes added. They last until Nov 9, 2027.').waitFor({ timeout: 10_000 });

      expect(await home.getByText('Finish in your browser.').count()).toBe(0);
      await home.getByText('287 min', { exact: true }).waitFor();
      // The sidebar says it too: one set of words, everywhere.
      expect(await home.locator('nav').getByText('287 min left').count()).toBe(1);
      // The provider's page is the browser's: no window of the app's own opened for it.
      expect((await windowsOf(app)).length).toBe(before);

      await click('OK');
      expect(await home.getByText('100 minutes added.').count()).toBe(0);
    });

    it('pages the ledger by Show earlier, then shows it all', async () => {
      await click('The ledger');
      expect(await heading()).toBe('Minutes ledger');
      expect(await home.getByText('Oct 1', { exact: true }).count()).toBe(0);

      await click('Show earlier');
      await home.getByText('Oct 1', { exact: true }).waitFor();
      expect(await home.getByRole('button', { name: 'Show earlier' }).count()).toBe(0);

      await click('Account ›');
      expect(await heading()).toBe('Account');
    });

    it('removes another computer after asking, and says what the cap leaves', async () => {
      await click('Manage computers');
      expect(await heading()).toBe('Computers');
      await home.getByText('You can remove 3 in 30 days.').waitFor();

      await click('Remove');
      await home.getByText('Remove Laptop?').waitFor();
      await click('Remove Laptop');

      await home.getByText('You can remove 2 more until Dec 9.').waitFor();
      expect(await home.getByText('Laptop', { exact: true }).count()).toBe(0);
      await home.getByText('2 places free.').waitFor();
    });
  },
);
