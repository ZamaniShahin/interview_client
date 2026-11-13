// The hidden capture window (1.11): never shown, no UI. It has a session of its own, so the one permission it needs,
// this computer's sound as display media, never reaches the windows people see (they keep denyPermissions).
import { app, BrowserWindow, desktopCapturer, MessageChannelMain, session, type Session } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { CaptureChannel } from '../capture/audio-capture';
import { keepOutOfCapture, lockDown } from './stealth';
import { serveApp } from './app-protocol';
import { loadPage, preloadPath, rendererRoot } from './load-page';

/** In memory: nothing of it is written to disk. */
const partition = 'sotto-capture';

let configured = false;

/**
 * Display media is the only thing this session may have, and its answer is always the screen's picture with the
 * output's loopback; the page drops the picture at once. Windows only: loopback is how Chromium captures an output.
 */
function allowLoopbackOnly(captureSession: Session): void {
  if (configured) return;
  configured = true;
  // Display media is asked for as `display-capture`; `media` covers the stream itself.
  const allowed = (permission: string) => permission === 'display-capture' || permission === 'media';
  captureSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed(permission)));
  captureSession.setPermissionCheckHandler((_contents, permission) => allowed(permission));
  captureSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then(([screen]) => callback(screen ? { video: screen, audio: 'loopback' } : {}))
      .catch(() => callback({}));
  });
}

export function openCaptureWindow(): CaptureChannel {
  const captureSession = session.fromPartition(partition);
  allowLoopbackOnly(captureSession);
  // Its own session needs the built pages too (4.1).
  serveApp(captureSession, rendererRoot);

  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    title: 'Sotto',
    webPreferences: {
      preload: preloadPath('capture'),
      session: captureSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // A hidden window is throttled by default; its frames must keep flowing to main.
      backgroundThrottling: false,
      // Its AudioContext starts after an await, when the user gesture is spent: without this, Chromium's autoplay
      // policy leaves it suspended and no frame is made. The window plays nothing; its graph outputs silence.
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  // Never shown, but kept out of captures all the same (stealth rule 1).
  keepOutOfCapture(win);
  lockDown(win.webContents);

  const { port1, port2 } = new MessageChannelMain();
  const listeners: ((message: unknown) => void)[] = [];
  port2.on('message', (event) => {
    for (const listener of listeners) listener(event.data);
  });
  port2.start();

  // The port goes over once the page has loaded, so its listener is there to take it.
  const ready = loadPage(win, 'capture').then(() => {
    if (!win.isDestroyed()) win.webContents.postMessage(IpcChannels.capturePort, null, [port1]);
  });

  // Display media asks for a user gesture; `executeJavaScript(…, true)` gives the call one.
  const call = (what: 'start' | 'stop' | 'startRecording' | 'stopRecording') =>
    void ready
      .then(() =>
        win.isDestroyed() ? undefined : win.webContents.executeJavaScript(`void window.sottoCapture?.${what}()`, true),
      )
      .catch(() => {});

  return {
    start: () => call('start'),
    stop: () => call('stop'),
    // The microphone, for a recorded session only (3.12): the window's session allows `media`, which covers it.
    startRecording: () => call('startRecording'),
    stopRecording: () => call('stopRecording'),
    onMessage: (listener) => listeners.push(listener),
    close: () => {
      port2.close();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
