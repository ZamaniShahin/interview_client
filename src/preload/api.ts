// What each window may ask of main: the whole surface, typed. Types only, so renderers can import it freely.
import type { AccountView } from '../shared/account';
import type {
  AppWindowAction,
  CommandResult,
  OverlayCommand,
  OverlayWindowAction,
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
}

/** `window.appApi`, in the app window only. */
export interface AppApi extends SettingsApi {
  getAccount(): Promise<AccountView | null>;
  startSession(request: StartSessionRequest): Promise<CommandResult>;
  window(action: AppWindowAction): void;
}
