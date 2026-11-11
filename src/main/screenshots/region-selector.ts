// The region selector (3.6, v1's): the display's picture, frozen, in a window laid over it that never takes focus (the
// call app keeps the keyboard) and is left out of captures like the overlay. A click takes the whole display, a drag
// an area, Esc or a right-click nothing. Many paths end it, all through one `finish`, so it can never stay on screen.
import { app, BrowserWindow, globalShortcut, powerMonitor, screen, type Display } from 'electron';
import type { Selection, SelectorFrame } from '../../shared/screenshots';
import { loadPage, preloadPath } from '../windows/load-page';
import { keepOutOfCapture, lockDown } from '../windows/stealth';
import type { ShotImage } from './shot-image';

/** An idle selector closes itself. */
export const selectorIdleMs = 20_000;

/** The page must paint the frozen picture within this, or the selection is given up. */
export const selectorReadyMs = 4_000;

/** The selection showing: the IPC handlers talk to it, and only to its page. */
export interface OpenSelector {
  /** The page's web contents: the only sender the selector's channels take. */
  contentsId: number;
  frame: SelectorFrame;
  ready(): void;
  finish(selection: Selection | null): void;
}

/** What the selector paints: the picture as a JPEG data URL (the pages' CSP takes `data:` images only). */
export function frameOf(picture: ShotImage): SelectorFrame {
  const { width, height } = picture.getSize();
  return { image: `data:image/jpeg;base64,${Buffer.from(picture.toJPEG(85)).toString('base64')}`, width, height };
}

export class RegionSelector {
  private open: OpenSelector | null = null;

  get current(): OpenSelector | null {
    return this.open;
  }

  /** Ends the selection showing, if one is (the hide hotkey, the session's end, quitting): nothing is taken. */
  cancel(): void {
    this.open?.finish(null);
  }

  /** Lays the frozen picture over `display`; what the user chose, or null. */
  select(display: Display, picture: ShotImage): Promise<Selection | null> {
    this.cancel();
    return new Promise((resolve) => {
      let win: BrowserWindow | null = null;
      let done = false;
      let shown = false;
      let escapeHeld = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const offs: (() => void)[] = [];

      const finish = (selection: Selection | null) => {
        if (done) return;
        done = true;
        for (const timer of timers) clearTimeout(timer);
        for (const off of offs) {
          try {
            off();
          } catch {
            // Best effort: the window goes regardless.
          }
        }
        if (escapeHeld) globalShortcut.unregister('Escape');
        if (this.open?.finish === finish) this.open = null;
        // Destroyed, not closed: nothing can veto it.
        if (win && !win.isDestroyed()) win.destroy();
        resolve(selection && selection.kind !== 'cancel' ? selection : null);
      };
      const cancel = () => finish(null);

      // Armed before the window exists, so nothing below can leave a selector up.
      timers.push(setTimeout(cancel, selectorIdleMs));
      timers.push(setTimeout(() => shown || cancel(), selectorReadyMs));

      try {
        win = new BrowserWindow({
          ...display.bounds,
          show: false,
          frame: false,
          backgroundColor: '#000000',
          // The call app keeps the keyboard; the mouse still reaches the page.
          focusable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          hasShadow: false,
          thickFrame: false,
          roundedCorners: false,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          // A tool window stays out of Alt+Tab.
          type: 'toolbar',
          title: 'Sotto',
          webPreferences: {
            preload: preloadPath('selector'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
            zoomFactor: 1,
            devTools: !app.isPackaged,
          },
        });
      } catch {
        cancel();
        return;
      }

      // Stealth rule 1, now and on its show: never in the interviewer's view. One level above the overlay.
      keepOutOfCapture(win);
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      lockDown(win.webContents);

      const selectorWindow = win;
      this.open = {
        contentsId: win.webContents.id,
        frame: frameOf(picture),
        finish,
        ready: () => {
          if (done || shown) return;
          shown = true;
          // Again: Windows can size a window wrongly across displays of different scaling.
          selectorWindow.setBounds(display.bounds);
          selectorWindow.showInactive();
          selectorWindow.moveTop();
          // The selector can't take the keyboard, so Esc is global while it shows. Another app may hold it: then a
          // right-click, the hotkey again or the idle timer ends it.
          try {
            escapeHeld = globalShortcut.register('Escape', cancel);
          } catch {
            escapeHeld = false;
          }
        },
      };

      // A crash, a failed load, a display change, a locked screen or sleep ends the selection.
      win.webContents.once('render-process-gone', cancel);
      win.webContents.once('unresponsive', cancel);
      win.webContents.once('did-fail-load', cancel);
      win.webContents.once('preload-error', cancel);
      win.once('closed', cancel);
      const onMetrics = (_event: unknown, changed: Display, metrics: string[]) => {
        if (
          changed.id === display.id &&
          metrics.some((m) => m === 'bounds' || m === 'scaleFactor' || m === 'rotation')
        ) {
          cancel();
        }
      };
      screen.on('display-added', cancel);
      screen.on('display-removed', cancel);
      screen.on('display-metrics-changed', onMetrics);
      powerMonitor.on('lock-screen', cancel);
      powerMonitor.on('suspend', cancel);
      offs.push(() => {
        screen.removeListener('display-added', cancel);
        screen.removeListener('display-removed', cancel);
        screen.removeListener('display-metrics-changed', onMetrics);
        powerMonitor.removeListener('lock-screen', cancel);
        powerMonitor.removeListener('suspend', cancel);
      });

      void loadPage(win, 'selector').catch(cancel);
    });
  }
}
