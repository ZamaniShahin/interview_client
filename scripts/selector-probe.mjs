// For a screenshot-selector app test that fails (decisions §15, §23): opens the selector again and again in the built
// preview, touching nothing, and says how each one ended (by itself or not, and whether a click took the whole screen
// or it was given up) with every pointer, mouse and key event its page received. A real click while it shows (the
// selector covers the screen) reads as a hand's: its press held for tens of milliseconds, where Playwright's press and
// release share one. It never captures the screen: what it reads is the page's own events and the overlay's tray.
//
//   npx electron-vite build --mode preview      (or node scripts/app-tests.mjs, which leaves one in out/)
//   node scripts/selector-probe.mjs [rounds]     Windows; the screen unlocked
/* global addEventListener -- the callback given to evaluate runs in the selector's page */
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const rounds = Number(process.argv[2] ?? 12);
const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** The app takes one screenshot each 1.5 s at most (minGapMs, as v1): rounds wait longer than that. */
const gapMs = 1_800;

const app = await electron.launch({ args: ['.'], cwd: root, env });

async function windowWith(part, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const found = app.windows().find((w) => w.url().includes(part));
    if (found) return found;
    await wait(50);
  }
  return null;
}

try {
  const home = await windowWith('app/index.html');
  await home.waitForLoadState('domcontentloaded');
  await home.locator('input[type=checkbox]').check();
  await home.getByRole('button', { name: 'Start session' }).click();
  const overlay = await windowWith('overlay/index.html');
  // The preview's scripted interview takes the screen as each answer starts: begin once it is over.
  await overlay
    .getByRole('heading', { name: 'What happens if the cache goes down completely?' })
    .waitFor({ timeout: 60_000 });
  await overlay.getByText('Writing…').waitFor({ state: 'detached', timeout: 30_000 });
  await overlay.getByRole('button', { name: 'MANUAL' }).click();
  const tray = overlay.getByRole('region', { name: 'Screenshots for your next question' });
  const attached = async () => ((await tray.count()) ? await tray.locator('img').count() : 0);

  for (let round = 1; round <= rounds; round++) {
    await wait(gapMs);
    const before = await attached();
    const t0 = Date.now();
    await overlay.getByRole('button', { name: /^Screenshot of an area, for your next question/ }).click();
    const selector = await windowWith('selector/index.html');
    if (!selector) {
      console.log(`round ${round}: no selector opened`);
      continue;
    }
    const events = [];
    selector.on('console', (msg) => msg.text().startsWith('evt ') && events.push(msg.text().slice(4)));
    let closedAt = null;
    selector.on('close', () => (closedAt = Date.now() - t0));
    await selector
      .evaluate(() => {
        let moves = 0;
        for (const type of ['pointerdown', 'pointerup', 'click', 'contextmenu', 'keydown', 'pointermove']) {
          addEventListener(
            type,
            (e) => {
              if (type === 'pointermove' && ++moves > 4) return;
              console.log(
                `evt ${Math.round(performance.now())}ms ${type} trusted=${e.isTrusted} button=${e.button ?? ''} buttons=${e.buttons ?? ''} key=${e.key ?? ''}`,
              );
            },
            true,
          );
        }
      })
      .catch(() => {});
    // Nothing touches it for 2.5 s: a selector that ends now ended by itself.
    await wait(2_500);
    const alone = closedAt !== null;
    if (!alone) {
      // Given up as a right-click gives it up.
      await selector.mouse.click(10, 10, { button: 'right' }).catch(() => {});
      await wait(600);
    }
    const after = await attached();
    const how = alone
      ? `ENDED BY ITSELF at ${closedAt} ms, ${after > before ? 'a screenshot attached (a click took the screen)' : 'nothing attached (given up)'}`
      : 'stayed until given up';
    console.log(`round ${round}: ${how}${events.length ? `\n    ${events.join(' | ')}` : ''}`);
    if (after >= 5) {
      console.log('The tray is full: stopping.');
      break;
    }
  }
} finally {
  await app.close();
}
