// What the overlay and the app window are made with, and what their pages are told (the glass, Shahin, 2026-11-12):
// the overlay always on clear glass, as v1's, so what is behind it can be read; the app window frosted where Windows
// draws its acrylic, and solid where it draws none. Electron reads a window's background back without its alpha, so
// this is checked where the windows are made, not in the running app.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  made: [] as Record<string, unknown>[],
  packaged: true,
}));
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return electron.packaged;
    },
  },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
  BrowserWindow: class {
    webContents = {};
    constructor(options: Record<string, unknown>) {
      electron.made.push(options);
    }
  },
}));

const loaded = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../src/main/windows/load-page', () => ({
  loadPage: (...args: unknown[]) => {
    loaded.calls.push(args.slice(1));
    return Promise.resolve();
  },
  preloadPath: (page: string) => `${page}.js`,
}));
vi.mock('../../src/main/windows/stealth', () => ({
  keepOutOfCapture: () => {},
  keepOnTop: () => {},
  lockDown: () => {},
}));

const acrylic = vi.hoisted(() => ({ supported: true }));
vi.mock('../../src/main/windows/glass', async (original) => ({
  ...(await original<typeof import('../../src/main/windows/glass')>()),
  acrylicSupported: () => acrylic.supported,
}));

const { createOverlayWindow } = await import('../../src/main/windows/overlay-window');
const { createAppWindow } = await import('../../src/main/windows/app-window');

beforeEach(() => {
  electron.made = [];
  loaded.calls = [];
});

describe('the overlay window', () => {
  it.each([true, false])('is transparent, clear and unshadowed, whatever the acrylic (acrylic %s)', (supported) => {
    acrylic.supported = supported;
    createOverlayWindow({ compact: false });
    expect(electron.made[0]).toMatchObject({ transparent: true, backgroundColor: '#00000000', hasShadow: false });
  });

  it('asks Windows for nothing that blurs what is behind it', () => {
    createOverlayWindow({ compact: false });
    expect(electron.made[0]).not.toHaveProperty('backgroundMaterial');
    expect(electron.made[0]).not.toHaveProperty('vibrancy');
  });

  it('keeps the stealth rules a transparent window could loosen: no frame, no resize border, no taskbar button', () => {
    createOverlayWindow({ compact: false });
    expect(electron.made[0]).toMatchObject({ frame: false, resizable: false, skipTaskbar: true, show: false });
  });

  it.each<[boolean, string | undefined]>([
    [false, undefined],
    [true, 'hiding-test'],
  ])('tells its page it is on clear glass (Test hiding: %s)', (hidingTest, hash) => {
    createOverlayWindow({ compact: true, hidingTest });
    expect(loaded.calls).toEqual([['overlay', hash, { glass: 'clear' }]]);
  });
});

describe('the app window', () => {
  it('is frosted where Windows draws its acrylic, and its page is told so', () => {
    acrylic.supported = true;
    createAppWindow();
    expect(electron.made[0]).toMatchObject({ backgroundMaterial: 'acrylic', backgroundColor: '#00000000' });
    expect(electron.made[0]).not.toHaveProperty('transparent');
    expect(loaded.calls).toEqual([['app', undefined, { glass: 'frosted' }]]);
  });

  it('is solid where Windows draws none, and its page is told nothing', () => {
    acrylic.supported = false;
    createAppWindow();
    expect(electron.made[0]).toMatchObject({ backgroundColor: '#111113' });
    expect(electron.made[0]).not.toHaveProperty('backgroundMaterial');
    expect(electron.made[0]).not.toHaveProperty('transparent');
    expect(loaded.calls).toEqual([['app', undefined, {}]]);
  });

  it('stays resizable, with Windows’ own corners, as a transparent window could not be', () => {
    for (const supported of [true, false]) {
      acrylic.supported = supported;
      electron.made = [];
      createAppWindow();
      expect(electron.made[0]).not.toHaveProperty('resizable', false);
      expect(electron.made[0]).toMatchObject({ roundedCorners: true, frame: false });
    }
  });
});
