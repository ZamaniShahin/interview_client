// Main's IPC handlers for 3.6, 3.8 and 3.10, run over a stand-in for Electron's ipcMain: the deep round over those
// checkpoints. Each channel answers only the window it belongs to, checks what it is sent, and says why it refused.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import { IpcChannels } from '../../src/shared/ipc-channels';
import { documentLimits } from '../../src/shared/text-limits';
import { maxInstructionsChars } from '../../src/shared/answer-bank';
import type { IpcDependencies } from '../../src/main/ipc/register';
import type { OpenSelector } from '../../src/main/screenshots/region-selector';

type Handler = (event: { sender: { id: number } }, payload?: unknown) => unknown;

const ipc = vi.hoisted(() => ({ handlers: new Map<string, Handler>(), listeners: new Map<string, Handler>() }));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => ipc.handlers.set(channel, handler),
    on: (channel: string, listener: Handler) => ipc.listeners.set(channel, listener),
  },
}));

const { registerIpc } = await import('../../src/main/ipc/register');

const overlayId = 1;
const appId = 2;
const selectorId = 3;
const from = (id: number) => ({ sender: { id } });
const window = (id: number) => ({ isDestroyed: () => false, webContents: { id } });
const invalid = { ok: false, code: ErrorCodes.Request.InvalidInput, message: 'That request was not valid.' };
const tooLong = { ok: false, code: ErrorCodes.Field.TooLong, message: 'That is longer than Sotto can take.' };

let calls: Record<string, unknown[][]>;
/** The selection showing, as the test sees it: what its page made it do. */
type ShownSelector = OpenSelector & { finished: unknown[]; readied: number };
let selector: ShownSelector | null;

function register(over: Partial<IpcDependencies> = {}) {
  calls = {};
  ipc.handlers.clear();
  ipc.listeners.clear();
  const own: Partial<IpcDependencies> = {
    overlayWindow: () => window(overlayId) as never,
    appWindow: () => window(appId) as never,
    selector: () => selector,
    screenshotImage: (id) => `data:image/png;base64,${id}`,
    ...over,
  };
  // Every other dependency records its calls and answers ok.
  const deps = new Proxy(own, {
    get: (target, key: string) =>
      key in target
        ? target[key as keyof IpcDependencies]
        : (...args: unknown[]) => {
            (calls[key] ??= []).push(args);
            return key === 'readDocument'
              ? Promise.resolve({ ok: true, text: 'read', name: 'a.pdf', cut: false })
              : { ok: true };
          },
  }) as IpcDependencies;
  registerIpc(deps);
}

const invoke = (channel: string, sender: number, payload?: unknown) =>
  ipc.handlers.get(channel)!(from(sender), payload);
const send = (channel: string, sender: number, payload?: unknown) => ipc.listeners.get(channel)!(from(sender), payload);

beforeEach(() => {
  selector = null;
  register();
});

describe('a screenshot’s image, for the overlay only (3.6)', () => {
  it('gives the overlay a kept screenshot by its id', () => {
    expect(invoke(IpcChannels.overlayScreenshot, overlayId, 'shot-abc-1')).toBe('data:image/png;base64,shot-abc-1');
  });

  it.each([
    ['the app window', appId, 'shot-abc-1'],
    ['the selector', selectorId, 'shot-abc-1'],
    ['an unknown page', 99, 'shot-abc-1'],
  ])('gives %s nothing', (_, sender, id) => {
    expect(invoke(IpcChannels.overlayScreenshot, sender, id)).toBeNull();
  });

  it.each(['../shot', 'shot 1', '', 'x'.repeat(41), 42, null, { id: 'shot-1' }])(
    'gives nothing for a screenshot named %j, without looking',
    (id) => {
      const looked: string[] = [];
      register({ screenshotImage: (asked) => (looked.push(asked), 'x') });
      expect(invoke(IpcChannels.overlayScreenshot, overlayId, id)).toBeNull();
      expect(looked).toEqual([]);
    },
  );

  it('gives nothing once the overlay is closed', () => {
    register({ overlayWindow: () => ({ isDestroyed: () => true, webContents: { id: overlayId } }) as never });
    expect(invoke(IpcChannels.overlayScreenshot, overlayId, 'shot-abc-1')).toBeNull();
  });
});

describe('the region selector’s page, the only one heard on its channels (3.6)', () => {
  const open = (): ShownSelector => {
    const shown: ShownSelector = {
      contentsId: selectorId,
      frame: { image: 'data:image/jpeg;base64,AAAA', width: 1920, height: 1080 },
      finished: [],
      readied: 0,
      ready: () => {
        shown.readied += 1;
      },
      finish: (selection) => {
        shown.finished.push(selection);
      },
    };
    selector = shown;
    return shown;
  };

  it('gives the page showing its frozen picture, and nobody else', () => {
    open();
    expect(invoke(IpcChannels.selectorInit, selectorId)).toEqual(selector!.frame);
    expect(invoke(IpcChannels.selectorInit, overlayId)).toBeNull();
    expect(invoke(IpcChannels.selectorInit, appId)).toBeNull();
  });

  it('gives nothing when no selection is showing', () => {
    expect(invoke(IpcChannels.selectorInit, selectorId)).toBeNull();
    send(IpcChannels.selectorReady, selectorId);
    send(IpcChannels.selectorDone, selectorId, { kind: 'full' });
  });

  it('shows the selection when its own page says it painted, and for no other', () => {
    const shown = open();
    send(IpcChannels.selectorReady, overlayId);
    expect(shown.readied).toBe(0);
    send(IpcChannels.selectorReady, selectorId);
    expect(shown.readied).toBe(1);
  });

  it.each<[unknown, unknown]>([
    [{ kind: 'full' }, { kind: 'full' }],
    [
      { kind: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      { kind: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    ],
    [{ kind: 'cancel' }, { kind: 'cancel' }],
    [{ kind: 'rect', x: 0.1 }, null],
    [{ kind: 'full', area: 'all' }, null],
    ['full', null],
    [undefined, null],
  ])('ends the selection on %j from its page, with %j', (payload, finishedWith) => {
    const shown = open();
    send(IpcChannels.selectorDone, selectorId, payload);
    expect(shown.finished).toEqual([finishedWith]);
  });

  it('ignores a choice from any other page', () => {
    const shown = open();
    for (const sender of [overlayId, appId, 99]) send(IpcChannels.selectorDone, sender, { kind: 'full' });
    expect(shown.finished).toEqual([]);
  });
});

describe('the prep doc and reading files, for the app window only (3.10)', () => {
  it('keeps a prep doc, its name trimmed', () => {
    expect(invoke(IpcChannels.appSetPrepDoc, appId, { text: 'Guide', name: '  guide.md ', cut: true })).toEqual({
      ok: true,
    });
    expect(calls.setPrepDoc).toEqual([[{ text: 'Guide', name: 'guide.md', cut: true }]]);
  });

  it.each<[string, unknown, unknown]>([
    ['a prep doc past its limit', { text: 'x'.repeat(documentLimits.prepDoc + 1), name: '', cut: false }, tooLong],
    ['a name past 200 characters', { text: 'x', name: 'n'.repeat(201), cut: false }, invalid],
    ['no cut flag', { text: 'x', name: '' }, invalid],
    ['an extra field', { text: 'x', name: '', cut: false, path: 'C:\\x' }, invalid],
    ['nothing', undefined, invalid],
  ])('refuses %s, keeping nothing', (_, payload, refusal) => {
    expect(invoke(IpcChannels.appSetPrepDoc, appId, payload)).toEqual(refusal);
    expect(calls.setPrepDoc).toBeUndefined();
  });

  it('keeps no prep doc the overlay sends', () => {
    expect(invoke(IpcChannels.appSetPrepDoc, overlayId, { text: 'x', name: '', cut: false })).toEqual(invalid);
    expect(calls.setPrepDoc).toBeUndefined();
  });

  it.each(['resume', 'jobDescription', 'notes', 'name', 'prepDoc'])('reads a file into the %s', async (target) => {
    expect(await invoke(IpcChannels.appReadDocument, appId, target)).toMatchObject({ ok: true });
    expect(calls.readDocument).toEqual([[target]]);
  });

  it.each<[string, number, unknown]>([
    ['for the overlay', overlayId, 'resume'],
    ['into a document there is not', appId, 'cv'],
    ['into nothing', appId, undefined],
    ['into a path', appId, 'C:\\Users\\sam\\cv.pdf'],
  ])('reads no file %s', async (_, sender, target) => {
    expect(await invoke(IpcChannels.appReadDocument, sender, target)).toEqual(invalid);
    expect(calls.readDocument).toBeUndefined();
  });
});

describe('the preferences, for the app window only (3.8)', () => {
  it.each(['Keep answers short.', '', 'x'.repeat(maxInstructionsChars)])('keeps instructions of %#', (text) => {
    expect(invoke(IpcChannels.appSetInstructions, appId, text)).toEqual({ ok: true });
    expect(calls.setInstructions).toEqual([[text]]);
  });

  it.each<[string, number, unknown, unknown]>([
    ['instructions past their limit, as too long', appId, 'x'.repeat(maxInstructionsChars + 1), tooLong],
    ['instructions that are not text', appId, 42, invalid],
    ['no instructions at all', appId, undefined, invalid],
    ['instructions from the overlay', overlayId, 'x', invalid],
  ])('refuses %s', (_, sender, payload, refusal) => {
    expect(invoke(IpcChannels.appSetInstructions, sender, payload)).toEqual(refusal);
    expect(calls.setInstructions).toBeUndefined();
  });

  const entry = { id: null, phrasings: ['Why us?'], answer: 'Your ledger.', enabled: true };

  it.each<[string, unknown]>([
    ['a new entry', entry],
    ['a known entry, by its id', { ...entry, id: 'a'.repeat(32) }],
    ['an entry with no phrasings yet (main words the problem)', { ...entry, phrasings: [] }],
  ])('passes on %s to keep', (_, payload) => {
    expect(invoke(IpcChannels.appSaveBankEntry, appId, payload)).toEqual({ ok: true });
    expect(calls.saveBankEntry).toEqual([[payload]]);
  });

  it.each<[string, number, unknown]>([
    ['an id the client could not have made', appId, { ...entry, id: '../x' }],
    ['an id past 40 characters', appId, { ...entry, id: 'a'.repeat(41) }],
    ['more phrasings than an editor sends', appId, { ...entry, phrasings: Array.from({ length: 25 }, () => 'q') }],
    ['a phrasing far past its limit', appId, { ...entry, phrasings: ['q'.repeat(1_201)] }],
    ['an answer far past its limit', appId, { ...entry, answer: 'a'.repeat(8_001) }],
    ['no enabled flag', appId, { id: null, phrasings: ['q'], answer: 'a' }],
    ['an extra field', appId, { ...entry, source: 'draft' }],
    ['an entry from the overlay', overlayId, entry],
  ])('keeps nothing of %s', (_, sender, payload) => {
    expect(invoke(IpcChannels.appSaveBankEntry, sender, payload)).toEqual(invalid);
    expect(calls.saveBankEntry).toBeUndefined();
  });

  it('deletes an entry by its id, and nothing by anything else', () => {
    expect(invoke(IpcChannels.appRemoveBankEntry, appId, 'abc123')).toEqual({ ok: true });
    expect(calls.removeBankEntry).toEqual([['abc123']]);
    for (const [sender, id] of [
      [appId, '../x'],
      [appId, ''],
      [appId, 7],
      [overlayId, 'abc123'],
    ] as const) {
      expect(invoke(IpcChannels.appRemoveBankEntry, sender, id)).toEqual(invalid);
    }
    expect(calls.removeBankEntry).toHaveLength(1);
  });
});

describe('history, for the app window only (3.9)', () => {
  it.each([
    [IpcChannels.appOpenInterview, 'openInterview'],
    [IpcChannels.appDeleteInterview, 'deleteInterview'],
    [IpcChannels.appDebrief, 'debrief'],
  ])('passes %s an interview named by its id', async (channel, dep) => {
    await invoke(channel, appId, 42);
    expect(calls[dep]).toEqual([[42]]);
  });

  it.each([0, -1, 1.5, '1', null, undefined, Number.MAX_SAFE_INTEGER + 2, [1]])(
    'names no interview by %j',
    async (id) => {
      expect(await invoke(IpcChannels.appOpenInterview, appId, id)).toBeNull();
      expect(await invoke(IpcChannels.appDeleteInterview, appId, id)).toEqual(invalid);
      expect(await invoke(IpcChannels.appDebrief, appId, id)).toEqual(invalid);
      expect(calls.openInterview ?? calls.deleteInterview ?? calls.debrief).toBeUndefined();
    },
  );

  it('hears nothing of history from the overlay', async () => {
    expect(await invoke(IpcChannels.appOpenInterview, overlayId, 1)).toBeNull();
    expect(await invoke(IpcChannels.appDeleteInterview, overlayId, 1)).toEqual(invalid);
    expect(await invoke(IpcChannels.appClearHistory, overlayId)).toEqual(invalid);
    expect(await invoke(IpcChannels.appDebrief, overlayId, 1)).toEqual(invalid);
    expect(Object.keys(calls)).toEqual([]);
  });

  it('deletes all history for the app window', async () => {
    expect(await invoke(IpcChannels.appClearHistory, appId)).toEqual({ ok: true });
    expect(calls.clearHistory).toEqual([[]]);
  });

  it('copies text for the app window only, and only text it can take', () => {
    send(IpcChannels.appCopy, appId, 'Thank you, Priya.');
    send(IpcChannels.appCopy, overlayId, 'From the overlay.');
    send(IpcChannels.appCopy, appId, '');
    send(IpcChannels.appCopy, appId, 42);
    send(IpcChannels.appCopy, appId, 'x'.repeat(100_001));
    expect(calls.copyText).toEqual([['Thank you, Priya.']]);
  });
});
