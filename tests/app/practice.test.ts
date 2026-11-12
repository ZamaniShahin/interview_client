/// <reference lib="dom" />
// Practice in the built app, against the preview (Shahin, 2026-11-12, with the server's 3.3): a practice of two
// questions started on the Practice page, answered by typing, scored, a weak answer followed up, then the summary,
// the two lowest offered again, and the practice kept in History with each answer's feedback. All of it in the app
// window: no overlay opens. The preview's interviewer scores by length: 40 words or more is an 8, a few words a 3.
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, page, runAppTests as run, windowsOf } from './windows';

const longAnswer =
  'At Northwind our checkout failed twice a week because retries charged cards twice. I added idempotency keys to ' +
  'every payment call, a replay test that ran on each deploy, and an alert on duplicate charges. The failures stopped: ' +
  'none in the six months since, and support tickets about double charges fell to zero.';

describe.skipIf(!run)('practice in the built app, against the preview', { timeout: 90_000 }, () => {
  let app: ElectronApplication;
  let home: Page;

  beforeAll(async () => {
    app = await launch();
    home = await page(app, 'app/index.html');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const question = () => home.locator('h2.question');
  const send = async (text: string) => {
    await home.getByLabel('Your answer').fill(text);
    await home.getByRole('button', { name: 'Send answer' }).click();
  };
  const score = () => home.locator('section[aria-label="Feedback"] .value');

  it('starts a practice of two questions on the Practice page, and opens no overlay', async () => {
    await home.getByRole('button', { name: 'Practice', exact: true }).click();
    await home.getByRole('heading', { name: 'Practice', level: 1 }).waitFor();
    const slider = home.getByRole('slider', { name: 'Questions' });
    expect(await slider.inputValue()).toBe('5');
    await slider.focus();
    for (let i = 0; i < 3; i++) await home.keyboard.press('ArrowLeft');
    await expect.poll(() => slider.inputValue()).toBe('2');
    await home.getByRole('button', { name: 'Start practice' }).click();

    await question().waitFor({ timeout: 15_000 });
    expect(await question().textContent()).toBe(
      'Tell me about a time you disagreed with a teammate. How did you handle it?',
    );
    expect(await home.getByText('Question 1 of 2').count()).toBe(1);
    // Practice is drawn here: the overlay, made for a call, never opens for it.
    expect((await windowsOf(app)).some((w) => w.url.includes('/overlay/'))).toBe(false);
  });

  it('scores a strong answer, and asks the next question when asked', async () => {
    await send(longAnswer);
    await score().waitFor({ timeout: 10_000 });
    expect(await score().textContent()).toBe('8');
    expect(await home.locator('section[aria-label="Feedback"]').textContent()).toContain('A stronger answer');
    await home.getByRole('button', { name: 'Next question' }).click();
    await home.getByText('Question 2 of 2').waitFor({ timeout: 10_000 });
    expect(await question().textContent()).toBe('How would you design a rate limiter for a public API?');
  });

  it('follows up a weak answer once, then offers the results', async () => {
    await send('A token bucket.');
    await score().waitFor({ timeout: 10_000 });
    expect(await score().textContent()).toBe('3');
    await home.getByRole('button', { name: 'Next question' }).click();
    await home.getByText('Follow-up to question 2').waitFor({ timeout: 10_000 });
    expect(await question().textContent()).toContain('Can you make that concrete');

    await send('It limits requests.');
    await score().waitFor({ timeout: 10_000 });
    await home.getByRole('button', { name: 'See the results' }).click();
  });

  it('sums the practice up, and offers its two lowest again', async () => {
    const result = home.locator('.result');
    await result.waitFor({ timeout: 10_000 });
    expect(await result.locator('.value').textContent()).toBe('4.7');
    expect(await result.textContent()).toContain('3 of 3 questions answered');
    const rows = home.locator('ol[aria-label="Questions"] > li');
    expect(await rows.count()).toBe(3);
    expect(await rows.locator('.score').allTextContents()).toEqual(['8', '3', '3']);
    await home.getByRole('button', { name: 'Retry the 2 lowest' }).waitFor();
  });

  it('keeps it in History, with each answer and its feedback', async () => {
    await home.getByRole('button', { name: 'See it in History' }).click();
    const turns = home.locator('ol[aria-label="Practice questions"] > li');
    await turns.first().waitFor({ timeout: 10_000 });
    expect(await turns.count()).toBe(3);
    expect(await turns.first().locator('.said').textContent()).toBe(longAnswer);
    expect(await turns.first().locator('section[aria-label="Feedback"] .value').textContent()).toBe('8');

    await home.getByRole('button', { name: 'All interviews' }).click();
    const row = home.getByRole('list', { name: 'Interviews' }).getByRole('listitem').first();
    expect(await row.textContent()).toContain('3 answered · average 4.7');
    expect(await row.locator('.tag').first().textContent()).toBe('Practice');
  });

  it('lets a session start once the practice is over: its own session ended with it', async () => {
    await home.getByRole('button', { name: 'Home', exact: true }).click();
    await home.locator('input[type=checkbox]').check();
    await home.getByRole('button', { name: 'Start session' }).click();
    await page(app, 'overlay/index.html');
  });
});
