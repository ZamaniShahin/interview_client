/// <reference lib="dom" />
// The first run's setup (1.14) in the built app's own window, against the preview: Help runs it, the sound check hears
// the preview's scripted interview through a session of its own, and Test hiding opens the real overlay window with its
// test card, which must be left out of captures like the overlay itself.
//
//   node scripts/app-tests.mjs      Windows only; the rest of the suite skips it
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { displayAffinity, excludedFromCapture, launch, page, runAppTests, windowsOf } from './windows';

describe.skipIf(!runAppTests)('the first run in the built app, against the preview (1.14)', { timeout: 90_000 }, () => {
  let app: ElectronApplication;
  let home: Page;

  const heading = async () => (await home.locator('h1').first().textContent())?.trim();
  const click = (name: string) => home.getByRole('button', { name, exact: true }).click();

  beforeAll(async () => {
    app = await launch();
    home = await page(app, 'app/index.html');
    // The preview's setup was finished: Help runs it again.
    await home.getByRole('button', { name: 'Help' }).click();
    await click('Run the setup');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('starts at sign-in, the notice already read, and keeps the documents as they were', async () => {
    expect(await heading()).toBe("You're signed in");
    await click('Continue');
    expect(await heading()).toBe('Your documents');
    expect(await home.getByLabel('Your name').inputValue()).toBe('Sam Rivera');
    await click('Continue');
    expect(await heading()).toBe('The sound check');
  });

  it("hears this computer's sound through a session of its own, in this window, and passes", async () => {
    await click('Start the sound check');
    await home.getByText('Sotto can hear it.').waitFor({ timeout: 20_000 });

    const during = await windowsOf(app);
    expect(during.some((w) => w.url.includes('capture/index.html'))).toBe(true);
    expect(during.some((w) => w.url.includes('overlay/index.html'))).toBe(false);

    await click('Continue');
    expect(await heading()).toBe('Your hands stay on the call');
    // Leaving the check ended its session, and capture with it.
    await expect.poll(async () => (await windowsOf(app)).some((w) => w.url.includes('capture/index.html'))).toBe(false);
  });

  it("shows the overlay's test card in the real overlay window, left out of captures", async () => {
    await click('Continue');
    expect(await heading()).toBe('Test hiding');

    await click('Show the overlay');
    // The overlay's page in its test mode, whatever it is told before the mode (`?glass=1`).
    const card = await page(app, '#hiding-test');
    await card.getByText('Testing hiding').waitFor();
    const test = (await windowsOf(app)).find((w) => w.url.includes('#hiding-test'))!;
    await expect
      .poll(async () => (await windowsOf(app)).find((w) => w.url.includes('#hiding-test'))?.visible)
      .toBe(true);
    expect(displayAffinity([test.handle])).toEqual([excludedFromCapture]);
    // No tooltips: a title attribute anywhere, or an SVG title (the page's own <title> in its head names the window).
    expect(await card.evaluate(() => document.querySelectorAll('[title], svg title').length)).toBe(0);

    await click("It's hidden");
    await home.getByText('Sotto is hidden from your share.').waitFor();
    await expect.poll(async () => (await windowsOf(app)).some((w) => w.url.includes('#hiding-test'))).toBe(false);
  });

  it('finishes back in Help, and the sound check is kept as passed today', async () => {
    await click('Finish');
    // Back where the setup was run from: Help.
    await home.locator('.wizard').waitFor({ state: 'detached' });
    expect(await heading()).toBe('Help');

    // Home lists what is missing only while AUTO isn't ready; the preview has both documents, so read main's state.
    const state = (await home.evaluate(() =>
      (window as unknown as { appApi: { getState(): Promise<unknown> } }).appApi.getState(),
    )) as {
      account: { readiness: { soundCheck: string | null } };
      firstRun: { finished: boolean; hidingTested: boolean };
    };
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(state.account.readiness.soundCheck).toBe(`passed ${today}`);
    expect(state.firstRun).toMatchObject({ finished: true, hidingTested: true });
    expect(await home.evaluate(() => document.querySelectorAll('[title], select').length)).toBe(0);
  });
});
