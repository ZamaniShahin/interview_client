// The deep round over 3.9, 3.13 and 4.1 (Shahin's, 2026-11-11): hotkeys and the app:// pages. Every key a press can
// make, every action against a spread of keys, a whole set changed at once, and the addresses served or not.
import { join, normalize } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  acceleratorOf,
  effectiveHotkeys,
  hotkeyActions,
  hotkeyProblem,
  hotkeyProblems,
  parseAccelerator,
  sessionHotkeys,
  type HotkeyAction,
} from '../../src/shared/hotkeys';
import { settingsPatchSchema } from '../../src/shared/settings';

vi.mock('electron', () => ({ net: {}, protocol: {} }));
const { fileOf } = await import('../../src/main/windows/app-protocol');

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const digits = '0123456789'.split('');
const functionKeys = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);

describe('every key a press can make (3.13)', () => {
  it.each(letters)('makes Ctrl+Shift+%s from its key', (letter) => {
    const accelerator = acceleratorOf({
      code: `Key${letter}`,
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      metaKey: false,
    });
    expect(accelerator).toBe(`CommandOrControl+Shift+${letter}`);
    expect(parseAccelerator(accelerator!)).not.toBeNull();
  });

  it.each(digits)('makes Alt+Shift+%s from its key', (digit) => {
    expect(acceleratorOf({ code: `Digit${digit}`, ctrlKey: false, altKey: true, shiftKey: true, metaKey: false })).toBe(
      `Alt+Shift+${digit}`,
    );
  });

  it.each(functionKeys)('makes Ctrl+%s from its key', (key) => {
    expect(acceleratorOf({ code: key, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe(
      `CommandOrControl+${key}`,
    );
  });

  it.each([
    ['Enter', 'Enter'],
    ['NumpadEnter', 'Enter'],
    ['Space', 'Space'],
    ['Tab', 'Tab'],
    ['Backspace', 'Backspace'],
    ['Delete', 'Delete'],
    ['Insert', 'Insert'],
    ['Home', 'Home'],
    ['End', 'End'],
    ['PageUp', 'PageUp'],
    ['PageDown', 'PageDown'],
    ['ArrowUp', 'Up'],
    ['ArrowDown', 'Down'],
    ['ArrowLeft', 'Left'],
    ['ArrowRight', 'Right'],
    ['Backquote', '`'],
    ['Minus', '-'],
    ['Equal', '='],
    ['BracketLeft', '['],
    ['BracketRight', ']'],
    ['Backslash', '\\'],
    ['Semicolon', ';'],
    ['Quote', "'"],
    ['Comma', ','],
    ['Period', '.'],
    ['Slash', '/'],
  ])('makes the %s key into %j', (code, key) => {
    const accelerator = acceleratorOf({ code, ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })!;
    expect(accelerator).toBe(`CommandOrControl+Alt+${key}`);
    expect(parseAccelerator(accelerator)).toEqual({ modifiers: ['CommandOrControl', 'Alt'], key });
  });

  it.each(['F25', 'Numpad1', 'NumpadAdd', 'IntlRo', 'MetaLeft', 'AltRight', 'CapsLock', 'Escape', 'PrintScreen', ''])(
    'makes nothing of the %s key',
    (code) => {
      expect(acceleratorOf({ code, ctrlKey: true, altKey: true, shiftKey: true, metaKey: false })).toBeNull();
    },
  );
});

describe('which keys can stand, every action against a spread of keys (3.13)', () => {
  const candidates = [
    ...letters
      .slice(0, 6)
      .flatMap((l) => [`CommandOrControl+${l}`, `CommandOrControl+Shift+${l}`, `Alt+${l}`, `Shift+${l}`]),
    ...['F1', 'F4', 'F12'].flatMap((f) => [f, `CommandOrControl+${f}`, `Alt+${f}`, `Super+${f}`]),
    'CommandOrControl+Enter',
    'Alt+Tab',
    'Alt+Space',
    'CommandOrControl+Shift+Left',
    'CommandOrControl+Alt+Super+Shift+Z',
    'Alt+Shift+/',
    'CommandOrControl+/',
  ];
  const keys = effectiveHotkeys();

  it.each(hotkeyActions)('holds every rule for %s', (action) => {
    for (const accelerator of candidates) {
      const problem = hotkeyProblem(action, accelerator, keys);
      if (problem !== null) continue;
      const parsed = parseAccelerator(accelerator)!;
      expect(parsed, accelerator).not.toBeNull();
      expect(
        parsed.modifiers.some((m) => m === 'CommandOrControl' || m === 'Alt'),
        accelerator,
      ).toBe(true);
      if (/^[A-Z0-9`\-=[\]\\;',./]$/.test(parsed.key))
        expect(parsed.modifiers.length, accelerator).toBeGreaterThanOrEqual(2);
      expect(['Alt+F4', 'Alt+Tab', 'Alt+Space'], accelerator).not.toContain(accelerator);
      expect(
        hotkeyActions.filter((a) => a !== action && keys[a] === accelerator),
        accelerator,
      ).toEqual([]);
    }
  });

  it('takes a whole set changed at once, every action on keys of its own', () => {
    const changed = Object.fromEntries(hotkeyActions.map((a, i) => [a, `CommandOrControl+Alt+F${i + 1}`])) as Record<
      HotkeyAction,
      string
    >;
    expect(hotkeyProblems(effectiveHotkeys(changed))).toEqual({});
    expect(settingsPatchSchema.safeParse({ hotkeys: changed }).success).toBe(true);
  });

  it('refuses a whole set where any two clash', () => {
    const changed = {
      ...Object.fromEntries(hotkeyActions.map((a, i) => [a, `CommandOrControl+Alt+F${i + 1}`])),
      hide: 'CommandOrControl+Alt+F1',
    };
    expect(Object.keys(hotkeyProblems(effectiveHotkeys(changed)))).toEqual(['trigger', 'hide']);
    expect(settingsPatchSchema.safeParse({ hotkeys: changed }).success).toBe(false);
  });

  it('takes every default as it is, whatever the rules for a change', () => {
    for (const action of hotkeyActions) {
      expect(hotkeyProblem(action, sessionHotkeys[action], keys), action).toBeNull();
    }
  });
});

describe('the addresses app:// serves, widened (4.1)', () => {
  const root = normalize('C:/Sotto/resources/app.asar/out/renderer');

  it.each<[string, string | null]>([
    ['app://sotto/overlay/index.html', 'overlay/index.html'],
    ['app://sotto//overlay//index.html', 'overlay/index.html'],
    ['app://sotto/assets/%C3%A9t%C3%A9.js', 'assets/été.js'],
    ['app://sotto/assets/a%2Fb.js', 'assets/a/b.js'],
    ['app://sotto/./overlay/./index.html', 'overlay/index.html'],
    ['app://sotto/a/b/c/d/e/f/g/h.js', 'a/b/c/d/e/f/g/h.js'],
    ['app://sotto:8080/overlay/index.html', null],
    ['app://sotto.evil/overlay/index.html', null],
    ['app://evil.sotto/overlay/index.html', null],
    ['app://sotto/.', null],
    ['app://sotto', null],
    ['app:sotto/overlay/index.html', null],
    ['APP://sotto/overlay/index.html', 'overlay/index.html'],
  ])('serves %s as %s', (url, file) => {
    expect(fileOf(url, root)).toBe(file === null ? null : join(root, file));
  });

  it('never serves a file outside the built pages, however the address climbs', () => {
    const climbs = ['..', '%2e%2e', '%2E%2E', '.%2e', '%2e.', '..%2f..', '..%5c..'];
    for (const climb of climbs) {
      for (const url of [
        `app://sotto/${climb}/x`,
        `app://sotto/overlay/${climb}/${climb}/x`,
        `app://sotto/${climb}/${climb}/${climb}/x`,
      ]) {
        const file = fileOf(url, root);
        if (file !== null) expect(file.startsWith(root + '\\') || file.startsWith(root + '/'), url).toBe(true);
      }
    }
  });
});
