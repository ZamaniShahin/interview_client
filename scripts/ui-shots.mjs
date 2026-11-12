// Pictures of the built app's own pages, for reviewing the look: the preview build in out/ (`node scripts/app-tests.mjs`
// makes one, or `npx electron-vite build --mode preview`), each window's own pixels only, never the screen. Behind a
// glassy window, a painted backdrop stands in for the desktop, so translucent surfaces show as they would.
//
//   node scripts/ui-shots.mjs [folder] [dark|light]
/* global document -- the callbacks given to page.evaluate run in the page */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const folder = resolve(process.argv[2] ?? join(root, 'ui-shots'));
const theme = process.argv[3] === 'light' ? 'light' : 'dark';
mkdirSync(folder, { recursive: true });

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], cwd: root, env });

async function windowWith(part) {
  for (let i = 0; i < 200; i++) {
    const found = app.windows().find((w) => w.url().includes(part));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No ${part} window.`);
}

// A desktop behind the glass, painted on <html> under the window's own background (on <body>): a few bright shapes,
// as a busy screen would be, blurred a little as Windows' acrylic blurs it.
const backdrop = `
  html { background:
    radial-gradient(circle at 20% 30%, #3b82f6 0, transparent 35%),
    radial-gradient(circle at 80% 20%, #f59e0b 0, transparent 30%),
    radial-gradient(circle at 60% 80%, #10b981 0, transparent 35%),
    linear-gradient(135deg, #1e293b, #334155) !important; }`;

async function shot(page, name) {
  await page.addStyleTag({ content: backdrop });
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('theme-light', t === 'light');
    document.documentElement.classList.toggle('theme-dark', t === 'dark');
  }, theme);
  await new Promise((r) => setTimeout(r, 400));
  const path = join(folder, `${name}-${theme}.png`);
  await page.screenshot({ path });
  console.log(path);
}

try {
  const home = await windowWith('app/index.html');
  await home.waitForLoadState('domcontentloaded');
  await new Promise((r) => setTimeout(r, 1500));
  await shot(home, 'home');
  for (const [nav, name] of [
    ['Prepare', 'prepare'],
    ['History', 'history'],
    ['Account', 'account'],
    ['Settings', 'settings'],
  ]) {
    await home.getByRole('button', { name: nav, exact: true }).click();
    await shot(home, name);
  }
  await home.getByRole('button', { name: 'Home', exact: true }).click();
  await home.locator('input[type=checkbox]').check();
  await home.getByRole('button', { name: 'Start session' }).click();
  const overlay = await windowWith('overlay/index.html');
  await overlay
    .getByRole('heading', { name: 'Design a URL shortener for millions of users a day.' })
    .waitFor({ timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2500));
  await shot(overlay, 'overlay');
} finally {
  await app.close();
}
