// The overlay: the product. Always on top, never in a capture, no system frame, and it never takes focus by itself.
import { app, BrowserWindow, screen } from 'electron';
import { clearWindowOptions } from './glass';
import { keepOnTop, keepOutOfCapture, lockDown } from './stealth';
import { loadPage, preloadPath } from './load-page';

/** Sizes at 100% scaling (the UI canvas, "The window"); Windows scales them with the display. */
export const overlaySize = {
  full: { width: 420, height: 600 },
  compact: { width: 420, height: 236 },
  min: { width: 360, height: 200 },
} as const;

/**
 * The overlay window. With `hidingTest`, the same window shows only its Test hiding card (F1 · 5b): what matters there
 * is that it is this window, with all its protections, that the share must leave out.
 */
export function createOverlayWindow(options: { compact: boolean; hidingTest?: boolean }): BrowserWindow {
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
    // A full-screen share shows the taskbar, so a session has no taskbar button, and no tray icon either, as in v1
    // (Q16): the hotkeys reach the overlay.
    skipTaskbar: true,
    // Clear glass, as v1's overlay was (glass.ts): a transparent window, so what is behind it can be read through it
    // at the opacity chosen; the page draws its corners, the canvas's 12 px, on Windows 10 too. Out of captures still.
    ...clearWindowOptions,
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
  void loadPage(win, 'overlay', options.hidingTest ? 'hiding-test' : undefined, { glass: 'clear' });
  return win;
}
