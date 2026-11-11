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
  /** overlay → main (invoke): one kept screenshot's image by its id, as a data URL; null once it is gone (3.6). */
  overlayScreenshot: 'overlay:screenshot',
  /** main → overlay: a hotkey the overlay finishes, since it holds what it needs (the capture's typed note, 3.6). */
  overlayHotkey: 'overlay:hotkey',
  /** selector → main (invoke): the frozen display to paint (3.6). */
  selectorInit: 'selector:init',
  /** selector → main (send): the frozen display is painted, so the window can show. */
  selectorReady: 'selector:ready',
  /** selector → main (send): what was chosen: the whole display, an area, or nothing. */
  selectorDone: 'selector:done',
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
  /** app window → main (invoke): the prep doc, whole, with its file's name (3.10). */
  appSetPrepDoc: 'app:set-prep-doc',
  /** app window → main (invoke): read a document from a file the user picks; answers its text (3.10). */
  appReadDocument: 'app:read-document',
  /** app window → main (invoke): the custom instructions, whole (3.8). */
  appSetInstructions: 'app:set-instructions',
  /** app window → main (invoke): keep an answer-bank entry, new or changed (3.8). */
  appSaveBankEntry: 'app:save-bank-entry',
  /** app window → main (invoke): delete an answer-bank entry, by its id (3.8). */
  appRemoveBankEntry: 'app:remove-bank-entry',
  /** app window → main (invoke): one interview kept in history, whole, or null (3.9). */
  appOpenInterview: 'app:open-interview',
  /** app window → main (invoke): delete one interview from history, by its id (3.9). */
  appDeleteInterview: 'app:delete-interview',
  /** app window → main (invoke): delete every interview in history (3.9). */
  appClearHistory: 'app:clear-history',
  /** app window → main (invoke): ask the server for an interview's debrief, kept with it; answers once kept (3.9). */
  appDebrief: 'app:debrief',
  /** app window → main (send): text for the clipboard, main's to write, as the overlay's Copy is (3.9). */
  appCopy: 'app:copy',
  /** app window → main (invoke): ask the server for prep drafts from the documents (3.9). */
  appWriteDrafts: 'app:write-drafts',
  /** app window → main (invoke): keep a draft in the answer bank, by its id (3.9). */
  appKeepDraft: 'app:keep-draft',
  /** app window → main (invoke): skip a draft, by its id (3.9). */
  appSkipDraft: 'app:skip-draft',
  /**
   * main → documents window (3.10): the port files go through to be read. Like `capturePort`, it carries no payload of
   * its own; main checks every reply that comes back over it (main/documents/document-reader.ts).
   */
  documentsPort: 'documents:port',
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
  /** app window → main (invoke): save a copy of everything the server keeps about the user (Q19). */
  appExportData: 'app:export-data',
  /** app window → main (invoke): delete the account, its email typed again (Q19); then sign out. */
  appDeleteAccount: 'app:delete-account',
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
