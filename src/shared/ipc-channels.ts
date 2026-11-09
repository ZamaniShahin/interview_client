// Channel names only, with no dependency, so the sandboxed preloads can import them (a preload can't load packages).
// What each channel carries, and its schema, is in ipc.ts.
export const IpcChannels = {
  /** main → overlay: the whole view state, at most every 33 ms while an answer streams. */
  overlayState: 'overlay:state',
  /** overlay → main (invoke): the current view state, after a load or a reload. */
  overlayGetState: 'overlay:get-state',
  /** overlay → main (invoke): a session command; answers `CommandResult`. */
  overlayCommand: 'overlay:command',
  /** overlay → main (send): sizing and hiding the overlay window. */
  overlayWindow: 'overlay:window',
  /** app window → main (send): minimize, maximize, close. */
  appWindow: 'app:window',
  /** app window → main (invoke): the app's state (sign-in, account, problem). */
  appGetState: 'app:get-state',
  /** main → app window: the app's state changed. */
  appState: 'app:state',
  /** app window → main (invoke): sign in, in the browser; answers when it's done or failed. */
  appSignIn: 'app:sign-in',
  /** app window → main (send): stop waiting for the browser; the pending sign-in answers "cancelled". */
  appCancelSignIn: 'app:cancel-sign-in',
  /** app window → main (invoke): sign out of this computer. */
  appSignOut: 'app:sign-out',
  /** app window → main (invoke): read the account again (after the browser, say). */
  appRefresh: 'app:refresh',
  /** app window → main (invoke): start a session; the consent box must be ticked, every time. */
  appStartSession: 'app:start-session',
  /** any window → main (invoke): the settings. */
  settingsGet: 'settings:get',
  /** any window → main (invoke): change some settings. */
  settingsSet: 'settings:set',
  /** main → every window: the settings changed. */
  settingsChanged: 'settings:changed',
  /**
   * main → capture window (1.11): the port its frames go back through. It carries no payload of its own, so it has no
   * schema or handler; main checks every message that comes back over the port (main/capture/audio-capture.ts).
   */
  capturePort: 'capture:port',
} as const;
