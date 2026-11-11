// The hidden documents window (3.10): never shown, no UI, where files are read into text. It has a session of its own
// with no permission at all, runs sandboxed with no Node, and its page may reach nothing (connect-src 'none'), so a
// harmful file has nowhere to go; main checks every reply (main/documents/document-reader.ts).
import { app, BrowserWindow, MessageChannelMain, session } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { DocumentsChannel } from '../documents/document-reader';
import { loadPage, preloadPath } from './load-page';
import { denyPermissions, keepOutOfCapture, lockDown } from './stealth';

/** In memory: nothing of it is written to disk. */
const partition = 'sotto-documents';

let configured = false;

export function openDocumentsWindow(): DocumentsChannel {
  const documentsSession = session.fromPartition(partition);
  if (!configured) {
    configured = true;
    denyPermissions(documentsSession);
  }

  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    title: 'Sotto',
    webPreferences: {
      preload: preloadPath('documents'),
      session: documentsSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // A hidden window is throttled by default; a read must run at full speed.
      backgroundThrottling: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  // Never shown, but kept out of captures all the same (stealth rule 1).
  keepOutOfCapture(win);
  lockDown(win.webContents);

  const { port1, port2 } = new MessageChannelMain();
  const listeners: ((message: unknown) => void)[] = [];
  const goneListeners: (() => void)[] = [];
  let gone = false;
  const lost = () => {
    if (gone) return;
    gone = true;
    for (const listener of goneListeners) listener();
  };
  port2.on('message', (event) => {
    for (const listener of listeners) listener(event.data);
  });
  port2.start();
  win.webContents.once('render-process-gone', lost);
  win.webContents.once('did-fail-load', lost);
  win.webContents.once('preload-error', lost);

  // The port goes over once the page has loaded; what main posts before waits in the port until then.
  void loadPage(win, 'documents')
    .then(() => {
      if (!win.isDestroyed()) win.webContents.postMessage(IpcChannels.documentsPort, null, [port1]);
    })
    .catch(lost);

  return {
    post: (request) => port2.postMessage(request),
    onMessage: (listener) => listeners.push(listener),
    onGone: (listener) => goneListeners.push(listener),
    close: () => {
      gone = true;
      port2.close();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
