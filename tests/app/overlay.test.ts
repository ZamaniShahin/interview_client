/// <reference lib="dom" />
// The built app's own windows, driven by Playwright, against the preview: the development stand-in for the hub, which
// plays a scripted interview (1.13). What only a real Chromium shows: Mermaid drawing under the app's Content Security
// Policy, the sanitized SVG, the clipboard, and the windows' display affinity (stealth rule 1, after hide and show).
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
//
// It restores the clipboard it borrows. The rest of the suite skips it.
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { displayAffinity, excludedFromCapture, launch, page, runAppTests as run } from './windows';

describe.skipIf(!run)('the built app, against the preview (1.13)', { timeout: 60_000 }, () => {
  let app: ElectronApplication;
  let home: Page;
  let overlay: Page;
  const errors: string[] = [];
  let clipboardBefore = '';

  beforeAll(async () => {
    app = await launch();
    clipboardBefore = await app.evaluate(({ clipboard }) => clipboard.readText());

    home = await page(app, 'app/index.html');
    await home.locator('input[type=checkbox]').check();
    await home.getByRole('button', { name: 'Start session' }).click();
    overlay = await page(app, 'overlay/index.html');
    overlay.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await overlay
      .getByText(/MANUAL|AUTO/)
      .first()
      .waitFor({ timeout: 20_000 });
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), clipboardBefore).catch(() => {});
    await app.close();
  });

  it("draws the interview's diagram with Mermaid, under the app's own Content Security Policy", async () => {
    const drawing = overlay.locator('.dia[role="img"] svg');
    await drawing.waitFor({ timeout: 30_000 });

    const labels = await drawing.locator('text').allTextContents();
    expect(labels.join(' ')).toContain('Load balancer');
    expect(labels.join(' ')).toContain('Key-value store');
    expect(errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
  });

  it('keeps nothing of the drawing that would show a tooltip or reach out: no title, link or HTML', async () => {
    const drawing = overlay.locator('.dia[role="img"] svg');
    await drawing.waitFor({ timeout: 30_000 });

    const found = await drawing.evaluate((svg) => ({
      titles: svg.querySelectorAll('title').length,
      titled: svg.querySelectorAll('[title]').length,
      links: svg.querySelectorAll('a').length,
      html: svg.querySelectorAll('foreignObject').length,
      scripts: svg.querySelectorAll('script').length,
    }));
    expect(found).toEqual({ titles: 0, titled: 0, links: 0, html: 0, scripts: 0 });
  });

  it('colors code in the canvas colors and copies it as the model wrote it', async () => {
    await overlay.evaluate(() =>
      (window as unknown as { overlayApi: { command(c: unknown): Promise<unknown> } }).overlayApi.command({
        type: 'ask',
        mode: 3,
        text: 'It says the | operator is not supported.',
      }),
    );
    // Once the answer has finished: Copy takes what is written so far, as it should.
    await overlay.locator('.code pre code', { hasText: 'Optional[str]:' }).waitFor({ timeout: 15_000 });
    await overlay.getByText('Writing…').waitFor({ state: 'detached', timeout: 15_000 });
    const keyword = overlay.locator('.code .hljs-keyword').first();

    expect(await overlay.locator('.code .hljs-keyword').allTextContents()).toEqual(['from', 'import', 'def']);
    const colors = await keyword.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--syn-key)';
      document.body.append(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return { keyword: getComputedStyle(element).color, token };
    });
    expect(colors.keyword).toBe(colors.token);

    const copy = overlay.getByRole('button', { name: 'Copy the Python code' });
    await copy.click();
    // Windows' clipboard keeps text with CRLF line ends.
    const pasted = (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(/\r\n/g, '\n');
    expect(pasted).toBe('from typing import Optional\n\ndef first_unique(s: str) -> Optional[str]:\n');
    expect(await copy.textContent()).toContain('Copied');
  });

  it('keeps every window on screen out of captures, and each one again as it shows (stealth rule 1)', async () => {
    const windows = async () => {
      const list = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => ({
          page: /\/(\w+)\/index\.html/.exec(w.webContents.getURL())?.[1] ?? w.webContents.getURL(),
          handle: w.getNativeWindowHandle().readBigUInt64LE(0).toString(),
          visible: w.isVisible(),
        })),
      );
      const affinities = displayAffinity(list.map((w) => w.handle));
      return Object.fromEntries(
        list.map((w, i) => [w.page, { visible: w.visible, excluded: affinities[i] === excludedFromCapture }]),
      );
    };
    const showAgain = (page: string, hideFirst: boolean) =>
      app.evaluate(
        ({ BrowserWindow }, { page, hideFirst }) => {
          const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes(`${page}/index.html`))!;
          if (hideFirst) w.hide();
          // As the app shows its windows: inactive, never taking focus from the call (stealth rule 6).
          w.showInactive();
        },
        { page, hideFirst },
      );

    // In a session the overlay is on screen, the app window steps aside (Q15), and the capture window never shows.
    // Windows forgets the affinity of a window it hides, which is why stealth.ts sets it again on every show.
    expect(await windows()).toEqual({
      overlay: { visible: true, excluded: true },
      app: { visible: false, excluded: false },
      capture: { visible: false, excluded: false },
    });

    await showAgain('overlay', true);
    await showAgain('app', false);
    expect(await windows()).toMatchObject({
      overlay: { visible: true, excluded: true },
      app: { visible: true, excluded: true },
    });
  });

  it('shows no tooltip, no native list and no other pointer, in either window (stealth rules 2 to 4)', async () => {
    for (const window of [home, overlay]) {
      const found = await window.evaluate(() => ({
        titled: document.querySelectorAll('[title]').length,
        svgTitles: document.querySelectorAll('svg title').length,
        selects: document.querySelectorAll('select').length,
        pointers: Array.from(document.querySelectorAll('body, body *'))
          .map((element) => getComputedStyle(element).cursor)
          .filter((cursor) => cursor !== 'default').length,
      }));
      expect(found, window.url()).toEqual({ titled: 0, svgTitles: 0, selects: 0, pointers: 0 });
    }
  });
});
