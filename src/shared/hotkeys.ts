// The session's global hotkeys: one list, which main registers while a session runs (main/session/hotkeys.ts) and the
// first run's step 5 shows (F1 · 5a). Ctrl+Enter is settled (the trigger); the others are the UI canvas's proposal,
// since v1's set wasn't at hand (the design handoff's §14; the open question C1). Remappable later, in Settings.
export const sessionHotkeys = {
  trigger: 'CommandOrControl+Enter',
  focus: 'CommandOrControl+Shift+Space',
  toggleAuto: 'CommandOrControl+Shift+A',
  togglePause: 'CommandOrControl+Shift+P',
  previous: 'CommandOrControl+Shift+Left',
  next: 'CommandOrControl+Shift+Right',
  compact: 'CommandOrControl+Shift+M',
  hide: 'CommandOrControl+Shift+H',
} as const;

export type HotkeyAction = keyof typeof sessionHotkeys;

/** The canvas's rows: what each key does, and its keys as the step draws them (Earlier and later share a row). */
export const hotkeyRows: { label: string; actions: HotkeyAction[] }[] = [
  { label: 'Answer now', actions: ['trigger'] },
  { label: 'Type in the overlay', actions: ['focus'] },
  { label: 'AUTO or MANUAL', actions: ['toggleAuto'] },
  { label: 'Pause or resume', actions: ['togglePause'] },
  { label: 'Earlier or later answer', actions: ['previous', 'next'] },
  { label: 'Compact or full view', actions: ['compact'] },
  { label: 'Hide or show the overlay', actions: ['hide'] },
];

const keyNames: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  Shift: 'Shift',
  Enter: 'Enter',
  Space: 'Space',
  Left: '←',
  Right: '→',
};

/** A row's key caps: shared modifiers once, then each action's own key ("Ctrl", "Shift", "←", "→"). */
export function keysOf(actions: HotkeyAction[]): string[] {
  const parts = actions.map((action) => sessionHotkeys[action].split('+'));
  const modifiers = parts[0]!.slice(0, -1);
  return [...modifiers, ...parts.map((p) => p.at(-1)!)].map((part) => keyNames[part] ?? part);
}
