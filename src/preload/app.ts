// The app window's only bridge to main. Sandboxed, like the overlay's: channel names and types, never a package.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type { Settings } from '../shared/settings';
import type { AppApi } from './api';

const api: AppApi = {
  getAccount: () => ipcRenderer.invoke(IpcChannels.appGetAccount),
  startSession: (request) => ipcRenderer.invoke(IpcChannels.appStartSession, request),
  window: (action) => ipcRenderer.send(IpcChannels.appWindow, action),
  getSettings: () => ipcRenderer.invoke(IpcChannels.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(IpcChannels.settingsSet, patch),
  onSettings: (listener) => {
    const handler = (_event: IpcRendererEvent, settings: Settings) => listener(settings);
    ipcRenderer.on(IpcChannels.settingsChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannels.settingsChanged, handler);
  },
};

contextBridge.exposeInMainWorld('appApi', api);
