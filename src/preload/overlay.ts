// The overlay's only bridge to main. Sandboxed: it can load nothing but Electron's renderer modules, so it imports
// channel names and types, never a package. Main checks every payload; this only forwards.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type { LiveViewState } from '../shared/live/view-state';
import type { Settings } from '../shared/settings';
import type { OverlayApi } from './api';

const api: OverlayApi = {
  getState: () => ipcRenderer.invoke(IpcChannels.overlayGetState),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: LiveViewState) => listener(state);
    ipcRenderer.on(IpcChannels.overlayState, handler);
    return () => ipcRenderer.removeListener(IpcChannels.overlayState, handler);
  },
  command: (command) => ipcRenderer.invoke(IpcChannels.overlayCommand, command),
  window: (action) => ipcRenderer.send(IpcChannels.overlayWindow, action),
  copy: (text) => ipcRenderer.send(IpcChannels.overlayCopy, text),
  getSettings: () => ipcRenderer.invoke(IpcChannels.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(IpcChannels.settingsSet, patch),
  onSettings: (listener) => {
    const handler = (_event: IpcRendererEvent, settings: Settings) => listener(settings);
    ipcRenderer.on(IpcChannels.settingsChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannels.settingsChanged, handler);
  },
};

contextBridge.exposeInMainWorld('overlayApi', api);
