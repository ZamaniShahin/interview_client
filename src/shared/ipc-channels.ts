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
  /** overlay → main (send): a code block's text for the clipboard (an answer's Copy, 1.13). */
  overlayCopy: 'overlay:copy',
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
  /** app window → main (invoke): one document's whole text, kept on this computer (Prepare, the first run). */
  appSetDocument: 'app:set-document',
  /** app window → main (invoke): the first-run notice was read, in this version (F1 · 1). */
  appAcknowledgeNotice: 'app:acknowledge-notice',
  /** app window → main (invoke): the setup wizard was finished; it no longer opens by itself. */
  appFinishSetup: 'app:finish-setup',
  /** app window → main (invoke): start or stop the sound check (F1 · 4). */
  appSoundCheck: 'app:sound-check',
  /** main → app window: the sound check as it goes, heard here instead of in the overlay. */
  appSoundCheckState: 'app:sound-check-state',
  /** app window → main (invoke): Test hiding, show or hide the overlay with its test card, or say it was hidden. */
  appHidingTest: 'app:hiding-test',
  /** app window → main (send): open the sign-in page again, or copy its link (F1 · 2). */
  appSignInPage: 'app:sign-in-page',
  /** app window → main (invoke): start the free trial from this computer (F9 · a). */
  appStartTrial: 'app:start-trial',
  /** app window → main (invoke): buy a plan or a top-up; the provider's page opens in the browser (F8). */
  appBuy: 'app:buy',
  /** app window → main (invoke): the provider's billing portal, in the browser (Manage billing, F10). */
  appBillingPortal: 'app:billing-portal',
  /** app window → main (invoke): the purchase being waited for: open its page again, or stop waiting (F8 · b). */
  appPayment: 'app:payment',
  /** app window → main (invoke): remove one of the account's other computers (F10 · c). */
  appRemoveDevice: 'app:remove-device',
  /** app window → main (invoke): add this computer in place of one of the account's, at the limit (F3 · b). */
  appReplaceDevice: 'app:replace-device',
  /** app window → main (invoke): the ledger's earlier page ("Show earlier", F10 · b). */
  appLedgerMore: 'app:ledger-more',
  /** app window → main (send): the window said it: the after-call offer (F8 · a) or the quiet line (F8 · c). */
  appDismiss: 'app:dismiss',
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
