/// <reference lib="dom" />
// The preferences in the built app, against the preview (3.8): a prepared answer kept through Prepare's answer bank,
// and in a session the 📌 card, the user's own answer shown at once when the interviewer's question matches one. The
// preview's scripted interview asks about hot keys, which its sample bank prepared.
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, page, runAppTests as run } from './windows';

describe.skipIf(!run)('the preferences in the built app, against the preview (3.8)', { timeout: 90_000 }, () => {
  let app: ElectronApplication;
  let home: Page;

  beforeAll(async () => {
    app = await launch();
    home = await page(app, 'app/index.html');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('keeps a prepared answer added in Prepare, and the custom instructions', async () => {
    await home.getByRole('button', { name: 'Prepare', exact: true }).click();
    await home.getByRole('button', { name: 'Answer bank', exact: true }).click();
    await home.getByRole('button', { name: 'Add a prepared answer' }).click();
    await home.getByLabel('The question').fill('Why payments?\nWhy fintech?');
    await home.getByLabel('Your answer').fill('Money moves, and I like making it move safely.');
    await home.getByRole('button', { name: 'Save', exact: true }).click();

    const bank = home.getByRole('list', { name: 'Prepared answers' });
    await bank.getByText('Why payments?').waitFor();
    // The sample bank's one, then the new one, in the order added.
    expect(await bank.locator('.question').allTextContents()).toEqual([
      'How would you handle hot keys?',
      'Why payments?',
    ]);

    await home.getByRole('button', { name: 'Instructions', exact: true }).click();
    await home.getByLabel('Custom instructions').fill('Keep answers short.');
    await home.getByRole('button', { name: 'Save', exact: true }).click();
    await home.getByRole('status').getByText('Saved.').waitFor();
  });

  it('drafts answers from the documents, keeping one in the bank and skipping the other (3.9)', async () => {
    await home.getByRole('button', { name: 'Answer bank', exact: true }).click();
    await home.getByRole('button', { name: 'Draft answers' }).click();
    const drafts = home.getByRole('list', { name: 'Drafted answers' });
    await drafts.waitFor({ timeout: 15_000 });
    expect(await drafts.getByRole('listitem').count()).toBe(2);

    await home.getByRole('button', { name: 'Keep “Why do you want to work on payments?”' }).click();
    await home
      .getByRole('list', { name: 'Prepared answers' })
      .getByText('Why do you want to work on payments?')
      .waitFor();
    await home.getByRole('button', { name: 'Skip “How do you handle being on call?”' }).click();
    await drafts.waitFor({ state: 'detached' });
  });

  it("shows the user's own prepared answer at once when the interviewer's question matches it", async () => {
    await home.getByRole('button', { name: 'Home', exact: true }).click();
    await home.locator('input[type=checkbox]').check();
    await home.getByRole('button', { name: 'Start session' }).click();
    const overlay = await page(app, 'overlay/index.html');

    // The scripted interview asks three questions; the second is about hot keys. Back to it, once all are asked.
    await overlay
      .getByRole('heading', { name: 'What happens if the cache goes down completely?' })
      .waitFor({ timeout: 30_000 });
    await overlay.getByRole('button', { name: 'Earlier answer' }).click();
    await overlay.getByRole('heading', { name: 'How would you handle hot keys in the cache?' }).waitFor();

    const card = overlay.getByRole('region', { name: 'Your prepared answer' });
    await card.waitFor();
    expect(await card.textContent()).toContain('for “How would you handle hot keys?”');
    expect(await card.textContent()).toContain('At Northwind one merchant made 30% of our reads.');

    // The first question matched nothing prepared: no card.
    await overlay.getByRole('button', { name: 'Earlier answer' }).click();
    await overlay.getByRole('heading', { name: 'Design a URL shortener for millions of users a day.' }).waitFor();
    expect(await overlay.getByRole('region', { name: 'Your prepared answer' }).count()).toBe(0);
  });
});
