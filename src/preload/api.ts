// What each window may ask of main: the whole surface, typed. Types only, so renderers can import it freely.
import type { BankEntryInput } from '../shared/answer-bank';
import type { AppState } from '../shared/app-state';
import type { ReadDocumentResult, ReadTarget, SetDocumentRequest, SetPrepDocRequest } from '../shared/documents';
import type { SoundCheckView } from '../shared/first-run';
import type { InterviewView } from '../shared/history';
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
import type { PracticeAction, PracticeView } from '../shared/practice';
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
  /** Keeps the prep doc on this computer, whole, with its file's name (3.10). */
  setPrepDoc(change: SetPrepDocRequest): Promise<CommandResult>;
  /** Reads a document from a file the user picks: its text, for the window to show before it is kept (3.10). */
  readDocument(target: ReadTarget): Promise<ReadDocumentResult>;
  /** Keeps the custom instructions on this computer (3.8); empty removes them. */
  setInstructions(text: string): Promise<CommandResult>;
  /** Keeps an answer-bank entry, new (no id) or changed (3.8); refused in words when it isn't one. */
  saveBankEntry(input: BankEntryInput): Promise<CommandResult>;
  /** Deletes an answer-bank entry (3.8). */
  removeBankEntry(id: string): Promise<CommandResult>;
  /** One interview kept in history, whole, or null once it is gone (3.9). */
  openInterview(id: number): Promise<InterviewView | null>;
  /** Deletes one interview, and all it holds (3.9). */
  deleteInterview(id: number): Promise<CommandResult>;
  /** Deletes every interview in history (3.9). */
  clearHistory(): Promise<CommandResult>;
  /** Asks the server for an interview's debrief, and keeps it; answers once it is kept, or why not (3.9). */
  debrief(id: number): Promise<CommandResult>;
  /** Puts text on the clipboard, through main (a debrief's thank-you email, 3.9). */
  copy(text: string): void;
  /** Asks the server for prep drafts from the documents; answers once they are here, or why not (3.9). */
  writeDrafts(): Promise<CommandResult>;
  /** Keeps a draft in the answer bank (3.9). */
  keepDraft(id: number): Promise<CommandResult>;
  /** Skips a draft (3.9). */
  skipDraft(id: number): Promise<CommandResult>;
  /** Installs the downloaded update now: the app quits and comes back updated; refused during a session (4.2). */
  installUpdate(): Promise<CommandResult>;
  /** The first-run notice was read, in this version. */
  acknowledgeNotice(version: number): Promise<CommandResult>;
  /** The setup wizard was finished: it no longer opens by itself. */
  finishSetup(): Promise<CommandResult>;
  soundCheck(action: SoundCheckAction): Promise<CommandResult>;
  /** Returns a function that stops listening. */
  onSoundCheck(listener: (view: SoundCheckView) => void): () => void;
  /** Practice: start one, answer the question, go on, stop, or put the summary away. */
  practice(action: PracticeAction): Promise<CommandResult>;
  /** The practice as it goes. Returns a function that stops listening. */
  onPractice(listener: (view: PracticeView) => void): () => void;
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
