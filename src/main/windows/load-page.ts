import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import { appUrl } from './app-protocol';

export type Page = 'overlay' | 'app' | 'capture' | 'selector' | 'documents';

/** Where the built pages are: served as app://sotto/ (app-protocol.ts). */
export const rendererRoot = join(__dirname, '../renderer');

/**
 * Development loads the page from electron-vite's server, so edits reload; a built app loads its own files, from
 * app://sotto/ (4.1). The server's address is honored only in development: a packaged app must never load a page
 * named by its environment.
 */
/** `hash` picks a page's mode: the overlay's Test hiding card, say. */
export function loadPage(win: BrowserWindow, page: Page, hash?: string): Promise<void> {
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServer) {
    return win.loadURL(`${devServer}/${page}/index.html${hash ? `#${hash}` : ''}`);
  }
  return win.loadURL(appUrl(page, hash));
}

export function preloadPath(page: Page): string {
  return join(__dirname, `../preload/${page}.js`);
}
