// The window outside sessions: setup, Home, Prepare, the account, Settings. A proposal of the UI canvas (backend
// decisions.md, Q15): the design handoff left open whether these live in the overlay or in a roomier window.
import { app, BrowserWindow } from 'electron';
import { glassSupported, glassWindowOptions } from './glass';
import { keepOutOfCapture, lockDown } from './stealth';
import { loadPage, preloadPath } from './load-page';

export function createAppWindow(): BrowserWindow {
  const glass = glassSupported();
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 760,
    minHeight: 520,
    show: false,
    // The app draws its own title bar, like the overlay, and Windows 11 rounds its corners (overlay-window.ts).
    frame: false,
    roundedCorners: true,
    // Windows 11's acrylic behind a clear background, or the solid one (glass.ts).
    ...glassWindowOptions(glass),
    title: 'Sotto',
    webPreferences: {
      preload: preloadPath('app'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  // A call may already be running while the user is in here: this window stays out of captures too.
  keepOutOfCapture(win);
  lockDown(win.webContents);
  void loadPage(win, 'app', undefined, { glass });
  return win;
}
