/// <reference lib="dom" />
// History in the built app, against the preview (3.9): the preview's scripted interview, run and ended, is kept; it
// opens whole in History, its debrief is asked for (the preview's stands in for the server's) and shown, and it can be
// deleted.
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, page, runAppTests as run } from './windows';

describe.skipIf(!run)('history in the built app, against the preview (3.9)', { timeout: 90_000 }, () => {
  let app: ElectronApplication;
  let home: Page;

  beforeAll(async () => {
    app = await launch();
    home = await page(app, 'app/index.html');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('says there is nothing yet before the first session', async () => {
    await home.getByRole('button', { name: 'History', exact: true }).click();
    await home.getByText('No interviews yet. Each session you run is kept here.').waitFor();
  });

  it('keeps the interview a session ran, with each answer it gave', async () => {
    await home.getByRole('button', { name: 'Home', exact: true }).click();
    await home.locator('input[type=checkbox]').check();
    await home.getByRole('button', { name: 'Start session' }).click();
    const overlay = await page(app, 'overlay/index.html');

    // The scripted interview asks three questions; once the third is answered, the session is ended and closed.
    await overlay
      .getByRole('heading', { name: 'What happens if the cache goes down completely?' })
      .waitFor({ timeout: 30_000 });
    await overlay.getByText('Writing…').waitFor({ state: 'detached', timeout: 30_000 });
    await overlay.getByRole('button', { name: 'More' }).click();
    await overlay.getByRole('menuitem', { name: 'End session' }).click();
    await overlay.getByRole('button', { name: 'End session' }).click();
    await overlay.getByRole('button', { name: 'Close', exact: true }).first().click();

    await home.getByRole('button', { name: 'History', exact: true }).click();
    const rows = home.getByRole('list', { name: 'Interviews' }).getByRole('listitem');
    await rows.first().waitFor();
    expect(await rows.count()).toBe(1);
    const row = await rows.first().textContent();
    expect(row).toContain('Senior Backend Engineer, Payments');
    expect(row).toMatch(/3 answers/);
  });

  it('opens it whole, writes its debrief on request, and shows it', async () => {
    await home.getByRole('list', { name: 'Interviews' }).getByRole('button').first().click();
    await home.getByRole('heading', { name: 'Senior Backend Engineer, Payments', level: 1 }).waitFor();
    const exchanges = home.getByRole('list', { name: 'Questions and answers' }).locator(':scope > li');
    expect(await exchanges.count()).toBe(3);
    expect(await exchanges.first().textContent()).toContain('Design a URL shortener for millions of users a day.');

    await home.getByRole('button', { name: 'Get a debrief' }).click();
    await home.getByRole('button', { name: 'Writing your debrief…' }).waitFor();
    const debrief = home.getByRole('region', { name: 'Debrief' });
    await debrief.waitFor({ timeout: 15_000 });
    expect(await debrief.textContent()).toContain('A steady system-design round.');
    await home.getByRole('button', { name: 'Write the debrief again' }).waitFor();
  });

  it('deletes it once asked to confirm', async () => {
    await home.getByRole('button', { name: 'Delete', exact: true }).click();
    await home.getByText('Delete this interview?').waitFor();
    await home.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await home.getByText('No interviews yet. Each session you run is kept here.').waitFor();
  });
});
