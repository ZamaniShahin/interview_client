// The app's core process. It owns the windows, sign-in, the account, the session and its connection.
// Renderers only draw: they reach main through the checked channels in src/shared/ipc.ts.
import { app, Menu, session as electronSession, shell, type BrowserWindow } from 'electron';
import { initialAppState, type AppState, type Problem } from '../shared/app-state';
import { ErrorCodes } from '../shared/contracts/sotto-contracts';
import type { AppWindowAction, CommandResult, OverlayWindowAction } from '../shared/ipc';
import { IpcChannels } from '../shared/ipc-channels';
import { visibleAnswerIndex } from '../shared/live/view-state';
import type { Settings } from '../shared/settings';
import { AccountService, type LoadedAccount } from './account/account-service';
import { ApiError, RestClient } from './api/rest-client';
import { AuthSession, NotSignedIn, SignInCancelled } from './auth/auth-session';
import { ElectronSecretStore } from './auth/electron-secret-store';
import { startLoopback } from './auth/loopback';
import { OpenIdClient, SignInExpired } from './auth/oidc';
import { MemorySecretStore, type SecretStore } from './auth/secret-store';
import { loadConfig } from './config';
import { createLiveTransport } from './connection/live-connection';
import { DeviceIdentity } from './device/device-identity';
import { machineFingerprint } from './device/fingerprint';
import { registerIpc } from './ipc/register';
import { previewAccount } from './preview/account';
import { HubDriver } from './session/hub-driver';
import { registerSessionHotkeys } from './session/hotkeys';
import { PreviewDriver } from './session/preview-driver';
import { SessionController, type SessionDriver } from './session/session-controller';
import { SettingsStore } from './settings-store';
import { createAppWindow } from './windows/app-window';
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
let appState: AppState = { ...initialAppState, preview };

const alive = (win: BrowserWindow | null): win is BrowserWindow => win !== null && !win.isDestroyed();

const settings = new SettingsStore((changed) => applySettings(changed));

const session = new SessionController((state) => {
  if (alive(overlayWindow)) overlayWindow.webContents.send(IpcChannels.overlayState, state);
  if (state.phase === 'ended') stopHotkeys();
});

function applySettings(changed: Settings): void {
  for (const win of [appWindow, overlayWindow]) {
    if (alive(win)) win.webContents.send(IpcChannels.settingsChanged, changed);
  }
  if (alive(overlayWindow)) {
    overlayWindow.setOpacity(changed.opacity / 100);
    overlayWindow.setSkipTaskbar(changed.trayOnly);
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

/** The account again: after sign-in, after a session, and when the user comes back from the browser. */
async function refreshAccount(): Promise<void> {
  if (preview) {
    setAppState({ auth: { status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' }, account: previewAccount });
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
    setAppState({ account: loaded.view });
    if (problemFromAccount) showProblem(null);
  } catch (error) {
    showProblem(problemFrom(error), true);
  }
}

async function signIn(): Promise<CommandResult> {
  if (preview || !auth) return { ok: false, code: ErrorCodes.Request.Unavailable, message: 'The preview has no sign-in.' };
  if (session.running) return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'End the session first.' };
  try {
    showProblem(null);
    await auth.signIn(openSignInPage);
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
  await shell.openExternal(url);
}

async function signOut(): Promise<void> {
  if (preview || !auth) return;
  await auth.signOut();
  loaded = null;
  setAppState({ account: null });
  showProblem(null);
}

async function startSession(): Promise<CommandResult> {
  if (session.running) {
    return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'A session is already running.' };
  }

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
    if (!loaded) return { ok: false, ...(appState.problem ?? problemFrom(new Error('The account could not be read.'))) };
    const signedIn = auth;
    const service = accounts;
    const { readiness } = loaded.view;
    account = loaded;
    driver = new HubDriver({
      connect: (accessToken, events) =>
        createLiveTransport({ apiBaseUrl: config.apiBaseUrl, clientVersion: app.getVersion(), accessToken, events }),
      accessToken: () => signedIn.accessToken(),
      proof: (method, accessToken) => service.hubProof(method, accessToken),
      // AUTO answers from the résumé and the job description; without both a session starts in MANUAL (Home says so).
      auto: readiness.resume !== null && readiness.jobDescription !== null,
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
  return result;
}

function openOverlay(): void {
  const current = settings.get();
  if (!alive(overlayWindow)) {
    const win = createOverlayWindow({ compact: current.startCompact, trayOnly: current.trayOnly });
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
  const secrets: SecretStore = (await ElectronSecretStore.available()) ? new ElectronSecretStore() : new MemorySecretStore();
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

if (!app.requestSingleInstanceLock()) {
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
  app.on('will-quit', () => stopHotkeys());
}
