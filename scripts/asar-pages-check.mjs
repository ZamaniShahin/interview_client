// Checks that a packaged app's pages load from inside its archive through app://sotto/ (4.1), as the packaged app
// loads them: Electron serves the archive's out/renderer with the same handler, opens each page hidden, and reports
// whether it drew. Run with the development Electron (the packaged one refuses --inspect and running as Node):
//
//   npx electron scripts/asar-pages-check.mjs [dist/win-unpacked/resources/app.asar]
import { join, normalize, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, net, protocol } from 'electron';

const archive = resolve(process.argv.find((a) => a.endsWith('.asar')) ?? 'dist/win-unpacked/resources/app.asar');
const root = join(archive, 'out', 'renderer');

// The same rules as main/windows/app-protocol.ts, kept small here: the host, then a path inside the pages.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// As the app does: closing a window doesn't end the check (Electron's default would quit, failing the next load).
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (url.host !== 'sotto' || relative(root, file).startsWith('..'))
      return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  let failed = 0;
  // Kept open until the end, as the app keeps its windows.
  const windows = [];
  for (const [page, selector] of [
    ['app', '#app > *'],
    ['overlay', '#app > *'],
    ['selector', '#frame'],
  ]) {
    // Each page with its own preload, from the archive too; main's handlers aren't here, so a call answers nothing.
    const win = new BrowserWindow({
      show: false,
      webPreferences: { preload: join(archive, 'out', 'preload', `${page}.js`), sandbox: true, contextIsolation: true },
    });
    const errors = [];
    win.webContents.on('did-fail-load', (_e, code, description, url) => errors.push(`${code} ${description} ${url}`));
    win.webContents.on('console-message', (event) => {
      // A call to main finds no handler here: that error is the harness's, not the page's.
      if (event.level === 'error' && !/No handler registered/.test(event.message)) errors.push(event.message);
    });
    try {
      await win.loadURL(`app://sotto/${page}/index.html`);
      await new Promise((r) => setTimeout(r, 1500));
      const drawn = await win.webContents.executeJavaScript(
        `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      );
      const ok = drawn && errors.length === 0;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${page}: ${drawn ? 'drawn' : 'not drawn'}${errors.length ? ` (${errors.join('; ')})` : ''}`,
      );
      if (!ok) failed += 1;
    } catch (error) {
      console.log(`FAIL ${page}: ${error.message}`);
      failed += 1;
    }
    windows.push(win);
  }
  for (const win of windows) win.destroy();
  app.exit(failed ? 1 : 0);
});
