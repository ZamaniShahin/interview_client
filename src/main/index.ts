// The app's core process. It owns the windows, sign-in, the account, the session and its connection.
// Renderers only draw: they reach main through the checked channels in src/shared/ipc.ts.
import { readFile, stat, writeFile } from 'node:fs/promises';
import {
  app,
  clipboard,
  desktopCapturer,
  dialog,
  Menu,
  nativeTheme,
  screen,
  session as electronSession,
  shell,
  type BrowserWindow,
  type Display,
} from 'electron';
import { hostname, release } from 'node:os';
import { join } from 'node:path';
import type { AccountView } from '../shared/account';
import { initialAppState, type AppState, type Problem } from '../shared/app-state';
import { preferencesToSend, type BankEntryInput } from '../shared/answer-bank';
import { ErrorCodes, Protocol } from '../shared/contracts/sotto-contracts';
import {
  answersOnItsOwn,
  type DocumentField,
  type DocumentsView,
  type ReadDocumentResult,
  type ReadTarget,
  type SetDocumentRequest,
  type SetPrepDocRequest,
} from '../shared/documents';
import { notice } from '../shared/first-run';
import type {
  AppWindowAction,
  CommandResult,
  DismissTarget,
  HidingTestAction,
  OverlayWindowAction,
  PaymentAction,
  PurchaseRequest,
  SignInPageAction,
  SoundCheckAction,
  StartSessionRequest,
} from '../shared/ipc';
import { IpcChannels } from '../shared/ipc-channels';
import { visibleAnswerIndex } from '../shared/live/view-state';
import type { Settings } from '../shared/settings';
import { AccountService, type LoadedAccount } from './account/account-service';
import { PaymentWatch } from './account/payment-watch';
import { ApiError, RestClient } from './api/rest-client';
import { AuthSession, NotSignedIn, SignInCancelled } from './auth/auth-session';
import { DpopKeys } from './auth/dpop';
import { ElectronSecretStore } from './auth/electron-secret-store';
import { AudioCapture } from './capture/audio-capture';
import { runCaptureCheck } from './capture/capture-check';
import { startLoopback } from './auth/loopback';
import { OpenIdClient, SignInExpired } from './auth/oidc';
import { MemorySecretStore, type SecretStore } from './auth/secret-store';
import { loadConfig } from './config';
import { createLiveTransport } from './connection/live-connection';
import { DeviceIdentity } from './device/device-identity';
import { machineFingerprint } from './device/fingerprint';
import { DocumentReader } from './documents/document-reader';
import { readDocumentFile, refused } from './documents/read-document';
import { registerIpc } from './ipc/register';
import { RegionSelector } from './screenshots/region-selector';
import { ScreenCapture, type CaptureOutcome } from './screenshots/screen-capture';
import { ScreenshotShelf } from './screenshots/screenshot-shelf';
import type { ShotImage } from './screenshots/shot-image';
import { PreviewBilling, previewPaymentMs } from './preview/billing';
import { HubDriver, type HubDriverDependencies } from './session/hub-driver';
import { SoundCheck } from './session/sound-check';
import { PracticeRun, type PracticeDriverOutcome } from './session/practice-run';
import { registerSessionHotkeys } from './session/hotkeys';
import { effectiveHotkeys } from '../shared/hotkeys';
import { PreviewDriver } from './session/preview-driver';
import { SessionController, type SessionDriver } from './session/session-controller';
import { SettingsStore } from './settings-store';
import { databaseKey, isUnreadable, openDatabase, setAside } from './storage/local-database';
import { LocalStore, readinessFrom } from './storage/local-store';
import { migrations } from './storage/schema';
import { previewBank, previewDocuments } from './preview/documents';
import { previewDebrief, previewDebriefMs, previewDrafts } from './preview/history';
import { DraftsService } from './jobs/drafts-service';
import { autoUpdater } from 'electron-updater';
import { Updates } from './updates/updates';
import { HistoryRecorder } from './history/history-recorder';
import { HistoryService } from './history/history-service';
import { runJob } from './jobs/run-job';
import { roleOf } from '../shared/history';
import type { PracticeAction } from '../shared/practice';
import { createAppWindow } from './windows/app-window';
import { openCaptureWindow } from './windows/capture-window';
import { openDocumentsWindow } from './windows/documents-window';
import { createOverlayWindow, overlaySize } from './windows/overlay-window';
import { denyPermissions } from './windows/stealth';
import { registerAppScheme, serveApp } from './windows/app-protocol';
import { rendererRoot } from './windows/load-page';

const config = loadConfig();

// `npm run dev:preview` plays a scripted interview and a sample account instead of the server, for UI work.
// Never in a packaged build.
const preview = !app.isPackaged && import.meta.env.MODE === 'preview';

let appWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let unregisterHotkeys: (() => void) | null = null;

let auth: AuthSession | null = null;
let accounts: AccountService | null = null;
let rest: RestClient | null = null;
let loaded: LoadedAccount | null = null;
/** This computer's documents and settings (1.14), once the database is open. */
let store: LocalStore | null = null;
let appState: AppState = { ...initialAppState, preview };
/** The preview's account and its changes (`npm run dev:preview`); unused against a server. */
const previewBilling = new PreviewBilling();
/** The checkout page of the purchase being waited for, for "Open the page again" (F8 · b). */
let paymentUrl: string | null = null;
/** When the account was last read: coming back to the window reads it again only after a while. */
let accountReadAt = 0;
/** How long the window may be away before coming back to it reads the account again (the browser, a purchase). */
const rereadAfterMs = 30_000;

const alive = (win: BrowserWindow | null): win is BrowserWindow => win !== null && !win.isDestroyed();

const settings = new SettingsStore((changed) => applySettings(changed));

// Files read into documents (3.10), in a hidden window of their own: main never parses a file.
const documentReader = new DocumentReader(openDocumentsWindow);

// Screenshots (3.6): the region selector, taking the picture, and the session's copies, kept in memory only.
const selector = new RegionSelector();
const shelf = new ScreenshotShelf();
const screenCapture = new ScreenCapture<Display>({
  display: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
  grab: grabDisplay,
  select: (display, picture) => selector.select(display, picture),
  selectorSupported: () => windowsLeavesOutOfCaptures() || process.platform === 'darwin',
  hideForGrab,
});

const session = new SessionController(
  (state) => {
    if (alive(overlayWindow)) overlayWindow.webContents.send(IpcChannels.overlayState, state);
    if (state.phase === 'ended') {
      stopHotkeys();
      capture.stop();
      selector.cancel();
      // Why it ended stays for the window, which offers minutes after a session they ran out in (F8 · a).
      if (state.endReason && appState.lastSessionEnd !== state.endReason)
        setAppState({ lastSessionEnd: state.endReason });
    }
  },
  { capture: captureScreen, shelf },
);

// History (3.9): each session kept as it goes, once the database is open; the window reads it through the service.
let recorder: HistoryRecorder | null = null;
session.recordTo((event) => recorder?.record(event));
const history = new HistoryService({
  store: () => store?.history ?? null,
  running: () => recorder?.interviewId ?? null,
  job: serverJob,
  changed: (view) => setAppState(view),
});

// Prep drafts (3.9): written by the server from the documents, held here until each is kept or skipped.
const drafts = new DraftsService({
  documents: () => store?.documents() ?? null,
  preferences: () => store?.preferences() ?? null,
  job: serverJob,
  keep: (input) => {
    if (!store) return { ok: false, problem: "This computer's preferences can't be kept right now." };
    const saved = store.saveBankEntry(input, 'draft');
    if (!saved.ok) return saved;
    setAppState({ preferences: store.preferences() });
    return { ok: true };
  },
  changed: (view) => setAppState({ drafts: view }),
});

// Automatic updates (4.2): only a packaged app with a feed checks one; the window learns where it stands.
const updates = new Updates({
  updater: app.isPackaged ? autoUpdater : null,
  feedUrl: config.updateUrl,
  changed: (view) => setAppState({ update: view }),
});

/** A job on the server (3.4): its result once done. The preview answers its own, after a moment. */
function serverJob(path: string, body: unknown): Promise<unknown> {
  if (preview) {
    const result = path.endsWith('/prep-drafts') ? previewDrafts : previewDebrief;
    return new Promise((resolve) => setTimeout(() => resolve(result), previewDebriefMs));
  }
  if (!rest || auth?.current.status !== 'signed-in')
    return Promise.reject(new ApiError(401, ErrorCodes.Identity.Unauthenticated, 'Sign in first.'));
  return runJob(path, body, { rest });
}

// A purchase finished in the browser shows in the account by itself (F8 · b, c): read again until it does.
const payments = new PaymentWatch({
  read: async () => {
    await refreshAccount();
    return appState.account;
  },
  arrived: (notice) => {
    paymentUrl = null;
    setAppState({ payment: null, notice, lastSessionEnd: null });
  },
  stale: () => {
    if (appState.payment) setAppState({ payment: { ...appState.payment, stale: true } });
  },
});

// The call's sound while a session runs (1.11): each frame to the session, which uploads it (1.12), and how capture
// is going to the overlay (the meter, Q18's warning, a device being reopened).
const capture = new AudioCapture({
  open: openCaptureWindow,
  onFrame: (pcm, capturedAtMs) =>
    soundCheck.running ? soundCheck.audio(pcm, capturedAtMs) : session.audio(pcm, capturedAtMs),
  onStatus: (status) =>
    soundCheck.running ? soundCheck.capture(status) : session.dispatch({ type: 'capture', status }),
});

// The first run's sound check (F1 · 4): a short session of its own, heard in the app window, never in the overlay.
const soundCheck: SoundCheck = new SoundCheck({
  driver: () => checkDriver(),
  busy: () => session.running || practice.running,
  startCapture: () => capture.start(),
  stopCapture: () => capture.stop(),
  passed: () => {
    store?.soundCheckPassed();
    if (appState.account) setAppState({ account: withReadiness(appState.account) });
  },
  publish: (view) => {
    if (alive(appWindow)) appWindow.webContents.send(IpcChannels.appSoundCheckState, view);
    // The server ended it (its minutes ran out, say): the account is read again.
    if (view.phase === 'ended') void refreshAccount();
  },
});

// Practice (the Practice page, with the server's 3.3): a live session of its own, drawn in the app window, never in the
// overlay; it hears nothing, and ends once its summary comes. Kept in history with its scores (Q24).
const practice: PracticeRun = new PracticeRun({
  driver: () => practiceDriver(),
  busy: () =>
    session.running ? 'End the session first.' : soundCheck.running ? 'Finish the sound check first.' : null,
  publish: (view) => {
    if (alive(appWindow)) appWindow.webContents.send(IpcChannels.appPracticeState, view);
  },
  keep: (record) => {
    let id: number | null;
    try {
      id = store?.history.savePractice(record) ?? null;
    } catch {
      // History can't be written now: the practice is still shown, only not kept.
      return null;
    }
    if (id !== null) setAppState({ history: history.list() });
    return id;
  },
  about: () => {
    const documents = store?.documents();
    return { candidate: documents?.name.trim() ?? '', role: roleOf(documents?.jobDescription ?? '') };
  },
  // Its minutes were charged: the account is read again, as after any session.
  ended: () => void refreshAccount(),
});

/** Test hiding's overlay (F1 · 5b): the real overlay window, showing only its test card. */
let hidingTestWindow: BrowserWindow | null = null;
/** The sign-in page while the browser has it, for "Open the page again" and "Copy the link" (F1 · 2). */
let signInUrl: string | null = null;

/** The gap fillers' setting as last applied (Q47): a change goes to a running session at once; none runs, nothing goes. */
let appliedGapFillers: boolean | null = null;

function applySettings(changed: Settings): void {
  if (appliedGapFillers !== null && changed.gapFillers !== appliedGapFillers) {
    void session.setGapFillers(changed.gapFillers);
  }
  appliedGapFillers = changed.gapFillers;

  // Windows tints each window's frame and its frosted glass by the window's light or dark mode, which Electron takes
  // from nativeTheme: the theme chosen here, then, not Windows' own, or a light Sotto would sit on dark glass.
  nativeTheme.themeSource = changed.theme;
  // Each page paints its own background at its window's opacity, the overlay's over clear glass on every Windows
  // (windows/glass.ts): no window is ever faded as a whole, which would fade its text too.
  for (const win of [appWindow, overlayWindow]) {
    if (alive(win)) win.webContents.send(IpcChannels.settingsChanged, changed);
  }
}

function setAppState(change: Partial<AppState>): void {
  appState = { ...appState, ...change };
  if (alive(appWindow)) appWindow.webContents.send(IpcChannels.appState, appState);
}

/**
 * A problem reading the account goes away once a read works. One from something the user did (sign in, start) stays
 * until their next action, so a refresh in the background can't wipe it before it is read.
 */
let problemFromAccount = false;

function showProblem(problem: Problem | null, fromAccount = false): void {
  problemFromAccount = problem !== null && fromAccount;
  setAppState({ problem });
}

function problemFrom(error: unknown): Problem {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof SignInExpired) return { code: ErrorCodes.Identity.Unauthenticated, message: error.message };
  if (error instanceof NotSignedIn) return { code: ErrorCodes.Identity.Unauthenticated, message: 'Sign in first.' };
  if (error instanceof SignInCancelled) return { code: ErrorCodes.Identity.Unauthenticated, message: error.message };
  return { code: ErrorCodes.Request.Unavailable, message: error instanceof Error ? error.message : String(error) };
}

/** The account as Home shows it, its readiness from this computer: the documents kept here and the sound check. */
function withReadiness(view: AccountView): AccountView {
  return store ? { ...view, readiness: readinessFrom(store.documents(), store.soundCheckAt()) } : view;
}

/** The account again: after sign-in, after a session, and when the user comes back from the browser. */
async function refreshAccount(): Promise<void> {
  if (preview) {
    setAppState({
      auth: { status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' },
      account: withReadiness(previewBilling.account),
    });
    return;
  }
  if (!auth || !accounts) return;
  if (auth.current.status === 'unreachable') await auth.restore();
  if (auth.current.status !== 'signed-in') {
    loaded = null;
    setAppState({ account: null });
    return;
  }
  try {
    loaded = await accounts.load();
    accountReadAt = Date.now();
    setAppState({ account: withReadiness(loaded.view), deviceLimit: null });
    if (problemFromAccount) showProblem(null);
  } catch (error) {
    // At the device limit this computer can't be added: the window lists the account's computers instead (F3).
    if (error instanceof ApiError && error.code === ErrorCodes.Identity.DeviceLimitReached) await showDeviceLimit();
    else showProblem(problemFrom(error), true);
  }
}

/** The account's computers, to remove one so this one can be added (F3 · a). Nothing else works until then. */
async function showDeviceLimit(): Promise<void> {
  try {
    const view = await accounts!.deviceLimit();
    loaded = null;
    setAppState({ account: null, deviceLimit: { ...view, thisComputer: hostname() } });
    if (problemFromAccount) showProblem(null);
  } catch (error) {
    showProblem(problemFrom(error), true);
  }
}

/** Coming back to the window (from the browser, say) reads the account again, or checks on a purchase at once. */
function onAppFocus(): void {
  if (session.running || preview) return;
  if (payments.waiting) void payments.check();
  else if (Date.now() - accountReadAt > rereadAfterMs) void refreshAccount();
}

async function signIn(): Promise<CommandResult> {
  if (preview || !auth)
    return { ok: false, code: ErrorCodes.Request.Unavailable, message: 'The preview has no sign-in.' };
  if (session.running)
    return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'End the session first.' };
  try {
    showProblem(null);
    await auth.signIn(openSignInPage).finally(() => (signInUrl = null));
    // Back from the browser: the window comes forward again (sign-in never runs during a session).
    if (alive(appWindow)) appWindow.focus();
    await refreshAccount();
    return { ok: true };
  } catch (error) {
    const problem = problemFrom(error);
    // Cancelling is the user's own choice, not a problem to show.
    if (!(error instanceof SignInCancelled)) showProblem(problem);
    return { ok: false, ...problem };
  }
}

/** Only Keycloak's own pages open in the browser, and never during a session: a browser shows in a share (rule 7). */
async function openSignInPage(url: string): Promise<void> {
  if (!url.startsWith(`${config.oidcIssuer}/`)) throw new Error('Refused to open a page that is not the sign-in.');
  if (session.running) throw new Error('Signing in waits until the session ends.');
  signInUrl = url;
  await shell.openExternal(url);
}

/** "Open the page again" and "Copy the link", while the browser has the sign-in page. */
function signInPage(action: SignInPageAction): void {
  if (!signInUrl) return;
  if (action === 'open') void shell.openExternal(signInUrl);
  else clipboard.writeText(signInUrl);
}

async function signOut(): Promise<void> {
  if (preview || !auth) return;
  await auth.signOut();
  loaded = null;
  payments.stop();
  paymentUrl = null;
  setAppState({ account: null, payment: null, notice: null, lastSessionEnd: null, deviceLimit: null });
  showProblem(null);
}

const refusedDuringSession: CommandResult = {
  ok: false,
  code: ErrorCodes.Session.AlreadyInSession,
  message: 'This waits until the session ends.',
};

/**
 * Opens a page the server gave (a checkout, the billing portal) in the browser: https only, and never during a
 * session, since a browser shows in a share (stealth rule 7).
 */
async function openBillingPage(url: string): Promise<CommandResult> {
  if (session.running) return refusedDuringSession;
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    page = new URL('about:blank');
  }
  if (page.protocol !== 'https:') {
    return {
      ok: false,
      code: ErrorCodes.Request.Unavailable,
      message: "Sotto won't open that page: it isn't a secure one.",
    };
  }
  await shell.openExternal(page.href);
  return { ok: true };
}

/** The account service, when someone is signed in and the account has been read; null otherwise. */
function signedInAccounts(): AccountService | null {
  return auth?.current.status === 'signed-in' && accounts && loaded ? accounts : null;
}

const signInFirst: CommandResult = { ok: false, code: ErrorCodes.Identity.Unauthenticated, message: 'Sign in first.' };

/** Runs an account change the window asked for: a refusal shows as the problem, in the server's words. */
async function accountChange(change: (service: AccountService) => Promise<void>): Promise<CommandResult> {
  if (session.running) return refusedDuringSession;
  const service = signedInAccounts();
  if (!service) return signInFirst;
  showProblem(null);
  try {
    await change(service);
    return { ok: true };
  } catch (error) {
    const problem = problemFrom(error);
    showProblem(problem);
    return { ok: false, ...problem };
  }
}

/** Starts the free trial from this computer (F9 · a), then reads the account, which now has it. */
async function startTrial(): Promise<CommandResult> {
  if (preview) {
    const started = previewBilling.startTrial();
    if (started.ok) await refreshAccount();
    return started;
  }
  return accountChange(async (service) => {
    // A fresh token first: an email verified since sign-in only counts once the token says so (F2 · c).
    await auth!.accessToken({ force: true });
    await service.startTrial();
    await refreshAccount();
    const trial = appState.account?.plan;
    setAppState({
      notice: trial?.until ? `Your trial has started. It runs until ${trial.until}.` : 'Your trial has started.',
    });
  });
}

/** "+100 minutes", "Unlimited": what is being bought, as the window waits for it. */
function purchaseItem(purchase: PurchaseRequest): string {
  const catalog = appState.account?.catalog;
  if ('topUpId' in purchase) {
    const topUp = catalog?.topUps.find((t) => t.id === purchase.topUpId);
    return topUp ? `+${topUp.minutes} minutes` : 'Your minutes';
  }
  return catalog?.plans.find((p) => p.id === purchase.planId)?.name ?? 'Your plan';
}

/** Buys a plan or a top-up: the provider's page opens in the browser, and the window waits for the payment (F8 · b). */
async function buy(purchase: PurchaseRequest): Promise<CommandResult> {
  if (preview) {
    if (session.running) return refusedDuringSession;
    const bought = previewBilling.buy(purchase);
    setAppState({ payment: { item: bought.item, stale: false }, notice: null });
    setTimeout(() => {
      if (!appState.payment) return;
      const notice = bought.arrive();
      setAppState({ payment: null, notice, lastSessionEnd: null });
      void refreshAccount();
    }, previewPaymentMs);
    return { ok: true };
  }
  return accountChange(async (service) => {
    const url = await service.checkout(purchase);
    const opened = await openBillingPage(url);
    if (!opened.ok) throw new ApiError(0, opened.code, opened.message);
    paymentUrl = url;
    payments.start(purchase, loaded!.view);
    setAppState({ payment: { item: purchaseItem(purchase), stale: false }, notice: null });
  });
}

/** The purchase being waited for: open its page again, or stop waiting (the purchase isn't cancelled by it). */
async function payment(action: PaymentAction): Promise<CommandResult> {
  if (action === 'open') {
    if (preview) return { ok: true };
    return paymentUrl
      ? openBillingPage(paymentUrl)
      : { ok: false, code: ErrorCodes.Request.NotFound, message: 'Nothing is being bought.' };
  }
  payments.stop();
  paymentUrl = null;
  setAppState({ payment: null });
  return { ok: true };
}

/** The provider's billing portal (Manage billing): the plan, the card and cancelling happen there. */
async function billingPortal(): Promise<CommandResult> {
  if (preview) return session.running ? refusedDuringSession : { ok: true };
  return accountChange(async (service) => {
    const opened = await openBillingPage(await service.portal());
    if (!opened.ok) throw new ApiError(0, opened.code, opened.message);
    // Back from the portal, the account is read again (a cancelled or changed plan).
    accountReadAt = 0;
  });
}

/** Removes one of the account's other computers (F10 · c); the list and the removals left are read again. */
async function removeDevice(deviceId: string): Promise<CommandResult> {
  if (preview) {
    const removed = previewBilling.removeDevice(deviceId);
    if (!removed.ok) showProblem({ code: removed.code, message: removed.message });
    await refreshAccount();
    return removed;
  }
  return accountChange(async (service) => {
    await service.removeDevice(deviceId);
    await refreshAccount();
  });
}

/**
 * Saves a copy of everything the server keeps about the user (Q19), where they choose: read first, so a refusal comes
 * before the dialog. Never during a session: a save dialog shows in a share (stealth rule 7).
 */
async function exportData(): Promise<CommandResult> {
  if (preview) return session.running ? refusedDuringSession : { ok: true };
  return accountChange(async (service) => {
    const data = await service.exportData();
    const day = new Date().toISOString().slice(0, 10);
    const options = {
      title: 'Save a copy of your Sotto data',
      defaultPath: `sotto-data-${day}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const target = alive(appWindow)
      ? await dialog.showSaveDialog(appWindow, options)
      : await dialog.showSaveDialog(options);
    if (target.canceled || !target.filePath) return;
    await writeFile(target.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  });
}

/**
 * Deletes the account (Q19), its email typed again; the server refuses while a plan will still be charged or a live
 * session runs, in words the window shows. Deleted, the app signs out: the same sign-in would start a fresh account.
 */
async function deleteAccount(confirm: string): Promise<CommandResult> {
  if (preview) return session.running ? refusedDuringSession : { ok: true };
  const deleted = await accountChange((service) => service.deleteAccount(confirm));
  if (deleted.ok) await signOut();
  return deleted;
}

/** Adds this computer in place of one of the account's, at the device limit (F3 · b); then the account is read. */
async function replaceDevice(deviceId: string): Promise<CommandResult> {
  if (preview || !accounts || auth?.current.status !== 'signed-in') return signInFirst;
  showProblem(null);
  try {
    await accounts.replaceDevice(deviceId);
    setAppState({ deviceLimit: null });
    await refreshAccount();
    return { ok: true };
  } catch (error) {
    const problem = problemFrom(error);
    showProblem(problem);
    // The removals left may have changed (another computer removed one meanwhile): the list is read again.
    if (appState.deviceLimit) await showDeviceLimit();
    return { ok: false, ...problem };
  }
}

/** The ledger's earlier page ("Show earlier", F10 · b), added under what the window shows. */
async function ledgerMore(): Promise<CommandResult> {
  if (preview) {
    previewBilling.ledgerMore();
    await refreshAccount();
    return { ok: true };
  }
  const service = signedInAccounts();
  const account = appState.account;
  if (!service || !account) return signInFirst;
  if (account.ledgerNext === null) return { ok: true };
  try {
    const page = await service.ledgerPage(account.ledgerNext);
    // Only onto the same account as it was: a read in between starts the ledger again from its first page.
    if (appState.account?.ledgerNext === account.ledgerNext) {
      setAppState({
        account: { ...appState.account, ledger: [...appState.account.ledger, ...page.entries], ledgerNext: page.next },
      });
    }
    return { ok: true };
  } catch (error) {
    const problem = problemFrom(error);
    showProblem(problem);
    return { ok: false, ...problem };
  }
}

/** What the window has said and puts away: the after-call offer (F8 · a), or the quiet line (F8 · c). */
function dismiss(target: DismissTarget): void {
  setAppState(target === 'offer' ? { lastSessionEnd: null } : { notice: null });
}

/** The documents as a session takes them (`SetContext`, keyed by the C# names), or none at all. */
function contextOf(documents: DocumentsView) {
  const text = (value: string) => (value.trim() === '' ? null : value);
  const context = {
    Name: text(documents.name),
    Resume: text(documents.resume),
    JobDescription: text(documents.jobDescription),
    Notes: text(documents.notes),
  };
  return Object.values(context).some((value) => value !== null) ? context : null;
}

/** The first run as kept, for the app window: it decides whether the setup opens by itself. */
function showFirstRun(): void {
  if (store) setAppState({ firstRun: store.firstRun(notice.version) });
}

function acknowledgeNotice(version: number): CommandResult {
  if (!store) return { ok: false, code: ErrorCodes.Request.Unavailable, message: "This can't be kept right now." };
  if (version !== notice.version) {
    return { ok: false, code: ErrorCodes.Request.InvalidInput, message: 'The notice has changed: read it again.' };
  }
  store.acknowledgeNotice(version);
  showFirstRun();
  return { ok: true };
}

function finishSetup(): CommandResult {
  if (!store) return { ok: false, code: ErrorCodes.Request.Unavailable, message: "This can't be kept right now." };
  store.finishSetup();
  showFirstRun();
  return { ok: true };
}

async function soundCheckAction(action: SoundCheckAction): Promise<CommandResult> {
  if (action === 'stop') {
    const ran = soundCheck.running;
    await soundCheck.stop();
    // Its minute was charged: Home's minutes are read again, as after any session.
    if (ran) void refreshAccount();
    return { ok: true };
  }
  if (!preview && auth?.current.status !== 'signed-in') {
    return { ok: false, code: ErrorCodes.Identity.Unauthenticated, message: 'Sign in first.' };
  }
  return soundCheck.start();
}

/** Test hiding (F1 · 5b): the overlay with its test card, shown without taking focus, until the user says. */
function hidingTest(action: HidingTestAction): CommandResult {
  if (action === 'show') {
    if (session.running)
      return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'End the session first.' };
    if (alive(hidingTestWindow)) {
      hidingTestWindow.showInactive();
    } else {
      const win = createOverlayWindow({ compact: false, hidingTest: true });
      win.once('ready-to-show', () => win.showInactive());
      win.on('closed', () => {
        if (hidingTestWindow === win) hidingTestWindow = null;
      });
      hidingTestWindow = win;
    }
    return { ok: true };
  }
  if (alive(hidingTestWindow)) hidingTestWindow.destroy();
  hidingTestWindow = null;
  if (action === 'hidden') {
    store?.hidingTested();
    showFirstRun();
  }
  return { ok: true };
}

/** Keeps one document on this computer (Prepare, the first run); Home's readiness follows. */
function setDocument(change: SetDocumentRequest): CommandResult {
  if (!store) {
    return {
      ok: false,
      code: ErrorCodes.Request.Unavailable,
      message: "This computer's documents can't be kept right now.",
    };
  }
  const documents = store.setDocument(change.field, change.text);
  setAppState({ documents, account: appState.account ? withReadiness(appState.account) : null });
  return { ok: true };
}

/** The preferences can't be kept without the database: said in words. */
const noStore: CommandResult = {
  ok: false,
  code: ErrorCodes.Request.Unavailable,
  message: "This computer's preferences can't be kept right now.",
};

/** Keeps the custom instructions on this computer (3.8). */
function setInstructions(text: string): CommandResult {
  if (!store) return noStore;
  setAppState({ preferences: store.setInstructions(text) });
  return { ok: true };
}

/** Keeps an answer-bank entry, new or changed (3.8); refused in words when it isn't one, or the bank is full. */
function saveBankEntry(input: BankEntryInput): CommandResult {
  if (!store) return noStore;
  const saved = store.saveBankEntry(input);
  if (!saved.ok) return { ok: false, code: ErrorCodes.Request.InvalidInput, message: saved.problem };
  setAppState({ preferences: store.preferences() });
  return { ok: true };
}

/** Deletes an answer-bank entry (3.8). */
function removeBankEntry(id: string): CommandResult {
  if (!store) return noStore;
  store.removeBankEntry(id);
  setAppState({ preferences: store.preferences() });
  return { ok: true };
}

/** Keeps the prep doc on this computer, whole, with its name and whether it was cut (3.10). */
function setPrepDoc(change: SetPrepDocRequest): CommandResult {
  if (!store) {
    return {
      ok: false,
      code: ErrorCodes.Request.Unavailable,
      message: "This computer's documents can't be kept right now.",
    };
  }
  setAppState({ documents: store.setPrepDoc(change) });
  return { ok: true };
}

/**
 * A document read from a file the user picks (3.10), for the window to show before it is kept. The file dialog is a
 * native window a share could see, so never during a session (stealth rule 7); the file is read in the documents
 * window, never parsed here.
 */
async function readDocument(target: ReadTarget): Promise<ReadDocumentResult> {
  if (session.running || soundCheck.running) {
    return {
      ok: false,
      code: ErrorCodes.Session.AlreadyInSession,
      message: 'Files can be read once the session is over.',
    };
  }
  if (!alive(appWindow)) return refused('failed');
  const picked = await dialog.showOpenDialog(appWindow, {
    title: 'Choose a document',
    properties: ['openFile'],
    filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] }],
  });
  const path = picked.filePaths[0];
  if (picked.canceled || !path) return { ok: false, code: 'read_cancelled', message: '' };
  return readDocumentFile(path, target, {
    size: async (file) => (await stat(file)).size,
    readFile: async (file) => new Uint8Array(await readFile(file)),
    reader: documentReader,
  });
}

/**
 * This computer's database (1.14): encrypted in userData where the OS can encrypt, in memory otherwise and in the
 * preview, which brings sample documents. A file whose key is gone can never be read again: it is set aside, kept,
 * and a fresh one takes its place. Any other file that can't be opened (a newer app's) leaves this run on memory alone,
 * so going back to that app still finds it. Either way, the user is told.
 */
async function openStore(): Promise<LocalStore> {
  if (preview) {
    const sample = new LocalStore(openDatabase(null, null, migrations));
    for (const [field, text] of Object.entries(previewDocuments)) sample.setDocument(field as DocumentField, text);
    // A prepared answer the scripted interview asks for, so its 📌 card shows (3.8).
    for (const entry of previewBank) sample.saveBankEntry(entry);
    sample.soundCheckPassed();
    sample.acknowledgeNotice(notice.version);
    sample.finishSetup();
    return sample;
  }
  if (await ElectronSecretStore.available()) {
    const file = join(app.getPath('userData'), 'sotto.db');
    try {
      const key = await databaseKey(new ElectronSecretStore());
      try {
        return new LocalStore(openDatabase(file, key, migrations));
      } catch (error) {
        if (!isUnreadable(error)) throw error;
        setAside(file);
        showProblem({
          code: ErrorCodes.Request.Internal,
          message:
            "Your saved documents and settings couldn't be read, so Sotto started them afresh. The old file is kept beside the new one.",
        });
        return new LocalStore(openDatabase(file, key, migrations));
      }
    } catch {
      showProblem({
        code: ErrorCodes.Request.Internal,
        message:
          "Your saved documents and settings can't be read on this computer, so this run keeps them only until Sotto quits.",
      });
    }
  }
  return new LocalStore(openDatabase(null, null, migrations));
}

/** A driver over the hub, signed in: a session's, or the sound check's. */
function hubDriver(
  options: Pick<
    HubDriverDependencies,
    'auto' | 'context' | 'prepDoc' | 'preferences' | 'interviewType' | 'gapFillers' | 'takeOver' | 'onEntitlementsUpdated'
  >,
): HubDriver {
  const signedIn = auth!;
  const service = accounts!;
  return new HubDriver({
    connect: (accessToken, deviceProof, dpopProof, events) =>
      createLiveTransport({
        apiBaseUrl: config.apiBaseUrl,
        clientVersion: app.getVersion(),
        accessToken,
        deviceProof,
        dpopProof,
        events,
      }),
    accessToken: () => signedIn.accessToken(),
    connectProof: (accessToken) => service.connectProof(accessToken),
    dpopProof: (accessToken) => signedIn.dpopProof('GET', new URL(Protocol.HubPath, config.apiBaseUrl), accessToken),
    proof: (method, accessToken) => service.hubProof(method, accessToken),
    // A session that moves gets the screenshots attached here again, from the copies kept in memory (3.6).
    screenshot: (id) => shelf.get(id)?.bytes ?? null,
    ...options,
  });
}

/** The sound check's driver: MANUAL and without documents, so nothing it hears is answered. */
function checkDriver(): SessionDriver {
  return preview ? new PreviewDriver() : hubDriver({ auto: false, context: null });
}

/**
 * A practice session's driver (the Practice page): MANUAL, since nothing is heard, with this computer's documents,
 * which the server writes the questions from, and the answer bank, which seeds some of them. The same checks as a
 * session's before it: the notice read, signed in, the account read.
 */
async function practiceDriver(): Promise<PracticeDriverOutcome> {
  if (store && !store.firstRun(notice.version).acknowledged) {
    return {
      ok: false,
      code: ErrorCodes.Request.InvalidInput,
      message: 'Before your first session, read what goes where. Help runs the setup again.',
    };
  }
  if (preview) {
    return {
      ok: true,
      driver: new PreviewDriver({ interview: false }),
      minutesLeft: previewBilling.account.minutes?.usable ?? null,
      tier: 'smart',
    };
  }
  if (!auth || !accounts || auth.current.status !== 'signed-in') {
    return { ok: false, code: ErrorCodes.Identity.Unauthenticated, message: 'Sign in first.' };
  }
  if (!loaded) await refreshAccount();
  if (!loaded) return { ok: false, ...(appState.problem ?? problemFrom(new Error('The account could not be read.'))) };
  const documents = store?.documents();
  return {
    ok: true,
    driver: hubDriver({
      auto: false,
      context: documents ? contextOf(documents) : null,
      prepDoc: documents?.prepDoc
        ? { Name: documents.prepDoc.name || null, Text: documents.prepDoc.text, Cut: documents.prepDoc.cut }
        : null,
      preferences: store ? preferencesToSend(store.preferences()) : null,
      onEntitlementsUpdated: () => void refreshAccount(),
    }),
    minutesLeft: loaded.view.minutes?.usable ?? null,
    tier: loaded.tier,
  };
}

/** The Practice page's asks, each to the practice running (or about to). */
function practiceAction(action: PracticeAction): Promise<CommandResult> {
  switch (action.type) {
    case 'start':
      return practice.start(action.start);
    case 'answer':
      return practice.answer(action.text);
    case 'next':
      return practice.next();
    case 'stop':
      return practice.stop();
    case 'close':
      return practice.close();
  }
}

async function startSession(request: StartSessionRequest): Promise<CommandResult> {
  if (session.running) {
    return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'A session is already running.' };
  }
  // No live session before the notice is read (J2): the setup wizard opens by itself until it is.
  if (store && !store.firstRun(notice.version).acknowledged) {
    return {
      ok: false,
      code: ErrorCodes.Request.InvalidInput,
      message: 'Before your first session, read what goes where. Help runs the setup again.',
    };
  }
  if (soundCheck.running)
    return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'Finish the sound check first.' };
  if (practice.running)
    return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'Finish the practice first.' };

  let driver: SessionDriver;
  let account: LoadedAccount;
  if (preview) {
    driver = new PreviewDriver();
    account = { view: previewBilling.account, tier: 'smart' };
  } else {
    if (!auth || !accounts || auth.current.status !== 'signed-in') {
      return { ok: false, code: ErrorCodes.Identity.Unauthenticated, message: 'Sign in first.' };
    }
    if (!loaded) await refreshAccount();
    if (!loaded)
      return { ok: false, ...(appState.problem ?? problemFrom(new Error('The account could not be read.'))) };
    const documents = store?.documents();
    account = loaded;
    driver = hubDriver({
      // AUTO answers from the résumé and the job description; without both a session starts in MANUAL (Home says so).
      auto: documents ? answersOnItsOwn(documents) : false,
      context: documents ? contextOf(documents) : null,
      // The prep doc goes after them (3.10), with its name and whether it was cut.
      prepDoc: documents?.prepDoc
        ? { Name: documents.prepDoc.name || null, Text: documents.prepDoc.text, Cut: documents.prepDoc.cut }
        : null,
      // Then the custom instructions and the bank's enabled entries (3.8).
      preferences: store ? preferencesToSend(store.preferences()) : null,
      // First of all, TECH or INTRO as the user last chose it (Q47): the server starts technical.
      interviewType: settings.get().interviewType,
      // With the preferences, gap fillers on or off (Q47).
      gapFillers: settings.get().gapFillers,
      // Only after the user chose "Start here" on Home, once the server said the session is open elsewhere.
      takeOver: request.takeOver === true,
      // A purchase, a renewal or a refund while the session runs: the account's minutes and plan, read again.
      onEntitlementsUpdated: () => void refreshAccount(),
    });
  }

  showProblem(null);
  setAppState({ lastSessionEnd: null, notice: null });
  openOverlay();
  session.dispatch({ type: 'account', minutesLeft: account.view.minutes?.usable ?? null, tier: account.tier });
  // The questions answered are matched to the bank's enabled entries on this computer: the 📌 card (3.8).
  session.useBank(store?.preferences().bank ?? []);
  // Kept in history from its start (3.9), named by the documents it starts with; one that keeps nothing goes.
  const atStart = store?.documents();
  recorder?.begin({
    candidate: atStart?.name.trim() ?? '',
    role: roleOf(atStart?.jobDescription ?? ''),
    tier: account.tier,
  });
  const result = await session.start(driver);
  if (!result.ok) {
    recorder?.finish(null);
    // The server refused (no plan, no minutes, an outdated client…): back to the window, which says why.
    closeSession();
    showProblem({ code: result.code, message: result.message });
    return result;
  }
  startHotkeys();
  // Listening starts once the session does: no sound is captured before the server took it on.
  capture.start();
  return result;
}

function openOverlay(): void {
  const current = settings.get();
  if (!alive(overlayWindow)) {
    const win = createOverlayWindow({ compact: current.startCompact });
    // Shown without taking focus: the call app keeps the keyboard (stealth rule 6).
    win.once('ready-to-show', () => win.showInactive());
    win.on('closed', () => {
      overlayWindow = null;
    });
    overlayWindow = win;
  } else {
    overlayWindow.showInactive();
  }
  // During a session Sotto steps out of the way; the window comes back when the session is closed.
  appWindow?.hide();
}

/** After an ended session's overlay is closed, or a start that failed: back to the window. */
function closeSession(): void {
  stopHotkeys();
  capture.stop();
  selector.cancel();
  session.reset();
  if (alive(overlayWindow)) overlayWindow.destroy();
  overlayWindow = null;
  appWindow?.show();
  // The session used minutes.
  void refreshAccount();
}

function onOverlayWindow(action: OverlayWindowAction): void {
  if (!alive(overlayWindow)) return;
  const win = overlayWindow;
  switch (action.type) {
    case 'compact': {
      // The overlay lays itself out by its height, so resizing is all compact takes.
      const size = action.on ? overlaySize.compact : overlaySize.full;
      win.setSize(size.width, size.height);
      return;
    }
    case 'resize':
      win.setSize(Math.max(action.width, overlaySize.min.width), Math.max(action.height, overlaySize.min.height));
      return;
    case 'hide':
      if (session.current.phase === 'ended') closeSession();
      else win.hide();
      return;
    case 'releaseKeyboard':
      win.blur();
      return;
  }
}

function onAppWindow(action: AppWindowAction): void {
  if (!alive(appWindow)) return;
  if (action === 'minimize') appWindow.minimize();
  else if (action === 'maximize') {
    if (appWindow.isMaximized()) appWindow.unmaximize();
    else appWindow.maximize();
  } else app.quit();
}

function stepAnswer(delta: number): void {
  const index = visibleAnswerIndex(session.current);
  if (index !== null) session.dispatch({ type: 'view', index: index + delta });
}

/**
 * Windows 10 2004 (build 19041) and later leave a protected window out of every capture; before, it shows black. The
 * region selector is offered only where it stays out of the interviewer's view (v1).
 */
function windowsLeavesOutOfCaptures(): boolean {
  return process.platform === 'win32' && Number(release().split('.')[2] ?? 0) >= 19041;
}

/** desktopCapturer has no time limit of its own. */
const grabTimeoutMs = 8_000;

/** The display's picture at its full resolution in pixels (3.6, v1's grabDisplay). */
async function grabDisplay(display: Display): Promise<ShotImage> {
  const size =
    process.platform === 'win32'
      ? screen.dipToScreenRect(null, display.bounds)
      : {
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor),
        };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sources = await Promise.race([
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: size.width, height: size.height } }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The screen capture timed out.')), grabTimeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  // A source's display id is empty under some capturers (remote desktop, some virtual machines): then only a single
  // screen is taken, never a guess between several.
  const source =
    sources.find((s) => s.display_id !== '' && Number(s.display_id) === display.id) ??
    (sources.length === 1 ? sources[0] : undefined);
  if (!source) throw new Error("Couldn't tell which screen to capture.");
  return source.thumbnail;
}

/** Where content protection would show the overlay black in the picture, it steps away for the grab (v1). */
async function hideForGrab(): Promise<(() => void) | null> {
  if (!alive(overlayWindow) || !overlayWindow.isVisible() || windowsLeavesOutOfCaptures()) return null;
  const win = overlayWindow;
  win.hide();
  await new Promise((resolve) => setTimeout(resolve, 100));
  return () => {
    if (alive(win)) win.showInactive();
  };
}

/** A screenshot for the session; asked for with the overlay hidden, it comes back, never focused, for the answer. */
async function captureScreen(): Promise<CaptureOutcome> {
  const taken = await screenCapture.capture();
  if (taken.ok && alive(overlayWindow) && !overlayWindow.isVisible()) overlayWindow.showInactive();
  return taken;
}

function startHotkeys(): void {
  stopHotkeys();
  const { unregister } = registerSessionHotkeys(
    {
      trigger: () => void session.command({ type: 'trigger', text: null }),
      focus: () => overlayWindow?.focus(),
      toggleAuto: () => void session.command({ type: 'setMode', auto: !session.current.auto, paused: null }),
      togglePause: () => void session.command({ type: 'setMode', auto: null, paused: !session.current.paused }),
      previous: () => stepAnswer(-1),
      next: () => stepAnswer(1),
      compact: () => {
        if (!alive(overlayWindow)) return;
        const isCompact = overlayWindow.getSize()[1]! <= overlaySize.compact.height;
        onOverlayWindow({ type: 'compact', on: !isCompact });
      },
      hide: () => {
        // The panic key: a screenshot being chosen is given up too.
        selector.cancel();
        if (!alive(overlayWindow)) return;
        if (overlayWindow.isVisible()) overlayWindow.hide();
        else overlayWindow.showInactive();
      },
      capture: () => {
        // Pressed again while the selector shows: the whole display, the fast way (v1).
        if (selector.current) selector.current.finish({ kind: 'full' });
        // Otherwise the overlay takes it, since it holds what was typed: the screenshot's note in AUTO.
        else if (alive(overlayWindow)) overlayWindow.webContents.send(IpcChannels.overlayHotkey, 'capture');
      },
    },
    // The keys in effect: the defaults with the user's changes over them (Settings, 3.13).
    effectiveHotkeys(settings.get().hotkeys),
  );
  unregisterHotkeys = unregister;
}

function stopHotkeys(): void {
  unregisterHotkeys?.();
  unregisterHotkeys = null;
}

/** Sign-in and the account, made once the app is ready (safeStorage needs it). */
async function createServices(): Promise<void> {
  // Without OS encryption nothing secret may touch the disk: the sign-in then lasts until the app quits.
  const secrets: SecretStore = (await ElectronSecretStore.available())
    ? new ElectronSecretStore()
    : new MemorySecretStore();
  const signedIn = new AuthSession({
    oidc: new OpenIdClient({
      issuer: config.oidcIssuer,
      clientId: config.oidcClientId,
      scopes: config.scopes,
      // Plain HTTP only for the local Keycloak in development.
      allowHttp: !app.isPackaged && config.oidcIssuer.startsWith('http://localhost'),
    }),
    secrets,
    dpop: new DpopKeys(secrets),
    loopback: () => startLoopback(),
  });
  signedIn.onChange((view) => setAppState({ auth: view }));
  auth = signedIn;
  rest = new RestClient({
    baseUrl: config.apiBaseUrl,
    clientVersion: app.getVersion(),
    accessToken: (options) => signedIn.accessToken(options),
    dpopProof: (method, url, accessToken) => signedIn.dpopProof(method, url, accessToken),
  });
  accounts = new AccountService({
    rest,
    device: new DeviceIdentity(secrets),
    appVersion: app.getVersion(),
    platform: process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows',
    fingerprint: machineFingerprint,
  });
}

// Every renderer runs sandboxed, whatever a window's options say.
app.enableSandbox();
// The built pages come from app://sotto/, a scheme registered before the app is ready (4.1).
registerAppScheme();

// Development only: the capture path on this computer, checked with nothing shown (scripts/capture-check.mjs).
if (!app.isPackaged && process.argv.includes('--capture-check')) {
  runCaptureCheck();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!alive(appWindow) || session.running) return;
    if (appWindow.isMinimized()) appWindow.restore();
    appWindow.show();
    appWindow.focus();
  });

  void app.whenReady().then(async () => {
    // No native menus: a menu is a separate window a share could see, and the app draws its own.
    Menu.setApplicationMenu(null);
    denyPermissions(electronSession.defaultSession);
    serveApp(electronSession.defaultSession, rendererRoot);
    if (!preview) await createServices();
    store = await openStore();
    settings.restore(store.settings(), (kept) => store?.saveSettings(kept));
    // An app that quit mid-session may have left an interview that kept nothing.
    store.history.dropEmpty();
    recorder = new HistoryRecorder(store.history, {
      keepTranscripts: () => settings.get().keepTranscripts,
      changed: () => setAppState({ history: history.list() }),
    });
    setAppState({ documents: store.documents(), preferences: store.preferences(), history: history.list() });
    showFirstRun();
    updates.start();

    registerIpc({
      overlayWindow: () => overlayWindow,
      appWindow: () => appWindow,
      session,
      settings,
      appState: () => appState,
      signIn,
      cancelSignIn: () => auth?.cancelSignIn(),
      signOut,
      refresh: refreshAccount,
      startSession,
      onOverlayWindow,
      onAppWindow,
      copyText: (text) => clipboard.writeText(text),
      setDocument,
      acknowledgeNotice,
      finishSetup,
      soundCheck: soundCheckAction,
      practice: practiceAction,
      hidingTest,
      signInPage,
      startTrial,
      buy,
      billingPortal,
      payment,
      removeDevice,
      replaceDevice,
      ledgerMore,
      exportData,
      deleteAccount,
      dismiss,
      screenshotImage: (id) => shelf.dataUrl(id),
      selector: () => selector.current,
      setPrepDoc,
      readDocument,
      setInstructions,
      saveBankEntry,
      removeBankEntry,
      openInterview: (id) => history.open(id),
      deleteInterview: (id) => history.delete(id),
      clearHistory: () => history.clear(),
      debrief: (id) => history.debrief(id),
      writeDrafts: () => drafts.write(),
      keepDraft: (id) => drafts.keep(id),
      skipDraft: (id) => drafts.skip(id),
      installUpdate: () => updates.install(session.running || soundCheck.running),
    });

    const win = createAppWindow();
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      appWindow = null;
    });
    win.on('focus', onAppFocus);
    appWindow = win;

    // A stored sign-in comes back without the browser; then the account is read.
    if (auth) await auth.restore();
    await refreshAccount();
  });

  app.on('window-all-closed', () => app.quit());
  // Never a screenshot selector left over the screen behind a quitting app.
  app.on('before-quit', () => selector.cancel());
  app.on('will-quit', () => {
    payments.stop();
    documentReader.close();
    stopHotkeys();
    void soundCheck.stop();
    void practice.quit();
    capture.stop();
    if (alive(hidingTestWindow)) hidingTestWindow.destroy();
  });
}
