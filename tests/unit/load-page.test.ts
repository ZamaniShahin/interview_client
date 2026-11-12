// Where each window's page comes from (4.1), and what it is told: that Windows draws its glass behind the window
// (`?glass=1`, 2026-11-12), before the page's mode after #.
import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ app: { isPackaged: true } }));
vi.mock('electron', () => ({ app: electron.app, net: {}, protocol: {} }));
const { loadPage } = await import('../../src/main/windows/load-page');

const devServer = 'http://localhost:5173';
const before = process.env['ELECTRON_RENDERER_URL'];

afterEach(() => {
  electron.app.isPackaged = true;
  if (before === undefined) delete process.env['ELECTRON_RENDERER_URL'];
  else process.env['ELECTRON_RENDERER_URL'] = before;
});

/** Where a window was sent: its page loaded as `loadPage` asked. */
async function loaded(...args: Parameters<typeof loadPage> extends [unknown, ...infer Rest] ? Rest : never) {
  const loadURL = vi.fn<(url: string) => Promise<void>>(async () => {});
  await loadPage({ loadURL } as unknown as BrowserWindow, ...args);
  expect(loadURL).toHaveBeenCalledTimes(1);
  return loadURL.mock.calls[0]![0];
}

describe('a page in the built app', () => {
  it.each<[Parameters<typeof loaded>, string]>([
    [['app', undefined, { glass: true }], 'app://sotto/app/index.html?glass=1'],
    [['overlay', undefined, { glass: true }], 'app://sotto/overlay/index.html?glass=1'],
    [['overlay', 'hiding-test', { glass: true }], 'app://sotto/overlay/index.html?glass=1#hiding-test'],
    [['overlay', 'hiding-test', { glass: false }], 'app://sotto/overlay/index.html#hiding-test'],
    [['app', undefined, {}], 'app://sotto/app/index.html'],
    [['selector'], 'app://sotto/selector/index.html'],
    [['capture'], 'app://sotto/capture/index.html'],
  ])('loads %j from %s', async (args, url) => {
    expect(await loaded(...args)).toBe(url);
  });

  it("never loads a page named by its environment, the glass's included", async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'https://evil.example';
    expect(await loaded('app', undefined, { glass: true })).toBe('app://sotto/app/index.html?glass=1');
  });
});

describe('a page in development', () => {
  it.each<[Parameters<typeof loaded>, string]>([
    [['app', undefined, { glass: true }], `${devServer}/app/index.html?glass=1`],
    [['overlay', 'hiding-test', { glass: true }], `${devServer}/overlay/index.html?glass=1#hiding-test`],
    [['overlay', 'hiding-test'], `${devServer}/overlay/index.html#hiding-test`],
    [['app'], `${devServer}/app/index.html`],
  ])('loads %j from the dev server, as %s', async (args, url) => {
    electron.app.isPackaged = false;
    process.env['ELECTRON_RENDERER_URL'] = devServer;
    expect(await loaded(...args)).toBe(url);
  });

  it('loads the built pages when no dev server runs (the preview build)', async () => {
    electron.app.isPackaged = false;
    delete process.env['ELECTRON_RENDERER_URL'];
    expect(await loaded('overlay', undefined, { glass: true })).toBe('app://sotto/overlay/index.html?glass=1');
  });
});
