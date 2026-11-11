// Automatic updates (4.2), over electron-updater: a feed of signed installers (signing waits on the cloud HSM),
// checked a minute after start and every six hours, a newer version downloaded in the background and installed when
// the app quits, or at once when the user asks outside a session. A staged rollout is the feed's own
// (`stagingPercentage` in its latest.yml): electron-updater keeps this computer's place in it. Nothing runs without a
// feed address (the domain, Q4).
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import type { CommandResult } from '../../shared/ipc';
import { updatesOff, type UpdateView } from '../../shared/updates';

/** The part of electron-updater's `autoUpdater` used here, so the tests can stand in for it. */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  setFeedURL(options: { provider: 'generic'; url: string }): void;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
}

export interface UpdatesDependencies {
  /** electron-updater's autoUpdater, or null where it can't run (an unpackaged build). */
  updater: Updater | null;
  /** The feed's address, or null: no feed, no updates. */
  feedUrl: string | null;
  changed: (view: UpdateView) => void;
  setTimeout?: (run: () => void, ms: number) => unknown;
  setInterval?: (run: () => void, ms: number) => unknown;
}

/** The first check waits this long after start, so it never slows the app's opening. */
export const firstCheckMs = 60_000;
/** Then one check every six hours. */
export const checkEveryMs = 6 * 60 * 60_000;

export class Updates {
  private view: UpdateView = updatesOff;

  constructor(private readonly deps: UpdatesDependencies) {}

  get current(): UpdateView {
    return this.view;
  }

  /** Sets the feed and the schedule; nothing at all without a feed or an updater. */
  start(): void {
    const { updater, feedUrl } = this.deps;
    if (!updater || !feedUrl) return;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    // Never back to an older version, and never a pre-release.
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.setFeedURL({ provider: 'generic', url: feedUrl });
    updater.on('checking-for-update', () => this.set({ status: 'checking' }));
    updater.on('update-not-available', () => this.set({ status: 'idle' }));
    updater.on('update-available', (info: { version: string }) =>
      this.set({ status: 'downloading', version: info.version, percent: 0 }),
    );
    updater.on('download-progress', (progress: { percent: number }) => {
      if (this.view.status === 'downloading') {
        this.set({ ...this.view, percent: Math.max(0, Math.min(100, Math.round(progress.percent))) });
      }
    });
    updater.on('update-downloaded', (info: { version: string }) =>
      this.set({ status: 'ready', version: info.version }),
    );
    // A failed check or download is tried again at the next one; the window says nothing alarming meanwhile.
    updater.on('error', () => {
      if (this.view.status !== 'ready') this.set({ status: 'failed' });
    });
    this.set({ status: 'idle' });
    (this.deps.setTimeout ?? setTimeout)(() => void this.check(), firstCheckMs);
    (this.deps.setInterval ?? setInterval)(() => void this.check(), checkEveryMs);
  }

  /** Asks the feed for a newer version, unless one is already on its way or here. */
  async check(): Promise<void> {
    const { updater } = this.deps;
    if (!updater || this.view.status === 'off' || this.view.status === 'downloading' || this.view.status === 'ready')
      return;
    try {
      await updater.checkForUpdates();
    } catch {
      this.set({ status: 'failed' });
    }
  }

  /** Installs the downloaded version now: the app quits and comes back updated. Never during a session. */
  install(sessionRunning: boolean): CommandResult {
    if (this.view.status !== 'ready' || !this.deps.updater) {
      return { ok: false, code: ErrorCodes.Request.NotFound, message: 'No update is ready yet.' };
    }
    if (sessionRunning) {
      return {
        ok: false,
        code: ErrorCodes.Session.AlreadyInSession,
        message: 'Finish the session first: the update installs when it ends.',
      };
    }
    this.deps.updater.quitAndInstall(false, true);
    return { ok: true };
  }

  private set(view: UpdateView): void {
    this.view = view;
    this.deps.changed(view);
  }
}
