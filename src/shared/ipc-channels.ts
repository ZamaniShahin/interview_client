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
  /** app window → main (invoke): the account, or null when not signed in. */
  appGetAccount: 'app:get-account',
  /** app window → main (invoke): start a session; the consent box must be ticked, every time. */
  appStartSession: 'app:start-session',
  /** any window → main (invoke): the settings. */
  settingsGet: 'settings:get',
  /** any window → main (invoke): change some settings. */
  settingsSet: 'settings:set',
  /** main → every window: the settings changed. */
  settingsChanged: 'settings:changed',
} as const;
