/// <reference lib="dom" />
// The built app's own windows, driven by Playwright, against the preview: the development stand-in for the hub, which
// plays a scripted interview (1.13). What only a real Chromium shows: Mermaid drawing under the app's Content Security
// Policy, the sanitized SVG, the clipboard, and the windows' display affinity (stealth rule 1, after hide and show).
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
//
// It restores the clipboard it borrows. The rest of the suite skips it.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const run = process.env['SOTTO_APP'] === '1' && process.platform === 'win32';

/** WDA_EXCLUDEFROMCAPTURE: the window is left out of every capture, a screen share's included. */
const excludedFromCapture = 0x11;

/** Each window's display affinity, read with user32's GetWindowDisplayAffinity. */
function displayAffinity(handles: string[]): number[] {
  const script =
    "$ProgressPreference = 'SilentlyContinue'\n" +
    'Add-Type -Namespace Sotto -Name Win -MemberDefinition \'[DllImport("user32.dll")] public static extern bool ' +
    "GetWindowDisplayAffinity(IntPtr hWnd, out uint affinity);'\n" +
    `foreach ($h in @(${handles.join(',')})) { $a = [uint32]0; [void][Sotto.Win]::GetWindowDisplayAffinity([IntPtr][int64]$h, [ref]$a); $a }`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.trim().split(/\r?\n/).map(Number);
}

async function page(app: ElectronApplication, part: string): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    const found = app.windows().find((w) => w.url().includes(part));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No ${part} window.`);
}

describe.skipIf(!run)('the built app, against the preview (1.13)', { timeout: 60_000 }, () => {
  let app: ElectronApplication;
  let home: Page;
  let overlay: Page;
  const errors: string[] = [];
  let clipboardBefore = '';

  beforeAll(async () => {
    const env = { ...process.env } as Record<string, string>;
    delete env['ELECTRON_RUN_AS_NODE'];
    app = await electron.launch({ args: ['.'], cwd: root, env });
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
