// The session's global hotkeys: one list, which main registers while a session runs (main/session/hotkeys.ts) and the
// first run's step 5 shows (F1 · 5a). Ctrl+Enter is settled (the trigger); the others are the UI canvas's proposal,
// since v1's set wasn't at hand (the design handoff's §14; the open question C1). Each can be changed in Settings
// (3.13): a change is kept with the settings, and the defaults stay these.
import { z } from 'zod';

export const sessionHotkeys = {
  trigger: 'CommandOrControl+Enter',
  focus: 'CommandOrControl+Shift+Space',
  toggleAuto: 'CommandOrControl+Shift+A',
  togglePause: 'CommandOrControl+Shift+P',
  previous: 'CommandOrControl+Shift+Left',
  next: 'CommandOrControl+Shift+Right',
  compact: 'CommandOrControl+Shift+M',
  hide: 'CommandOrControl+Shift+H',
  // v1's screenshot key (3.6); pressed again while the selector shows, it takes the whole display.
  capture: 'CommandOrControl+Shift+G',
} as const;

export type HotkeyAction = keyof typeof sessionHotkeys;

export const hotkeyActions = Object.keys(sessionHotkeys) as HotkeyAction[];

/** Every action's keys: the defaults, with the user's changes over them. */
export type Hotkeys = Record<HotkeyAction, string>;

/** The canvas's rows: what each key does, and its keys as the step draws them (Earlier and later share a row). */
export const hotkeyRows: { label: string; actions: HotkeyAction[] }[] = [
  { label: 'Answer now', actions: ['trigger'] },
  { label: 'Type in the overlay', actions: ['focus'] },
  { label: 'AUTO or MANUAL', actions: ['toggleAuto'] },
  { label: 'Pause or resume', actions: ['togglePause'] },
  { label: 'Earlier or later answer', actions: ['previous', 'next'] },
  { label: 'Compact or full view', actions: ['compact'] },
  { label: 'Hide or show the overlay', actions: ['hide'] },
  { label: 'Screenshot of an area', actions: ['capture'] },
];

/** Each action alone, as Settings lists them to change one at a time. */
export const hotkeyLabels: Record<HotkeyAction, string> = {
  trigger: 'Answer now',
  focus: 'Type in the overlay',
  toggleAuto: 'AUTO or MANUAL',
  togglePause: 'Pause or resume',
  previous: 'Earlier answer',
  next: 'Later answer',
  compact: 'Compact or full view',
  hide: 'Hide or show the overlay',
  capture: 'Screenshot of an area',
};

const modifierOrder = ['CommandOrControl', 'Alt', 'Shift', 'Super'] as const;
type Modifier = (typeof modifierOrder)[number];

/** The keys a hotkey may end with: letters, digits, F1–F24, the arrows and a few named keys (Electron's names). */
const namedKeys: readonly string[] = [
  'Enter',
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right',
];
const signs: readonly string[] = ['`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'];
const isLetterOrDigit = (key: string) => /^[A-Z0-9]$/.test(key);
const isFunctionKey = (key: string) => /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
const isKey = (key: string) =>
  isLetterOrDigit(key) || isFunctionKey(key) || namedKeys.includes(key) || signs.includes(key);

/** An accelerator split into its modifiers, in order, and its key; null for one that isn't one. */
export function parseAccelerator(accelerator: string): { modifiers: Modifier[]; key: string } | null {
  const parts = accelerator.split('+');
  // "Ctrl+Shift++" would split into an empty key: the plus key isn't offered.
  if (parts.some((part) => part === '')) return null;
  const key = parts.pop()!;
  if (!isKey(key)) return null;
  const modifiers: Modifier[] = [];
  for (const part of parts) {
    if (!(modifierOrder as readonly string[]).includes(part) || modifiers.includes(part as Modifier)) return null;
    modifiers.push(part as Modifier);
  }
  const ordered = modifierOrder.filter((m) => modifiers.includes(m));
  if (ordered.join('+') !== modifiers.join('+')) return null;
  return { modifiers, key };
}

/** A user's changes, as kept and sent: real accelerators only, for known actions. */
export const hotkeyOverridesSchema = z
  .partialRecord(z.enum(hotkeyActions as [HotkeyAction, ...HotkeyAction[]]), z.string().max(64))
  .refine((overrides) => Object.values(overrides).every((a) => typeof a === 'string' && parseAccelerator(a) !== null));
export type HotkeyOverrides = Partial<Record<HotkeyAction, string>>;

/** The keys in effect: the defaults with the user's changes over them. */
export function effectiveHotkeys(overrides: HotkeyOverrides = {}): Hotkeys {
  const keys = { ...sessionHotkeys } as Hotkeys;
  for (const action of hotkeyActions) {
    const chosen = overrides[action];
    if (chosen && parseAccelerator(chosen)) keys[action] = chosen;
  }
  return keys;
}

/** Keys the system keeps, which a session must never take. */
const reserved = new Set([
  'Alt+F4',
  'Alt+Tab',
  'Alt+Space',
  'CommandOrControl+Alt+Delete',
  'CommandOrControl+Shift+Escape',
  'Super+L',
  'Super+D',
  'Super+Tab',
]);

/**
 * Why `accelerator` can't be `action`'s key, in the Settings page's words; null when it can. It needs Ctrl or Alt, and
 * with a letter, a digit or a sign a second modifier too, so the call app keeps its own shortcuts (Ctrl+C, Ctrl+V…)
 * during a session; and no other action may have it.
 */
export function hotkeyProblem(action: HotkeyAction, accelerator: string, keys: Hotkeys): string | null {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return 'Press a key with Ctrl or Alt.';
  const { modifiers, key } = parsed;
  if (!modifiers.includes('CommandOrControl') && !modifiers.includes('Alt')) return 'Add Ctrl or Alt.';
  if ((isLetterOrDigit(key) || signs.includes(key)) && modifiers.length < 2) {
    return 'Add Shift or Alt: other apps use Ctrl with a letter for their own keys.';
  }
  if (reserved.has(accelerator)) return 'Windows keeps that one for itself.';
  const other = hotkeyActions.find((a) => a !== action && keys[a] === accelerator);
  if (other) return `“${hotkeyLabels[other]}” has that one.`;
  return null;
}

/** Every changed action whose keys can't stand, with why; empty when all can. The defaults stand as they are. */
export function hotkeyProblems(keys: Hotkeys): Partial<Record<HotkeyAction, string>> {
  const problems: Partial<Record<HotkeyAction, string>> = {};
  for (const action of hotkeyActions) {
    // Ctrl+Enter has one modifier, and that is settled: a default is never a problem of its own, only a clash.
    const problem =
      keys[action] === sessionHotkeys[action] ? clash(action, keys) : hotkeyProblem(action, keys[action], keys);
    if (problem) problems[action] = problem;
  }
  return problems;
}

function clash(action: HotkeyAction, keys: Hotkeys): string | null {
  const other = hotkeyActions.find((a) => a !== action && keys[a] === keys[action]);
  return other ? `“${hotkeyLabels[other]}” has that one.` : null;
}

/** What a key press makes, as an accelerator; null while only modifiers are held, or for a key not offered. */
export function acceleratorOf(press: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const key = keyOfCode(press.code);
  if (!key) return null;
  const modifiers = [
    press.ctrlKey ? 'CommandOrControl' : null,
    press.altKey ? 'Alt' : null,
    press.shiftKey ? 'Shift' : null,
    press.metaKey ? 'Super' : null,
  ].filter((m): m is string => m !== null);
  return [...modifiers, key].join('+');
}

const codeKeys: Record<string, string> = {
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** A physical key (`KeyboardEvent.code`) as Electron names it: the same key whatever the keyboard's layout. */
function keyOfCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (isFunctionKey(code)) return code;
  return codeKeys[code] ?? null;
}

const keyNames: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  Super: 'Win',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

const capOf = (part: string) => keyNames[part] ?? part;

/** One accelerator as key caps ("Ctrl", "Shift", "G"). */
export function capsOf(accelerator: string): string[] {
  return accelerator.split('+').map(capOf);
}

/** One action's keys as text, for a sentence ("Ctrl+Shift+G"). */
export function hotkeyText(action: HotkeyAction, keys: Hotkeys = sessionHotkeys): string {
  return capsOf(keys[action]).join('+');
}

/**
 * A row's key caps: shared modifiers once, then each action's own key ("Ctrl", "Shift", "←", "→"). Actions whose
 * modifiers differ (one was changed) show each in full.
 */
export function keysOf(actions: HotkeyAction[], keys: Hotkeys = sessionHotkeys): string[] {
  const parts = actions.map((action) => keys[action].split('+'));
  const modifiers = parts[0]!.slice(0, -1);
  const shared = parts.every((p) => p.slice(0, -1).join('+') === modifiers.join('+'));
  if (!shared) return parts.flatMap((p) => p.map(capOf));
  return [...modifiers, ...parts.map((p) => p.at(-1)!)].map(capOf);
}
