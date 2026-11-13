// Every IPC handler, in one place. Each checks who sent the message (only our own windows) and what it carries
// (the zod schemas in src/shared/ipc.ts) before anything happens: a renderer is untrusted input.
import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { AppState } from '../../shared/app-state';
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import {
  readTargetSchema,
  setDocumentSchema,
  setPrepDocSchema,
  type ReadDocumentResult,
  type ReadTarget,
  type SetDocumentRequest,
  type SetPrepDocRequest,
} from '../../shared/documents';
import {
  acknowledgeNoticeSchema,
  appWindowActionSchema,
  copyTextSchema,
  deleteConfirmSchema,
  deviceIdSchema,
  dismissSchema,
  hidingTestActionSchema,
  IpcChannels,
  overlayCommandSchema,
  overlayWindowActionSchema,
  paymentActionSchema,
  purchaseSchema,
  screenshotRequestSchema,
  signInPageActionSchema,
  soundCheckActionSchema,
  startSessionSchema,
  type AppWindowAction,
  type CommandResult,
  type DismissTarget,
  type HidingTestAction,
  type OverlayWindowAction,
  type PaymentAction,
  type PurchaseRequest,
  type SignInPageAction,
  type SoundCheckAction,
  type StartSessionRequest,
} from '../../shared/ipc';
import { bankEntryInputSchema, bankIdSchema, instructionsSchema, type BankEntryInput } from '../../shared/answer-bank';
import { draftIdSchema } from '../../shared/drafts';
import { interviewIdSchema, type InterviewView } from '../../shared/history';
import { practiceActionSchema, type PracticeAction } from '../../shared/practice';
import { selectionSchema } from '../../shared/screenshots';
import { settingsPatchSchema } from '../../shared/settings';
import type { OpenSelector } from '../screenshots/region-selector';
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
  /** Practice, from the Practice page: start one, answer, go on, stop, or put its summary away. */
  practice: (action: PracticeAction) => Promise<CommandResult>;
  hidingTest: (action: HidingTestAction) => CommandResult;
  signInPage: (action: SignInPageAction) => void;
  startTrial: () => Promise<CommandResult>;
  buy: (purchase: PurchaseRequest) => Promise<CommandResult>;
  billingPortal: () => Promise<CommandResult>;
  payment: (action: PaymentAction) => Promise<CommandResult>;
  removeDevice: (deviceId: string) => Promise<CommandResult>;
  replaceDevice: (deviceId: string) => Promise<CommandResult>;
  ledgerMore: () => Promise<CommandResult>;
  exportData: () => Promise<CommandResult>;
  deleteAccount: (confirm: string) => Promise<CommandResult>;
  dismiss: (target: DismissTarget) => void;
  /** A kept screenshot's image as a data URL, for the overlay to draw (3.6); null once it is gone. */
  screenshotImage: (id: string) => string | null;
  /** The region selector showing, if one is: its page alone may talk on the selector's channels (3.6). */
  selector: () => OpenSelector | null;
  /** Keeps the prep doc, whole (3.10). */
  setPrepDoc: (change: SetPrepDocRequest) => CommandResult;
  /** Reads a document from a file the user picks, for the window to show before it is kept (3.10). */
  readDocument: (target: ReadTarget) => Promise<ReadDocumentResult>;
  /** Keeps the custom instructions (3.8). */
  setInstructions: (text: string) => CommandResult;
  /** Keeps an answer-bank entry, new or changed (3.8). */
  saveBankEntry: (input: BankEntryInput) => CommandResult;
  /** Deletes an answer-bank entry (3.8). */
  removeBankEntry: (id: string) => CommandResult;
  /** One interview kept in history, whole, or null (3.9). */
  openInterview: (id: number) => InterviewView | null;
  /** Deletes one interview (3.9). */
  deleteInterview: (id: number) => CommandResult;
  /** Deletes every interview (3.9). */
  clearHistory: () => CommandResult;
  /** Asks the server for an interview's debrief, and keeps it (3.9). */
  debrief: (id: number) => Promise<CommandResult>;
  /** Saves an interview's recording as a WAV, where the user chooses (3.12). */
  saveRecording: (id: number) => Promise<CommandResult>;
  /** Asks the server for prep drafts (3.9). */
  writeDrafts: () => Promise<CommandResult>;
  /** Keeps a draft in the answer bank (3.9). */
  keepDraft: (id: number) => CommandResult;
  /** Skips a draft (3.9). */
  skipDraft: (id: number) => CommandResult;
  /** Installs the downloaded update now (4.2). */
  installUpdate: () => CommandResult;
}

const invalid: CommandResult = {
  ok: false,
  code: ErrorCodes.Request.InvalidInput,
  message: 'That request was not valid.',
};

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

  ipcMain.handle(IpcChannels.overlayGetState, (event) =>
    fromOverlay(event) ? deps.session.current : refuse('the overlay'),
  );

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

  ipcMain.handle(IpcChannels.overlayScreenshot, (event, payload: unknown): string | null => {
    if (!fromOverlay(event)) return null;
    const parsed = screenshotRequestSchema.safeParse(payload);
    return parsed.success ? deps.screenshotImage(parsed.data) : null;
  });

  // The region selector's page: only the one showing, each message checked (3.6).
  const selectorOf = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const open = deps.selector();
    return open !== null && event.sender.id === open.contentsId ? open : null;
  };

  ipcMain.handle(IpcChannels.selectorInit, (event) => selectorOf(event)?.frame ?? null);

  ipcMain.on(IpcChannels.selectorReady, (event) => selectorOf(event)?.ready());

  ipcMain.on(IpcChannels.selectorDone, (event, payload: unknown) => {
    const open = selectorOf(event);
    if (!open) return;
    const parsed = selectionSchema.safeParse(payload);
    // Anything but a valid answer cancels: nothing is taken that the user didn't choose.
    open.finish(parsed.success ? parsed.data : null);
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

  // Practice runs for the Practice page only: the overlay never starts or answers one.
  ipcMain.handle(IpcChannels.appPractice, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = practiceActionSchema.safeParse(payload);
    return parsed.success ? deps.practice(parsed.data) : invalid;
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

  ipcMain.handle(IpcChannels.appStartTrial, (event) => (fromApp(event) ? deps.startTrial() : invalid));

  ipcMain.handle(IpcChannels.appBuy, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = purchaseSchema.safeParse(payload);
    return parsed.success ? deps.buy(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appBillingPortal, (event) => (fromApp(event) ? deps.billingPortal() : invalid));

  ipcMain.handle(IpcChannels.appPayment, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = paymentActionSchema.safeParse(payload);
    return parsed.success ? deps.payment(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appRemoveDevice, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = deviceIdSchema.safeParse(payload);
    return parsed.success ? deps.removeDevice(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appExportData, (event) => (fromApp(event) ? deps.exportData() : invalid));

  ipcMain.handle(IpcChannels.appDeleteAccount, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = deleteConfirmSchema.safeParse(payload);
    return parsed.success ? deps.deleteAccount(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appReplaceDevice, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = deviceIdSchema.safeParse(payload);
    return parsed.success ? deps.replaceDevice(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appLedgerMore, (event) => (fromApp(event) ? deps.ledgerMore() : invalid));

  ipcMain.on(IpcChannels.appDismiss, (event, payload: unknown) => {
    if (!fromApp(event)) return;
    const parsed = dismissSchema.safeParse(payload);
    if (parsed.success) deps.dismiss(parsed.data);
  });

  ipcMain.handle(IpcChannels.appSetDocument, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = setDocumentSchema.safeParse(payload);
    if (parsed.success) return deps.setDocument(parsed.data);
    return parsed.error.issues.some((issue) => issue.message === 'too_long')
      ? { ok: false, code: ErrorCodes.Field.TooLong, message: 'That is longer than Sotto can take.' }
      : invalid;
  });

  ipcMain.handle(IpcChannels.appSetPrepDoc, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = setPrepDocSchema.safeParse(payload);
    if (parsed.success) return deps.setPrepDoc(parsed.data);
    return parsed.error.issues.some((issue) => issue.code === 'too_big' && issue.path[0] === 'text')
      ? { ok: false, code: ErrorCodes.Field.TooLong, message: 'That is longer than Sotto can take.' }
      : invalid;
  });

  ipcMain.handle(IpcChannels.appReadDocument, async (event, payload: unknown): Promise<ReadDocumentResult> => {
    const refusal: ReadDocumentResult = {
      ok: false,
      code: ErrorCodes.Request.InvalidInput,
      message: 'That request was not valid.',
    };
    if (!fromApp(event)) return refusal;
    const parsed = readTargetSchema.safeParse(payload);
    return parsed.success ? deps.readDocument(parsed.data) : refusal;
  });

  ipcMain.handle(IpcChannels.appSetInstructions, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = instructionsSchema.safeParse(payload);
    if (parsed.success) return deps.setInstructions(parsed.data);
    return typeof payload === 'string'
      ? { ok: false, code: ErrorCodes.Field.TooLong, message: 'That is longer than Sotto can take.' }
      : invalid;
  });

  ipcMain.handle(IpcChannels.appSaveBankEntry, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = bankEntryInputSchema.safeParse(payload);
    return parsed.success ? deps.saveBankEntry(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appRemoveBankEntry, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = bankIdSchema.safeParse(payload);
    return parsed.success ? deps.removeBankEntry(parsed.data) : invalid;
  });

  // History (3.9): the app window only, an interview named by its id.
  ipcMain.handle(IpcChannels.appOpenInterview, (event, payload: unknown): InterviewView | null => {
    if (!fromApp(event)) return null;
    const parsed = interviewIdSchema.safeParse(payload);
    return parsed.success ? deps.openInterview(parsed.data) : null;
  });

  ipcMain.handle(IpcChannels.appDeleteInterview, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = interviewIdSchema.safeParse(payload);
    return parsed.success ? deps.deleteInterview(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appClearHistory, (event): CommandResult =>
    fromApp(event) ? deps.clearHistory() : invalid,
  );

  // Prep drafts (3.9): the app window only, a draft named by its id.
  ipcMain.handle(IpcChannels.appWriteDrafts, async (event): Promise<CommandResult> =>
    fromApp(event) ? deps.writeDrafts() : invalid,
  );

  ipcMain.handle(IpcChannels.appKeepDraft, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = draftIdSchema.safeParse(payload);
    return parsed.success ? deps.keepDraft(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appSkipDraft, (event, payload: unknown): CommandResult => {
    if (!fromApp(event)) return invalid;
    const parsed = draftIdSchema.safeParse(payload);
    return parsed.success ? deps.skipDraft(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appInstallUpdate, (event): CommandResult =>
    fromApp(event) ? deps.installUpdate() : invalid,
  );

  ipcMain.on(IpcChannels.appCopy, (event, payload: unknown) => {
    if (!fromApp(event)) return;
    const parsed = copyTextSchema.safeParse(payload);
    if (parsed.success) deps.copyText(parsed.data);
  });

  ipcMain.handle(IpcChannels.appDebrief, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = interviewIdSchema.safeParse(payload);
    return parsed.success ? deps.debrief(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.appSaveRecording, async (event, payload: unknown): Promise<CommandResult> => {
    if (!fromApp(event)) return invalid;
    const parsed = interviewIdSchema.safeParse(payload);
    return parsed.success ? deps.saveRecording(parsed.data) : invalid;
  });

  ipcMain.handle(IpcChannels.settingsGet, (event) =>
    fromEither(event) ? deps.settings.get() : refuse('a Sotto window'),
  );

  ipcMain.handle(IpcChannels.settingsSet, (event, payload: unknown) => {
    if (!fromEither(event)) return refuse('a Sotto window');
    const parsed = settingsPatchSchema.safeParse(payload);
    if (!parsed.success) return refuse('a valid settings change');
    return deps.settings.update(parsed.data);
  });
}
