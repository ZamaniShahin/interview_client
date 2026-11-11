// The region selector's only bridge to main (3.6): three calls, and nothing of the overlay's. Sandboxed, so it imports
// channel names and types only, never a package. Main checks that each message comes from the selector showing, and
// what the last one carries.
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type { SelectorApi } from './api';

const api: SelectorApi = {
  init: () => ipcRenderer.invoke(IpcChannels.selectorInit),
  ready: () => ipcRenderer.send(IpcChannels.selectorReady),
  done: (selection) => ipcRenderer.send(IpcChannels.selectorDone, selection),
};

contextBridge.exposeInMainWorld('selectorApi', api);
