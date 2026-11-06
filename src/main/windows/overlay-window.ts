// The overlay: the product. Always on top, never in a capture, no system frame, and it never takes focus by itself.
import { app, BrowserWindow, screen } from 'electron';
import { keepOnTop, keepOutOfCapture, lockDown } from './stealth';
import { loadPage, preloadPath } from './load-page';

/** Sizes at 100% scaling (the UI canvas, "The window"); Windows scales them with the display. */
export const overlaySize = {
  full: { width: 420, height: 600 },
  compact: { width: 420, height: 236 },
  min: { width: 360, height: 200 },
} as const;

export function createOverlayWindow(options: { compact: boolean; trayOnly: boolean }): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea;
  const size = options.compact ? overlaySize.compact : overlaySize.full;
  const win = new BrowserWindow({
    ...size,
    // First placed top centre, just under the webcam, so reading looks like eye contact.
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: area.y + 24,
    show: false,
    frame: false,
    // Stealth rule 5: no OS resize border; the ◢ grip resizes through main.
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // A full-screen share shows the taskbar, so during a session Sotto lives in the tray (a setting, on by default).
    skipTaskbar: options.trayOnly,
    backgroundColor: '#111113',
    title: 'Sotto',
    webPreferences: {
      preload: preloadPath('overlay'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // A spell-check suggestion is a native menu: another window a share could see.
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  keepOutOfCapture(win);
  keepOnTop(win);
  lockDown(win.webContents);
  void loadPage(win, 'overlay');
  return win;
}
