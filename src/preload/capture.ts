// The capture window's only bridge to main (1.11): it hands the page the port main sent, and nothing else. Sandboxed,
// like every preload: it imports Electron and the channel names, never a package. The page never reaches main
// otherwise: no IPC calls, no settings, no state.
import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

// The preload runs in the page's renderer, which has a window, but is type-checked with main's Node settings.
const page = globalThis as unknown as {
  postMessage(message: unknown, targetOrigin: string, transfer: IpcRendererEvent['ports']): void;
  location: { origin: string };
};

// Electron's pattern for a context-isolated page: a port can't cross the context bridge, so it goes to the page's own
// world as a window message, which the page accepts only from its own window. A file:// page's origin is "null".
ipcRenderer.on(IpcChannels.capturePort, (event) => {
  page.postMessage(IpcChannels.capturePort, page.location.origin === 'null' ? '*' : page.location.origin, event.ports);
});
