// The app's core process. It owns the windows, the session and, from 1.10 and 1.12, sign-in and the connection.
// Renderers only draw: they reach main through the checked channels in src/shared/ipc.ts.
import { app, Menu, session as electronSession, type BrowserWindow } from 'electron';
import { ErrorCodes } from '../shared/contracts/sotto-contracts';
import type { AppWindowAction, CommandResult, OverlayWindowAction } from '../shared/ipc';
import { IpcChannels } from '../shared/ipc-channels';
import { visibleAnswerIndex } from '../shared/live/view-state';
import type { Settings } from '../shared/settings';
import { registerIpc } from './ipc/register';
import { previewAccount } from './preview/account';
import { registerSessionHotkeys } from './session/hotkeys';
import { PreviewDriver } from './session/preview-driver';
import { SessionController } from './session/session-controller';
import { SettingsStore } from './settings-store';
import { createAppWindow } from './windows/app-window';
import { createOverlayWindow, overlaySize } from './windows/overlay-window';
import { denyPermissions } from './windows/stealth';

// Until the connection exists (1.12), development plays a scripted interview instead of the hub. Never when packaged.
const preview = !app.isPackaged;

let appWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let unregisterHotkeys: (() => void) | null = null;

const alive = (win: BrowserWindow | null): win is BrowserWindow => win !== null && !win.isDestroyed();

const settings = new SettingsStore((changed) => applySettings(changed));

const session = new SessionController((state) => {
  if (alive(overlayWindow)) overlayWindow.webContents.send(IpcChannels.overlayState, state);
  if (state.phase === 'ended') stopHotkeys();
});

function applySettings(changed: Settings): void {
  for (const win of [appWindow, overlayWindow]) {
    if (alive(win)) win.webContents.send(IpcChannels.settingsChanged, changed);
  }
  if (alive(overlayWindow)) {
    overlayWindow.setOpacity(changed.opacity / 100);
    overlayWindow.setSkipTaskbar(changed.trayOnly);
  }
}

async function startSession(): Promise<CommandResult> {
  if (!preview) {
    return { ok: false, code: ErrorCodes.Request.Unavailable, message: 'Sessions need the live connection (1.12).' };
  }
  if (session.running) {
    return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'A session is already running.' };
  }
  const current = settings.get();
  if (!alive(overlayWindow)) {
    const win = createOverlayWindow({ compact: current.startCompact, trayOnly: current.trayOnly });
    win.setOpacity(current.opacity / 100);
    // Shown without taking focus: the call app keeps the keyboard (stealth rule 6).
    win.once('ready-to-show', () => win.showInactive());
    win.on('closed', () => {
      overlayWindow = null;
    });
    overlayWindow = win;
  } else {
    overlayWindow.showInactive();
  }
  // During a session Sotto steps out of the way; the window comes back when the session is closed.
  appWindow?.hide();
  session.dispatch({ type: 'account', minutesLeft: previewAccount.minutes?.usable ?? null, tier: 'smart' });
  const result = await session.start(new PreviewDriver());
  if (result.ok) startHotkeys();
  return result;
}

/** After an ended session's overlay is closed: back to the window. */
function closeSession(): void {
  stopHotkeys();
  session.reset();
  if (alive(overlayWindow)) overlayWindow.destroy();
  overlayWindow = null;
  appWindow?.show();
}

function onOverlayWindow(action: OverlayWindowAction): void {
  if (!alive(overlayWindow)) return;
  const win = overlayWindow;
  switch (action.type) {
    case 'compact': {
      // The overlay lays itself out by its height, so resizing is all compact takes.
      const size = action.on ? overlaySize.compact : overlaySize.full;
      win.setSize(size.width, size.height);
      return;
    }
    case 'resize':
      win.setSize(Math.max(action.width, overlaySize.min.width), Math.max(action.height, overlaySize.min.height));
      return;
    case 'hide':
      if (session.current.phase === 'ended') closeSession();
      else win.hide();
      return;
    case 'releaseKeyboard':
      win.blur();
      return;
  }
}

function onAppWindow(action: AppWindowAction): void {
  if (!alive(appWindow)) return;
  if (action === 'minimize') appWindow.minimize();
  else if (action === 'maximize') {
    if (appWindow.isMaximized()) appWindow.unmaximize();
    else appWindow.maximize();
  } else app.quit();
}

function stepAnswer(delta: number): void {
  const index = visibleAnswerIndex(session.current);
  if (index !== null) session.dispatch({ type: 'view', index: index + delta });
}

function startHotkeys(): void {
  stopHotkeys();
  const { unregister } = registerSessionHotkeys({
    trigger: () => void session.command({ type: 'trigger', text: null }),
    focus: () => overlayWindow?.focus(),
    toggleAuto: () => void session.command({ type: 'setMode', auto: !session.current.auto, paused: null }),
    togglePause: () => void session.command({ type: 'setMode', auto: null, paused: !session.current.paused }),
    previous: () => stepAnswer(-1),
    next: () => stepAnswer(1),
    compact: () => {
      if (!alive(overlayWindow)) return;
      const isCompact = overlayWindow.getSize()[1]! <= overlaySize.compact.height;
      onOverlayWindow({ type: 'compact', on: !isCompact });
    },
    hide: () => {
      if (!alive(overlayWindow)) return;
      if (overlayWindow.isVisible()) overlayWindow.hide();
      else overlayWindow.showInactive();
    },
  });
  unregisterHotkeys = unregister;
}

function stopHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
}

// Every renderer runs sandboxed, whatever a window's options say.
app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!alive(appWindow) || session.running) return;
    if (appWindow.isMinimized()) appWindow.restore();
    appWindow.show();
    appWindow.focus();
  });

  void app.whenReady().then(() => {
    // No native menus: a menu is a separate window a share could see, and the app draws its own.
    Menu.setApplicationMenu(null);
    denyPermissions(electronSession.defaultSession);

    registerIpc({
      overlayWindow: () => overlayWindow,
      appWindow: () => appWindow,
      session,
      settings,
      account: () => (preview ? previewAccount : null),
      startSession,
      onOverlayWindow,
      onAppWindow,
    });

    const win = createAppWindow();
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      appWindow = null;
    });
    appWindow = win;
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => stopHotkeys());
}
