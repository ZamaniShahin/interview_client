// What each window may ask of main: the whole surface, typed. Types only, so renderers can import it freely.
import type { AppState } from '../shared/app-state';
import type { SetDocumentRequest } from '../shared/documents';
import type { SoundCheckView } from '../shared/first-run';
import type {
  AppWindowAction,
  CommandResult,
  OverlayCommand,
  OverlayWindowAction,
  HidingTestAction,
  SignInPageAction,
  SoundCheckAction,
  StartSessionRequest,
} from '../shared/ipc';
import type { LiveViewState } from '../shared/live/view-state';
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
  window(action: AppWindowAction): void;
}
