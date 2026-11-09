// Every IPC handler, in one place. Each checks who sent the message (only our own windows) and what it carries
// (the zod schemas in src/shared/ipc.ts) before anything happens: a renderer is untrusted input.
import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { AppState } from '../../shared/app-state';
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import { setDocumentSchema, type SetDocumentRequest } from '../../shared/documents';
import {
  acknowledgeNoticeSchema,
  appWindowActionSchema,
  copyTextSchema,
  hidingTestActionSchema,
  IpcChannels,
  overlayCommandSchema,
  overlayWindowActionSchema,
  signInPageActionSchema,
  soundCheckActionSchema,
  startSessionSchema,
  type AppWindowAction,
  type CommandResult,
  type HidingTestAction,
  type OverlayWindowAction,
  type SignInPageAction,
  type SoundCheckAction,
  type StartSessionRequest,
} from '../../shared/ipc';
import { settingsPatchSchema } from '../../shared/settings';
import type { SessionController } from '../session/session-controller';
import type { SettingsStore } from '../settings-store';

export interface IpcDependencies {
  overlayWindow: () => BrowserWindow | null;
  appWindow: () => BrowserWindow | null;
  session: SessionController;
  settings: SettingsStore;
  appState: () => AppState;
  signIn: () => Promise<CommandResult>;
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  startSession: (request: StartSessionRequest) => Promise<CommandResult>;
  onOverlayWindow: (action: OverlayWindowAction) => void;
  onAppWindow: (action: AppWindowAction) => void;
  /** Puts text on the clipboard: main's, since the overlay never takes focus and a renderer's clipboard wants it. */
  copyText: (text: string) => void;
  /** Keeps one document on this computer (checked against its limit). */
  setDocument: (change: SetDocumentRequest) => CommandResult;
  acknowledgeNotice: (version: number) => CommandResult;
  finishSetup: () => CommandResult;
  soundCheck: (action: SoundCheckAction) => Promise<CommandResult>;
  hidingTest: (action: HidingTestAction) => CommandResult;
  signInPage: (action: SignInPageAction) => void;
}

const invalid: CommandResult = { ok: false, code: ErrorCodes.Request.InvalidInput, message: 'That request was not valid.' };

function isFrom(event: IpcMainEvent | IpcMainInvokeEvent, win: BrowserWindow | null): boolean {
  return win !== null && !win.isDestroyed() && event.sender.id === win.webContents.id;
}

export function registerIpc(deps: IpcDependencies): void {
  const fromOverlay = (event: IpcMainEvent | IpcMainInvokeEvent) => isFrom(event, deps.overlayWindow());
  const fromApp = (event: IpcMainEvent | IpcMainInvokeEvent) => isFrom(event, deps.appWindow());
  const fromEither = (event: IpcMainEvent | IpcMainInvokeEvent) => fromOverlay(event) || fromApp(event);
  const refuse = (who: string) => {
    throw new Error(`Refused: not ${who}.`);
  };

  ipcMain.handle(IpcChannels.overlayGetState, (event) => (fromOverlay(event) ? deps.session.current : refuse('the overlay')));

  ipcMain.handle(IpcChannels.overlayCommand, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromOverlay(event)) return invalid;
    const parsed = overlayCommandSchema.safeParse(payload);
    if (!parsed.success) return invalid;
    return deps.session.command(parsed.data);
  });

  ipcMain.on(IpcChannels.overlayWindow, (event, payload: unknown) => {
    if (!fromOverlay(event)) return;
    const parsed = overlayWindowActionSchema.safeParse(payload);
    if (parsed.success) deps.onOverlayWindow(parsed.data);
  });

  ipcMain.on(IpcChannels.overlayCopy, (event, payload: unknown) => {
    if (!fromOverlay(event)) return;
    const parsed = copyTextSchema.safeParse(payload);
    if (parsed.success) deps.copyText(parsed.data);
  });

  ipcMain.on(IpcChannels.appWindow, (event, payload: unknown) => {
    if (!fromApp(event)) return;
    const parsed = appWindowActionSchema.safeParse(payload);
    if (parsed.success) deps.onAppWindow(parsed.data);
  });

  ipcMain.handle(IpcChannels.appGetState, (event) => (fromApp(event) ? deps.appState() : refuse('the app window')));

  ipcMain.handle(IpcChannels.appSignIn, (event) => (fromApp(event) ? deps.signIn() : invalid));

  ipcMain.on(IpcChannels.appCancelSignIn, (event) => {
    if (fromApp(event)) deps.cancelSignIn();
  });

  ipcMain.handle(IpcChannels.appSignOut, (event) => (fromApp(event) ? deps.signOut() : refuse('the app window')));

  ipcMain.handle(IpcChannels.appRefresh, (event) => (fromApp(event) ? deps.refresh() : refuse('the app window')));

  ipcMain.handle(IpcChannels.appStartSession, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = startSessionSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, code: ErrorCodes.Request.InvalidInput, message: 'Tick the consent box to start.' };
    }
    return deps.startSession(parsed.data);
  });

  ipcMain.handle(IpcChannels.appAcknowledgeNotice, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = acknowledgeNoticeSchema.safeParse(payload);
    return parsed.success ? deps.acknowledgeNotice(parsed.data.version) : invalid;
  });

  ipcMain.handle(IpcChannels.appFinishSetup, (event): CommandResult => (fromApp(event) ? deps.finishSetup() : invalid));

  ipcMain.handle(IpcChannels.appSoundCheck, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = soundCheckActionSchema.safeParse(payload);
    return parsed.success ? deps.soundCheck(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appHidingTest, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = hidingTestActionSchema.safeParse(payload);
    return parsed.success ? deps.hidingTest(parsed.data) : invalid;
  });

  ipcMain.on(IpcChannels.appSignInPage, (event, payload: unknown) => {
    if (!fromApp(event)) return;
    const parsed = signInPageActionSchema.safeParse(payload);
    if (parsed.success) deps.signInPage(parsed.data);
  });

  ipcMain.handle(IpcChannels.appSetDocument, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = setDocumentSchema.safeParse(payload);
    if (parsed.success) return deps.setDocument(parsed.data);
    return parsed.error.issues.some((issue) => issue.message === 'too_long')
      ? { ok: false, code: ErrorCodes.Field.TooLong, message: 'That is longer than Sotto can take.' }
      : invalid;
  });

  ipcMain.handle(IpcChannels.settingsGet, (event) => (fromEither(event) ? deps.settings.get() : refuse('a Sotto window')));

  ipcMain.handle(IpcChannels.settingsSet, (event, payload: unknown) => {
    if (!fromEither(event)) return refuse('a Sotto window');
    const parsed = settingsPatchSchema.safeParse(payload);
    if (!parsed.success) return refuse('a valid settings change');
    return deps.settings.update(parsed.data);
  });
}
