// What each window may ask of main: the whole surface, typed. Types only, so renderers can import it freely.
import type { AppState } from '../shared/app-state';
import type { SetDocumentRequest } from '../shared/documents';
import type { SoundCheckView } from '../shared/first-run';
import type {
  AppWindowAction,
  CommandResult,
  DismissTarget,
  OverlayCommand,
  OverlayHotkey,
  OverlayWindowAction,
  HidingTestAction,
  PaymentAction,
  PurchaseRequest,
  SignInPageAction,
  SoundCheckAction,
  StartSessionRequest,
} from '../shared/ipc';
import type { LiveViewState } from '../shared/live/view-state';
import type { Selection, SelectorFrame } from '../shared/screenshots';
import type { Settings, SettingsPatch } from '../shared/settings';

export interface SettingsApi {
  getSettings(): Promise<Settings>;
  setSettings(patch: SettingsPatch): Promise<Settings>;
  /** Returns a function that stops listening. */
  onSettings(listener: (settings: Settings) => void): () => void;
}

/** `window.overlayApi`, in the overlay only. */
export interface OverlayApi extends SettingsApi {
  getState(): Promise<LiveViewState>;
  onState(listener: (state: LiveViewState) => void): () => void;
  command(command: OverlayCommand): Promise<CommandResult>;
  window(action: OverlayWindowAction): void;
  /** Puts a code block's source on the clipboard (an answer's Copy). */
  copy(text: string): void;
  /** A kept screenshot's image, as a data URL; null once it is no longer kept (3.6). */
  screenshot(id: string): Promise<string | null>;
  /** A hotkey main hands over to finish here: the capture, which takes what was typed. Returns how to stop listening. */
  onHotkey(listener: (hotkey: OverlayHotkey) => void): () => void;
}

/** `window.selectorApi`, in the screenshot region selector only (3.6). */
export interface SelectorApi {
  /** The frozen display to paint; null once the selection is over. */
  init(): Promise<SelectorFrame | null>;
  /** The picture is painted: main shows the window. */
  ready(): void;
  /** The whole display, an area, or nothing. */
  done(selection: Selection): void;
}

/** `window.appApi`, in the app window only. */
export interface AppApi extends SettingsApi {
  /** Sign-in, the account and the last problem, as main holds them. */
  getState(): Promise<AppState>;
  /** Returns a function that stops listening. */
  onState(listener: (state: AppState) => void): () => void;
  /** Opens the sign-in page in the browser; answers once it is done, cancelled or failed. */
  signIn(): Promise<CommandResult>;
  /** Stops waiting for the browser; the pending `signIn` answers "cancelled". */
  cancelSignIn(): void;
  signOut(): Promise<void>;
  /** Reads the account again. */
  refresh(): Promise<void>;
  startSession(request: StartSessionRequest): Promise<CommandResult>;
  /** Keeps one document on this computer; the state that follows carries it. */
  setDocument(change: SetDocumentRequest): Promise<CommandResult>;
  /** The first-run notice was read, in this version. */
  acknowledgeNotice(version: number): Promise<CommandResult>;
  /** The setup wizard was finished: it no longer opens by itself. */
  finishSetup(): Promise<CommandResult>;
  soundCheck(action: SoundCheckAction): Promise<CommandResult>;
  /** Returns a function that stops listening. */
  onSoundCheck(listener: (view: SoundCheckView) => void): () => void;
  hidingTest(action: HidingTestAction): Promise<CommandResult>;
  signInPage(action: SignInPageAction): void;
  /** Starts the free trial from this computer (F9 · a). */
  startTrial(): Promise<CommandResult>;
  /** Buys a plan or a top-up: the provider's page opens in the browser, and the window waits for it (F8 · b). */
  buy(purchase: PurchaseRequest): Promise<CommandResult>;
  /** The provider's billing portal, in the browser (Manage billing). */
  billingPortal(): Promise<CommandResult>;
  /** The purchase being waited for: open its page again, or stop waiting. */
  payment(action: PaymentAction): Promise<CommandResult>;
  /** Removes one of the account's other computers (F10 · c). */
  removeDevice(deviceId: string): Promise<CommandResult>;
  /** Adds this computer in place of one of the account's, at the device limit (F3 · b). */
  replaceDevice(deviceId: string): Promise<CommandResult>;
  /** The ledger's earlier page ("Show earlier"). */
  ledgerMore(): Promise<CommandResult>;
  /** Saves a copy of everything the server keeps about the user, where the user chooses (Q19). */
  exportData(): Promise<CommandResult>;
  /** Deletes the account, `confirm` being its email typed again (Q19); then signs out. */
  deleteAccount(confirm: string): Promise<CommandResult>;
  /** Puts away what the window has said: the after-call offer, or the quiet line. */
  dismiss(target: DismissTarget): void;
  window(action: AppWindowAction): void;
}
