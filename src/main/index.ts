// The app's core process. It owns the windows, sign-in, the account, the session and its connection.
// Renderers only draw: they reach main through the checked channels in src/shared/ipc.ts.
import { app, clipboard, Menu, session as electronSession, shell, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { AccountView } from '../shared/account';
import { initialAppState, type AppState, type Problem } from '../shared/app-state';
import { ErrorCodes } from '../shared/contracts/sotto-contracts';
import { answersOnItsOwn, type DocumentField, type DocumentsView, type SetDocumentRequest } from '../shared/documents';
import { notice } from '../shared/first-run';
import type {
  AppWindowAction,
  CommandResult,
  HidingTestAction,
  OverlayWindowAction,
  SignInPageAction,
  SoundCheckAction,
  StartSessionRequest,
} from '../shared/ipc';
import { IpcChannels } from '../shared/ipc-channels';
import { visibleAnswerIndex } from '../shared/live/view-state';
import type { Settings } from '../shared/settings';
import { AccountService, type LoadedAccount } from './account/account-service';
import { ApiError, RestClient } from './api/rest-client';
import { AuthSession, NotSignedIn, SignInCancelled } from './auth/auth-session';
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
import { registerIpc } from './ipc/register';
import { previewAccount } from './preview/account';
import { HubDriver, type HubDriverDependencies } from './session/hub-driver';
import { SoundCheck } from './session/sound-check';
import { registerSessionHotkeys } from './session/hotkeys';
import { PreviewDriver } from './session/preview-driver';
import { SessionController, type SessionDriver } from './session/session-controller';
import { SettingsStore } from './settings-store';
import { databaseKey, isUnreadable, openDatabase, setAside } from './storage/local-database';
import { LocalStore, readinessFrom } from './storage/local-store';
import { migrations } from './storage/schema';
import { previewDocuments } from './preview/documents';
import { createAppWindow } from './windows/app-window';
import { openCaptureWindow } from './windows/capture-window';
import { createOverlayWindow, overlaySize } from './windows/overlay-window';
import { denyPermissions } from './windows/stealth';

const config = loadConfig();

// `npm run dev:preview` plays a scripted interview and a sample account instead of the server, for UI work.
// Never in a packaged build.
const preview = !app.isPackaged && import.meta.env.MODE === 'preview';

let appWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let unregisterHotkeys: (() => void) | null = null;

let auth: AuthSession | null = null;
let accounts: AccountService | null = null;
let loaded: LoadedAccount | null = null;
/** This computer's documents and settings (1.14), once the database is open. */
let store: LocalStore | null = null;
let appState: AppState = { ...initialAppState, preview };

const alive = (win: BrowserWindow | null): win is BrowserWindow => win !== null && !win.isDestroyed();

const settings = new SettingsStore((changed) => applySettings(changed));

const session = new SessionController((state) => {
  if (alive(overlayWindow)) overlayWindow.webContents.send(IpcChannels.overlayState, state);
  if (state.phase === 'ended') {
    stopHotkeys();
    capture.stop();
  }
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
const soundCheck = new SoundCheck({
  driver: () => checkDriver(),
  busy: () => session.running,
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

/** Test hiding's overlay (F1 · 5b): the real overlay window, showing only its test card. */
let hidingTestWindow: BrowserWindow | null = null;
/** The sign-in page while the browser has it, for "Open the page again" and "Copy the link" (F1 · 2). */
let signInUrl: string | null = null;

function applySettings(changed: Settings): void {
  for (const win of [appWindow, overlayWindow]) {
    if (alive(win)) win.webContents.send(IpcChannels.settingsChanged, changed);
  }
  if (alive(overlayWindow)) overlayWindow.setOpacity(changed.opacity / 100);
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
      account: withReadiness(previewAccount),
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
    setAppState({ account: withReadiness(loaded.view) });
    if (problemFromAccount) showProblem(null);
  } catch (error) {
    showProblem(problemFrom(error), true);
  }
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
  setAppState({ account: null });
  showProblem(null);
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
  options: Pick<HubDriverDependencies, 'auto' | 'context' | 'takeOver' | 'onEntitlementsUpdated'>,
): HubDriver {
  const signedIn = auth!;
  const service = accounts!;
  return new HubDriver({
    connect: (accessToken, deviceProof, events) =>
      createLiveTransport({
        apiBaseUrl: config.apiBaseUrl,
        clientVersion: app.getVersion(),
        accessToken,
        deviceProof,
        events,
      }),
    accessToken: () => signedIn.accessToken(),
    connectProof: (accessToken) => service.connectProof(accessToken),
    proof: (method, accessToken) => service.hubProof(method, accessToken),
    ...options,
  });
}

/** The sound check's driver: MANUAL and without documents, so nothing it hears is answered. */
function checkDriver(): SessionDriver {
  return preview ? new PreviewDriver() : hubDriver({ auto: false, context: null });
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

  let driver: SessionDriver;
  let account: LoadedAccount;
  if (preview) {
    driver = new PreviewDriver();
    account = { view: previewAccount, tier: 'smart' };
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
      // Only after the user chose "Start here" on Home, once the server said the session is open elsewhere.
      takeOver: request.takeOver === true,
      // A purchase, a renewal or a refund while the session runs: the account's minutes and plan, read again.
      onEntitlementsUpdated: () => void refreshAccount(),
    });
  }

  showProblem(null);
  openOverlay();
  session.dispatch({ type: 'account', minutesLeft: account.view.minutes?.usable ?? null, tier: account.tier });
  const result = await session.start(driver);
  if (!result.ok) {
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
    win.setOpacity(current.opacity / 100);
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

function startHotkeys(): void {
  stopHotkeys();
  const { unregister } = registerSessionHotkeys({
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
      if (!alive(overlayWindow)) return;
      if (overlayWindow.isVisible()) overlayWindow.hide();
      else overlayWindow.showInactive();
    },
  });
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
    loopback: () => startLoopback(),
  });
  signedIn.onChange((view) => setAppState({ auth: view }));
  auth = signedIn;
  accounts = new AccountService({
    rest: new RestClient({
      baseUrl: config.apiBaseUrl,
      clientVersion: app.getVersion(),
      accessToken: (options) => signedIn.accessToken(options),
    }),
    device: new DeviceIdentity(secrets),
    appVersion: app.getVersion(),
    platform: process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows',
    fingerprint: machineFingerprint,
  });
}

// Every renderer runs sandboxed, whatever a window's options say.
app.enableSandbox();

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
    if (!preview) await createServices();
    store = await openStore();
    settings.restore(store.settings(), (kept) => store?.saveSettings(kept));
    setAppState({ documents: store.documents() });
    showFirstRun();

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
      hidingTest,
      signInPage,
    });

    const win = createAppWindow();
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      appWindow = null;
    });
    appWindow = win;

    // A stored sign-in comes back without the browser; then the account is read.
    if (auth) await auth.restore();
    await refreshAccount();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    stopHotkeys();
    void soundCheck.stop();
    capture.stop();
    if (alive(hidingTestWindow)) hidingTestWindow.destroy();
  });
}
