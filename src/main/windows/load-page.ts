import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import type { Glass } from '../../shared/glass';
import { appUrl } from './app-protocol';

export type Page = 'overlay' | 'app' | 'capture' | 'selector' | 'documents';

/** Where the built pages are: served as app://sotto/ (app-protocol.ts). */
export const rendererRoot = join(__dirname, '../renderer');

/**
 * Development loads the page from electron-vite's server, so edits reload; a built app loads its own files, from
 * app://sotto/ (4.1). The server's address is honored only in development: a packaged app must never load a page
 * named by its environment. `hash` picks a page's mode (the overlay's Test hiding card, say); `glass` tells the page
 * what is behind its window (`?glass=clear` or `?glass=frosted`, shared/glass.ts).
 */
export function loadPage(
  win: BrowserWindow,
  page: Page,
  hash?: string,
  options: { glass?: Glass } = {},
): Promise<void> {
  const search = options.glass ? `?glass=${options.glass}` : '';
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServer) {
    return win.loadURL(`${devServer}/${page}/index.html${search}${hash ? `#${hash}` : ''}`);
  }
  return win.loadURL(appUrl(page, hash, search));
}

export function preloadPath(page: Page): string {
  return join(__dirname, `../preload/${page}.js`);
}
