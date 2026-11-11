// Automatic updates (4.2), over a stand-in for electron-updater: nothing without a feed, the checks' schedule, each
// state the window is told, and installing only when one is ready and no session runs.
import { describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import type { UpdateView } from '../../src/shared/updates';
import { loadConfig } from '../../src/main/config';
import { checkEveryMs, firstCheckMs, Updates, type Updater } from '../../src/main/updates/updates';

class FakeUpdater implements Updater {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowDowngrade = true;
  allowPrerelease = true;
  feed: unknown = null;
  checks = 0;
  installs: unknown[][] = [];
  failNextCheck = false;
  private listeners = new Map<string, ((...args: never[]) => void)[]>();

  setFeedURL(options: { provider: 'generic'; url: string }): void {
    this.feed = options;
  }
  async checkForUpdates(): Promise<unknown> {
    this.checks += 1;
    if (this.failNextCheck) {
      this.failNextCheck = false;
      throw new Error('offline');
    }
    return null;
  }
  quitAndInstall(...args: unknown[]): void {
    this.installs.push(args);
  }
  on(event: string, listener: (...args: never[]) => void): unknown {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) (listener as (p: unknown) => void)(payload);
  }
}

function updates(
  feedUrl: string | null = 'https://downloads.example.test/win',
  updater: FakeUpdater | null = new FakeUpdater(),
) {
  const views: UpdateView[] = [];
  const timers: { kind: string; ms: number; run: () => void }[] = [];
  const service = new Updates({
    updater,
    feedUrl,
    changed: (view) => views.push(view),
    setTimeout: (run, ms) => timers.push({ kind: 'once', ms, run }),
    setInterval: (run, ms) => timers.push({ kind: 'every', ms, run }),
  });
  return { service, updater, views, timers };
}

describe('automatic updates (4.2)', () => {
  it.each<[string, string | null, boolean]>([
    ['no feed', null, true],
    ['no updater (an unpackaged build)', 'https://downloads.example.test/win', false],
  ])('does nothing with %s', (_, feed, withUpdater) => {
    const { service, views, timers } = updates(feed, withUpdater ? new FakeUpdater() : null);
    service.start();
    expect(service.current).toEqual({ status: 'off' });
    expect(views).toEqual([]);
    expect(timers).toEqual([]);
  });

  it('sets the feed, downloads by itself, installs on quit, never goes back or to a pre-release', () => {
    const { service, updater } = updates();
    service.start();
    expect(updater).toMatchObject({
      feed: { provider: 'generic', url: 'https://downloads.example.test/win' },
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowDowngrade: false,
      allowPrerelease: false,
    });
    expect(service.current).toEqual({ status: 'idle' });
  });

  it(`checks a minute after start, then every six hours`, async () => {
    const { service, updater, timers } = updates();
    service.start();
    expect(timers.map((t) => [t.kind, t.ms])).toEqual([
      ['once', firstCheckMs],
      ['every', checkEveryMs],
    ]);
    expect(updater!.checks).toBe(0);
    timers[0]!.run();
    timers[1]!.run();
    await Promise.resolve();
    expect(updater!.checks).toBe(2);
  });

  it('tells the window each step: checking, nothing new, downloading with its progress, ready', () => {
    const { service, updater, views } = updates();
    service.start();
    updater!.emit('checking-for-update');
    updater!.emit('update-not-available');
    updater!.emit('checking-for-update');
    updater!.emit('update-available', { version: '0.2.0' });
    updater!.emit('download-progress', { percent: 41.6 });
    updater!.emit('download-progress', { percent: 140 });
    updater!.emit('update-downloaded', { version: '0.2.0' });
    expect(views).toEqual([
      { status: 'idle' },
      { status: 'checking' },
      { status: 'idle' },
      { status: 'checking' },
      { status: 'downloading', version: '0.2.0', percent: 0 },
      { status: 'downloading', version: '0.2.0', percent: 42 },
      { status: 'downloading', version: '0.2.0', percent: 100 },
      { status: 'ready', version: '0.2.0' },
    ]);
  });

  it('says a check failed, and keeps a downloaded update ready through a later failure', async () => {
    const { service, updater } = updates();
    service.start();
    updater!.failNextCheck = true;
    await service.check();
    expect(service.current).toEqual({ status: 'failed' });
    updater!.emit('update-downloaded', { version: '0.2.0' });
    updater!.emit('error', new Error('feed gone'));
    expect(service.current).toEqual({ status: 'ready', version: '0.2.0' });
  });

  it('asks the feed again after a failure, but not while one downloads or waits', async () => {
    const { service, updater } = updates();
    service.start();
    updater!.emit('error', new Error('offline'));
    await service.check();
    expect(updater!.checks).toBe(1);
    updater!.emit('update-available', { version: '0.2.0' });
    await service.check();
    updater!.emit('update-downloaded', { version: '0.2.0' });
    await service.check();
    expect(updater!.checks).toBe(1);
  });

  it('installs a ready update at once outside a session, and refuses during one or before one is ready', () => {
    const { service, updater } = updates();
    service.start();
    expect(service.install(false)).toMatchObject({ ok: false, code: ErrorCodes.Request.NotFound });
    updater!.emit('update-downloaded', { version: '0.2.0' });
    expect(service.install(true)).toEqual({
      ok: false,
      code: ErrorCodes.Session.AlreadyInSession,
      message: 'Finish the session first: the update installs when it ends.',
    });
    expect(updater!.installs).toEqual([]);
    expect(service.install(false)).toEqual({ ok: true });
    expect(updater!.installs).toEqual([[false, true]]);
  });

  it('installs nothing when updates are off', () => {
    const { service } = updates(null);
    service.start();
    expect(service.install(false)).toMatchObject({ ok: false });
  });

  it('checks nothing while off', async () => {
    const updater = new FakeUpdater();
    const off = new Updates({ updater, feedUrl: null, changed: vi.fn() });
    await off.check();
    expect(updater.checks).toBe(0);
  });
});

describe('the update feed, as configured (4.2)', () => {
  it.each<[Record<string, string>, string | null]>([
    [{}, null],
    [{ SOTTO_UPDATE_URL: '' }, null],
    [{ SOTTO_UPDATE_URL: 'https://downloads.example.test/win' }, 'https://downloads.example.test/win'],
  ])('reads %j as %j', (env, url) => {
    expect(loadConfig(env).updateUrl).toBe(url);
  });
});
