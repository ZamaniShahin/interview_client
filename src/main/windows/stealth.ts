// The stealth rules that live in main (README, "Stealth rules"). Each one keeps the app out of the interviewer's view;
// breaking one shows the overlay in a screen share.
import type { Session, WebContents } from 'electron';

/** What these rules need of a window, so tests can check them without starting Electron. */
export interface CaptureProtectable {
  setContentProtection(enable: boolean): void;
  on(event: 'show', listener: () => void): unknown;
}

export interface TopMost {
  setAlwaysOnTop(flag: boolean, level?: 'screen-saver'): void;
}

/**
 * Rule 1: left out of screen shares and recordings. Windows resets the flag each time a window is shown, so it is set
 * again on every `show` (v1 KNOWN_ISSUES #12).
 */
export function keepOutOfCapture(win: CaptureProtectable): void {
  win.setContentProtection(true);
  win.on('show', () => win.setContentProtection(true));
}

/** Rule 6: above the call app, at the level v1 proved. Show it with `showInactive()`, so the call keeps the keyboard. */
export function keepOnTop(win: TopMost): void {
  win.setAlwaysOnTop(true, 'screen-saver');
}

/**
 * Rule 7: nothing opens outside the protected windows. No new windows, no navigation away from the app's own pages,
 * no spell-check menus.
 */
export function lockDown(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
}

/** Renderers get no device or system permission; the capture window (1.11) will ask for its own, narrowly. */
export function denyPermissions(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}
