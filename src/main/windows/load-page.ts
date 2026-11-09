import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';

export type Page = 'overlay' | 'app' | 'capture';

/**
 * Development loads the page from electron-vite's server, so edits reload; a built app loads its own files. The
 * server's address is honored only in development: a packaged app must never load a page named by its environment.
 */
/** `hash` picks a page's mode: the overlay's Test hiding card, say. */
export function loadPage(win: BrowserWindow, page: Page, hash?: string): Promise<void> {
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServer) {
    return win.loadURL(`${devServer}/${page}/index.html${hash ? `#${hash}` : ''}`);
  }
  return win.loadFile(join(__dirname, `../renderer/${page}/index.html`), hash ? { hash } : undefined);
}

export function preloadPath(page: Page): string {
  return join(__dirname, `../preload/${page}.js`);
}
