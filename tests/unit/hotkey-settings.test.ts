// Hotkeys changed in Settings (3.13): what an accelerator is, what a key press makes, which keys can stand, the set in
// effect, how it is kept, and that main registers it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceleratorOf,
  capsOf,
  effectiveHotkeys,
  hotkeyActions,
  hotkeyProblem,
  hotkeyProblems,
  hotkeyText,
  keysOf,
  parseAccelerator,
  sessionHotkeys,
} from '../../src/shared/hotkeys';
import { defaultSettings, settingsPatchSchema, settingsSchema } from '../../src/shared/settings';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';
import { SettingsStore } from '../../src/main/settings-store';

const shortcuts = vi.hoisted(() => ({
  held: new Set<string>(),
  registered: [] as string[],
  unregistered: [] as string[],
}));
vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string) => {
      if (shortcuts.held.has(accelerator)) return false;
      shortcuts.registered.push(accelerator);
      return true;
    },
    unregister: (accelerator: string) => shortcuts.unregistered.push(accelerator),
  },
}));
const { registerSessionHotkeys } = await import('../../src/main/session/hotkeys');

const press = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false,
});

describe('an accelerator (3.13)', () => {
  it.each<[string, boolean]>([
    ['CommandOrControl+Enter', true],
    ['CommandOrControl+Shift+G', true],
    ['CommandOrControl+Alt+Shift+Super+F12', true],
    ['Alt+Shift+1', true],
    ['CommandOrControl+Shift+`', true],
    ['CommandOrControl+Shift+Left', true],
    ['F5', true],
    ['Shift+CommandOrControl+G', false],
    ['CommandOrControl+CommandOrControl+G', false],
    ['Ctrl+Shift+G', false],
    ['CommandOrControl+Shift+g', false],
    ['CommandOrControl+Shift+', false],
    ['CommandOrControl+Shift++', false],
    ['CommandOrControl+Shift+F25', false],
    ['CommandOrControl+Shift+Escape', false],
    ['CommandOrControl+Shift', false],
    ['', false],
  ])('reads %j as one: %s', (accelerator, valid) => {
    expect(parseAccelerator(accelerator) !== null).toBe(valid);
  });

  it.each<[ReturnType<typeof press>, string | null]>([
    [press('KeyK', { ctrl: true, shift: true }), 'CommandOrControl+Shift+K'],
    [press('KeyK', { ctrl: true, alt: true, shift: true, meta: true }), 'CommandOrControl+Alt+Shift+Super+K'],
    [press('Digit7', { alt: true, shift: true }), 'Alt+Shift+7'],
    [press('F9', { ctrl: true }), 'CommandOrControl+F9'],
    [press('ArrowUp', { ctrl: true, shift: true }), 'CommandOrControl+Shift+Up'],
    [press('NumpadEnter', { ctrl: true }), 'CommandOrControl+Enter'],
    [press('Backquote', { ctrl: true, shift: true }), 'CommandOrControl+Shift+`'],
    [press('Space', { ctrl: true, alt: true }), 'CommandOrControl+Alt+Space'],
    [press('KeyQ'), 'Q'],
    [press('ShiftLeft', { shift: true }), null],
    [press('ControlLeft', { ctrl: true }), null],
    [press('IntlBackslash', { ctrl: true }), null],
    [press('Numpad5', { ctrl: true, shift: true }), null],
    [press('Escape', { ctrl: true }), null],
  ])('makes a press of %j into %j', (keys, accelerator) => {
    expect(acceleratorOf(keys)).toBe(accelerator);
    if (accelerator) expect(parseAccelerator(accelerator)).not.toBeNull();
  });
});

describe('which keys can stand (3.13)', () => {
  const keys = effectiveHotkeys();

  it.each<[string, string | null]>([
    ['CommandOrControl+Shift+K', null],
    ['CommandOrControl+Alt+K', null],
    ['Alt+Shift+K', null],
    ['CommandOrControl+F9', null],
    ['Alt+F9', null],
    ['CommandOrControl+Alt+Up', null],
    ['CommandOrControl+Shift+.', null],
    ['K', 'Add Ctrl or Alt.'],
    ['Shift+K', 'Add Ctrl or Alt.'],
    ['Super+K', 'Add Ctrl or Alt.'],
    ['F9', 'Add Ctrl or Alt.'],
    ['CommandOrControl+K', 'Add Shift or Alt: other apps use Ctrl with a letter for their own keys.'],
    ['Alt+K', 'Add Shift or Alt: other apps use Ctrl with a letter for their own keys.'],
    ['CommandOrControl+1', 'Add Shift or Alt: other apps use Ctrl with a letter for their own keys.'],
    ['CommandOrControl+/', 'Add Shift or Alt: other apps use Ctrl with a letter for their own keys.'],
    ['Alt+F4', 'Windows keeps that one for itself.'],
    ['Alt+Tab', 'Windows keeps that one for itself.'],
    ['CommandOrControl+Shift+H', '“Hide or show the overlay” has that one.'],
    ['CommandOrControl+Enter', '“Answer now” has that one.'],
    ['nonsense', 'Press a key with Ctrl or Alt.'],
  ])('takes %j for the screenshot key, or says why not: %j', (accelerator, problem) => {
    expect(hotkeyProblem('capture', accelerator, keys)).toBe(problem);
  });

  it('lets an action keep its own keys', () => {
    expect(hotkeyProblem('capture', sessionHotkeys.capture, keys)).toBeNull();
  });

  it('finds no problem in the defaults, and the clash on both sides of one', () => {
    expect(hotkeyProblems(effectiveHotkeys())).toEqual({});
    const clashing = effectiveHotkeys({ compact: 'CommandOrControl+Enter' });
    expect(hotkeyProblems(clashing)).toEqual({
      trigger: '“Compact or full view” has that one.',
      compact: '“Answer now” has that one.',
    });
  });

  it('takes two actions swapping their keys', () => {
    const swapped = effectiveHotkeys({ previous: sessionHotkeys.next, next: sessionHotkeys.previous });
    expect(hotkeyProblems(swapped)).toEqual({});
  });
});

describe('the set in effect, and how it is kept (3.13)', () => {
  it('puts the changes over the defaults, and ignores one that is no accelerator', () => {
    const keys = effectiveHotkeys({ capture: 'Alt+Shift+S', hide: 'not keys' });
    expect(keys.capture).toBe('Alt+Shift+S');
    expect(keys.hide).toBe(sessionHotkeys.hide);
    expect(hotkeyActions.filter((a) => keys[a] !== sessionHotkeys[a])).toEqual(['capture']);
  });

  it.each<[unknown, boolean]>([
    [{}, true],
    [{ capture: 'Alt+Shift+S' }, true],
    [{ capture: 'Alt+Shift+S', hide: 'CommandOrControl+Alt+H' }, true],
    [{ capture: 'CommandOrControl+Shift+H' }, false],
    [{ capture: 'CommandOrControl+S' }, false],
    [{ capture: 'Shift+S' }, false],
    [{ capture: 'not keys' }, false],
    [{ record: 'Alt+Shift+R' }, false],
    [{ capture: 5 }, false],
    [[], false],
  ])('takes %j as the changed hotkeys: %s', (hotkeys, valid) => {
    expect(settingsPatchSchema.safeParse({ hotkeys }).success).toBe(valid);
    expect(settingsSchema.safeParse({ ...defaultSettings, hotkeys }).success).toBe(valid);
  });

  it('keeps the changed hotkeys on this computer, and drops a kept set that can no longer stand', () => {
    const db = openDatabase(null, null, migrations);
    const local = new LocalStore(db);
    const store = new SettingsStore(() => {});
    store.restore(local.settings(), (kept) => local.saveSettings(kept));
    store.update({ hotkeys: { capture: 'Alt+Shift+S' } });
    expect(new LocalStore(db).settings().hotkeys).toEqual({ capture: 'Alt+Shift+S' });

    db.prepare("UPDATE settings SET value = ? WHERE key = 'settings.hotkeys'").run(
      JSON.stringify({ capture: 'CommandOrControl+Shift+H' }),
    );
    expect(new LocalStore(db).settings().hotkeys).toBeUndefined();
  });

  it('names the keys in effect for words and caps', () => {
    const keys = effectiveHotkeys({ capture: 'CommandOrControl+Alt+Super+S', previous: 'Alt+Shift+Left' });
    expect(hotkeyText('capture', keys)).toBe('Ctrl+Alt+Win+S');
    expect(hotkeyText('trigger', keys)).toBe('Ctrl+Enter');
    expect(capsOf('CommandOrControl+Shift+Up')).toEqual(['Ctrl', 'Shift', '↑']);
    expect(keysOf(['previous', 'next'])).toEqual(['Ctrl', 'Shift', '←', '→']);
    expect(keysOf(['previous', 'next'], keys)).toEqual(['Alt', 'Shift', '←', 'Ctrl', 'Shift', '→']);
  });
});

describe('the hotkeys main registers for a session (3.13)', () => {
  beforeEach(() => {
    shortcuts.held = new Set();
    shortcuts.registered = [];
    shortcuts.unregistered = [];
  });

  const actions = Object.fromEntries(hotkeyActions.map((a) => [a, vi.fn()])) as unknown as Record<
    (typeof hotkeyActions)[number],
    () => void
  >;

  it('registers the keys in effect, the defaults where nothing changed', () => {
    registerSessionHotkeys(actions, effectiveHotkeys({ capture: 'Alt+Shift+S' }));
    expect(shortcuts.registered).toContain('Alt+Shift+S');
    expect(shortcuts.registered).not.toContain(sessionHotkeys.capture);
    expect(shortcuts.registered).toHaveLength(hotkeyActions.length);
  });

  it('says which keys another app holds, and gives back only the ones it took', () => {
    shortcuts.held = new Set([sessionHotkeys.hide]);
    const { taken, unregister } = registerSessionHotkeys(actions);
    expect(taken).toEqual([sessionHotkeys.hide]);
    unregister();
    expect([...shortcuts.unregistered].sort()).toEqual([...shortcuts.registered].sort());
    expect(shortcuts.unregistered).not.toContain(sessionHotkeys.hide);
  });
});
