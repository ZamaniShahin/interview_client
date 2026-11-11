// The app window's only bridge to main. Sandboxed, like the overlay's: channel names and types, never a package.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AppState } from '../shared/app-state';
import type { SoundCheckView } from '../shared/first-run';
import { IpcChannels } from '../shared/ipc-channels';
import type { Settings } from '../shared/settings';
import type { AppApi } from './api';

const api: AppApi = {
  getState: () => ipcRenderer.invoke(IpcChannels.appGetState),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on(IpcChannels.appState, handler);
    return () => ipcRenderer.removeListener(IpcChannels.appState, handler);
  },
  signIn: () => ipcRenderer.invoke(IpcChannels.appSignIn),
  cancelSignIn: () => ipcRenderer.send(IpcChannels.appCancelSignIn),
  signOut: () => ipcRenderer.invoke(IpcChannels.appSignOut),
  refresh: () => ipcRenderer.invoke(IpcChannels.appRefresh),
  startSession: (request) => ipcRenderer.invoke(IpcChannels.appStartSession, request),
  setDocument: (change) => ipcRenderer.invoke(IpcChannels.appSetDocument, change),
  setPrepDoc: (change) => ipcRenderer.invoke(IpcChannels.appSetPrepDoc, change),
  readDocument: (target) => ipcRenderer.invoke(IpcChannels.appReadDocument, target),
  setInstructions: (text) => ipcRenderer.invoke(IpcChannels.appSetInstructions, text),
  saveBankEntry: (input) => ipcRenderer.invoke(IpcChannels.appSaveBankEntry, input),
  removeBankEntry: (id) => ipcRenderer.invoke(IpcChannels.appRemoveBankEntry, id),
  openInterview: (id) => ipcRenderer.invoke(IpcChannels.appOpenInterview, id),
  deleteInterview: (id) => ipcRenderer.invoke(IpcChannels.appDeleteInterview, id),
  clearHistory: () => ipcRenderer.invoke(IpcChannels.appClearHistory),
  debrief: (id) => ipcRenderer.invoke(IpcChannels.appDebrief, id),
  copy: (text) => ipcRenderer.send(IpcChannels.appCopy, text),
  writeDrafts: () => ipcRenderer.invoke(IpcChannels.appWriteDrafts),
  keepDraft: (id) => ipcRenderer.invoke(IpcChannels.appKeepDraft, id),
  skipDraft: (id) => ipcRenderer.invoke(IpcChannels.appSkipDraft, id),
  acknowledgeNotice: (version) => ipcRenderer.invoke(IpcChannels.appAcknowledgeNotice, { version }),
  finishSetup: () => ipcRenderer.invoke(IpcChannels.appFinishSetup),
  soundCheck: (action) => ipcRenderer.invoke(IpcChannels.appSoundCheck, action),
  onSoundCheck: (listener) => {
    const handler = (_event: IpcRendererEvent, view: SoundCheckView) => listener(view);
    ipcRenderer.on(IpcChannels.appSoundCheckState, handler);
    return () => ipcRenderer.removeListener(IpcChannels.appSoundCheckState, handler);
  },
  hidingTest: (action) => ipcRenderer.invoke(IpcChannels.appHidingTest, action),
  signInPage: (action) => ipcRenderer.send(IpcChannels.appSignInPage, action),
  startTrial: () => ipcRenderer.invoke(IpcChannels.appStartTrial),
  buy: (purchase) => ipcRenderer.invoke(IpcChannels.appBuy, purchase),
  billingPortal: () => ipcRenderer.invoke(IpcChannels.appBillingPortal),
  payment: (action) => ipcRenderer.invoke(IpcChannels.appPayment, action),
  removeDevice: (deviceId) => ipcRenderer.invoke(IpcChannels.appRemoveDevice, deviceId),
  replaceDevice: (deviceId) => ipcRenderer.invoke(IpcChannels.appReplaceDevice, deviceId),
  ledgerMore: () => ipcRenderer.invoke(IpcChannels.appLedgerMore),
  exportData: () => ipcRenderer.invoke(IpcChannels.appExportData),
  deleteAccount: (confirm) => ipcRenderer.invoke(IpcChannels.appDeleteAccount, confirm),
  dismiss: (target) => ipcRenderer.send(IpcChannels.appDismiss, target),
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
