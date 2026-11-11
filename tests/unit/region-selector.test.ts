// The region selector's window (3.6), every way it ends, over a stand-in for Electron: the deep round over 3.6, 3.8
// and 3.10. Whatever happens, the window goes, Esc is given back, and the capture hears once what was chosen or null.
import type { Display } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Selection } from '../../src/shared/screenshots';
import { FakeImage } from './fake-image';

type Listener = (...args: unknown[]) => void;

/** A minimal event source, as Electron's screen, powerMonitor, windows and web contents are. */
class Emitter {
  readonly listeners = new Map<string, Listener[]>();
  on(name: string, listener: Listener): this {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
    return this;
  }
  once(name: string, listener: Listener): this {
    const wrapped: Listener = (...args) => {
      this.removeListener(name, wrapped);
      listener(...args);
    };
    return this.on(name, wrapped);
  }
  removeListener(name: string, listener: Listener): this {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((l) => l !== listener),
    );
    return this;
  }
  emit(name: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(name) ?? []) listener(...args);
  }
  count(): number {
    return [...this.listeners.values()].reduce((n, list) => n + list.length, 0);
  }
}

const electron = vi.hoisted(() => {
  const state = {
    windows: [] as unknown[],
    failNextWindow: false,
    escape: null as (() => void) | null,
    escapeFree: true as boolean | 'throws',
    unregistered: [] as string[],
  };
  return { state };
});

class FakeWindow extends Emitter {
  static nextId = 1;
  readonly webContents = new (class extends Emitter {
    readonly id = FakeWindow.nextId++;
  })();
  readonly calls: string[] = [];
  destroyed = false;
  constructor(readonly options: Record<string, unknown>) {
    super();
    if (electron.state.failNextWindow) {
      electron.state.failNextWindow = false;
      throw new Error('no window');
    }
    electron.state.windows.push(this);
  }
  setAlwaysOnTop(...args: unknown[]) {
    this.calls.push(`setAlwaysOnTop ${args.join(' ')}`);
  }
  setBounds(bounds: unknown) {
    this.calls.push(`setBounds ${JSON.stringify(bounds)}`);
  }
  showInactive() {
    this.calls.push('showInactive');
  }
  moveTop() {
    this.calls.push('moveTop');
  }
  isDestroyed() {
    return this.destroyed;
  }
  destroy() {
    this.destroyed = true;
    this.emit('closed');
  }
}

const screen = new Emitter();
const powerMonitor = new Emitter();

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: FakeWindow,
  screen,
  powerMonitor,
  globalShortcut: {
    register: (key: string, callback: () => void) => {
      if (electron.state.escapeFree === 'throws') throw new Error('no shortcuts');
      if (key === 'Escape' && electron.state.escapeFree) electron.state.escape = callback;
      return electron.state.escapeFree;
    },
    unregister: (key: string) => {
      electron.state.unregistered.push(key);
      if (key === 'Escape') electron.state.escape = null;
    },
  },
}));

const loadPage = vi.hoisted(() => ({ result: Promise.resolve() as Promise<void> }));
vi.mock('../../src/main/windows/load-page', () => ({
  loadPage: () => loadPage.result,
  preloadPath: (name: string) => `${name}.js`,
}));
const stealth = vi.hoisted(() => ({ kept: [] as unknown[], locked: [] as unknown[] }));
vi.mock('../../src/main/windows/stealth', () => ({
  keepOutOfCapture: (win: unknown) => stealth.kept.push(win),
  lockDown: (contents: unknown) => stealth.locked.push(contents),
}));

const { RegionSelector, selectorIdleMs, selectorReadyMs, frameOf } =
  await import('../../src/main/screenshots/region-selector');

const display = { id: 7, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } } as Display;
const other = { id: 8, bounds: { x: 0, y: 0, width: 1920, height: 1080 } } as Display;

describe('the region selector’s window, every way it ends (3.6)', () => {
  let selector: InstanceType<typeof RegionSelector>;

  beforeEach(() => {
    vi.useFakeTimers();
    electron.state.windows = [];
    electron.state.failNextWindow = false;
    electron.state.escape = null;
    electron.state.escapeFree = true;
    electron.state.unregistered = [];
    loadPage.result = Promise.resolve();
    stealth.kept = [];
    stealth.locked = [];
    screen.listeners.clear();
    powerMonitor.listeners.clear();
    selector = new RegionSelector();
  });

  afterEach(() => {
    // A selection a test left showing goes, as quitting ends it.
    selector.cancel();
    vi.useRealTimers();
  });

  const lastWindow = () => electron.state.windows.at(-1) as FakeWindow;

  /** A selection laid over the display, its page painted and the window shown. */
  function open() {
    let settled: Selection | null | 'pending' = 'pending';
    const promise = selector.select(display, new FakeImage(2560, 1440)).then((s) => (settled = s));
    const win = lastWindow();
    return {
      win,
      promise,
      settled: () => settled,
      ready: () => selector.current!.ready(),
    };
  }

  /** What every ending leaves: the window gone, no listener left anywhere, nothing showing. */
  async function expectEnded(win: FakeWindow, promise: Promise<unknown>, expected: Selection | null = null) {
    expect(await promise).toEqual(expected);
    expect(win.destroyed).toBe(true);
    expect(selector.current).toBeNull();
    expect(screen.count()).toBe(0);
    expect(powerMonitor.count()).toBe(0);
  }

  it('lays a window over the display that never takes focus, out of captures, locked down, hidden until painted', () => {
    const { win } = open();
    expect(win.options).toMatchObject({
      ...display.bounds,
      show: false,
      frame: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      type: 'toolbar',
    });
    expect(win.options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    expect(stealth.kept).toEqual([win]);
    expect(stealth.locked).toEqual([win.webContents]);
    expect(win.calls).toEqual(['setAlwaysOnTop true screen-saver 1']);
    expect(selector.current!.contentsId).toBe(win.webContents.id);
    expect(selector.current!.frame).toMatchObject({ width: 2560, height: 1440 });
    expect(selector.current!.frame.image.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('shows it once painted, over the display again, without focus, and holds Esc while it shows', () => {
    const { win, ready } = open();
    expect(electron.state.escape).toBeNull();
    ready();
    expect(win.calls.slice(1)).toEqual([`setBounds ${JSON.stringify(display.bounds)}`, 'showInactive', 'moveTop']);
    expect(electron.state.escape).not.toBeNull();
    // A second "ready" from the page shows nothing again.
    ready();
    expect(win.calls.filter((c) => c === 'showInactive')).toHaveLength(1);
  });

  it.each<[string, Selection | null, Selection | null]>([
    ['a click', { kind: 'full' }, { kind: 'full' }],
    ['a drag', { kind: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, { kind: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 }],
    ['Esc or a right-click on the page', { kind: 'cancel' }, null],
    ['anything that was not an answer', null, null],
  ])('ends with %s, giving the window and Esc back', async (_, choice, expected) => {
    const { win, promise, ready } = open();
    ready();
    selector.current!.finish(choice);
    await expectEnded(win, promise, expected);
    expect(electron.state.unregistered).toEqual(['Escape']);
  });

  it('hears only the first ending', async () => {
    const { win, promise, ready } = open();
    ready();
    const finish = selector.current!.finish;
    finish({ kind: 'full' });
    finish({ kind: 'rect', x: 0, y: 0, w: 1, h: 1 });
    finish(null);
    await expectEnded(win, promise, { kind: 'full' });
    expect(electron.state.unregistered).toEqual(['Escape']);
  });

  it.each<[string, (win: FakeWindow) => void]>([
    ['Esc, held while it shows', () => electron.state.escape!()],
    ['the selection cancelled from main (the hotkey, the session’s end)', () => selector.cancel()],
    ['its page crashing', (win) => win.webContents.emit('render-process-gone')],
    ['its page hanging', (win) => win.webContents.emit('unresponsive')],
    ['its page failing to load', (win) => win.webContents.emit('did-fail-load')],
    ['its preload failing', (win) => win.webContents.emit('preload-error')],
    ['its window closed', (win) => win.emit('closed')],
    ['a display added', () => screen.emit('display-added')],
    ['a display removed', () => screen.emit('display-removed')],
    ['its display moved', () => screen.emit('display-metrics-changed', {}, display, ['bounds'])],
    ['its display rescaled', () => screen.emit('display-metrics-changed', {}, display, ['scaleFactor'])],
    ['its display rotated', () => screen.emit('display-metrics-changed', {}, display, ['workArea', 'rotation'])],
    ['the screen locked', () => powerMonitor.emit('lock-screen')],
    ['the computer sleeping', () => powerMonitor.emit('suspend')],
    ['twenty seconds without a choice', () => vi.advanceTimersByTime(selectorIdleMs)],
  ])('ends with nothing on %s', async (_, end) => {
    const { win, promise, ready } = open();
    ready();
    end(win);
    await expectEnded(win, promise);
  });

  it.each<[string, () => void]>([
    ['another display changing', () => screen.emit('display-metrics-changed', {}, other, ['bounds', 'scaleFactor'])],
    [
      'its display’s work area changing (the taskbar)',
      () => screen.emit('display-metrics-changed', {}, display, ['workArea']),
    ],
    ['nineteen seconds without a choice', () => vi.advanceTimersByTime(selectorIdleMs - 1_000)],
  ])('keeps showing through %s', async (_, event) => {
    const { win, ready, settled } = open();
    ready();
    event();
    await Promise.resolve();
    expect(settled()).toBe('pending');
    expect(win.destroyed).toBe(false);
  });

  it(`gives up a page that has not painted within ${selectorReadyMs / 1000} s, and keeps one painted in time`, async () => {
    const late = open();
    vi.advanceTimersByTime(selectorReadyMs);
    await expectEnded(late.win, late.promise);
    expect(late.win.calls).not.toContain('showInactive');

    const inTime = open();
    vi.advanceTimersByTime(selectorReadyMs - 100);
    inTime.ready();
    vi.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(inTime.settled()).toBe('pending');
    expect(inTime.win.calls).toContain('showInactive');
  });

  it('shows nothing for a page that says it painted after the selection ended', async () => {
    const { win, promise } = open();
    const ready = selector.current!.ready;
    selector.cancel();
    await expectEnded(win, promise);
    ready();
    expect(win.calls).not.toContain('showInactive');
  });

  it('ends the selection showing when another is asked for', async () => {
    const first = open();
    first.ready();
    const second = open();
    expect(await first.promise).toBeNull();
    expect(first.win.destroyed).toBe(true);
    expect(second.win).not.toBe(first.win);
    expect(second.win.destroyed).toBe(false);
    expect(selector.current!.contentsId).toBe(second.win.webContents.id);
  });

  it('ends with nothing when its page cannot be loaded', async () => {
    loadPage.result = Promise.reject(new Error('no page'));
    const { win, promise } = open();
    await expectEnded(win, promise);
  });

  it('ends with nothing, and leaves nothing behind, when its window cannot be made', async () => {
    electron.state.failNextWindow = true;
    expect(await selector.select(display, new FakeImage(2560, 1440))).toBeNull();
    expect(selector.current).toBeNull();
    expect(screen.count()).toBe(0);
    expect(powerMonitor.count()).toBe(0);
    // Its timers went with it.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves Esc alone when another app holds it, and still ends on a right-click or its timer', async () => {
    electron.state.escapeFree = false;
    const { win, promise, ready } = open();
    ready();
    vi.advanceTimersByTime(selectorIdleMs);
    await expectEnded(win, promise);
    expect(electron.state.unregistered).toEqual([]);
  });

  it('shows the selection even when no shortcut can be held at all', async () => {
    electron.state.escapeFree = 'throws';
    const { win, promise, ready } = open();
    ready();
    expect(win.calls).toContain('showInactive');
    selector.current!.finish({ kind: 'full' });
    await expectEnded(win, promise, { kind: 'full' });
    expect(electron.state.unregistered).toEqual([]);
  });

  it('leaves no timer running once it ends', async () => {
    const { win, promise, ready } = open();
    ready();
    selector.current!.finish({ kind: 'full' });
    await expectEnded(win, promise, { kind: 'full' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('paints the picture as a JPEG of its own size', () => {
    const frame = frameOf(new FakeImage(1366, 768));
    expect(frame).toMatchObject({ width: 1366, height: 768 });
    expect(Buffer.from(frame.image.split(',')[1]!, 'base64').length).toBe(new FakeImage(1366, 768).toJPEG(85).length);
  });
});
