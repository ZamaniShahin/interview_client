// Global hotkeys, registered only while a session runs, so they never steal keys from other apps the rest of the time.
// Ctrl+Enter is settled (the trigger); the others are the UI canvas's proposal, since v1's set isn't at hand (the
// design handoff's §14). They become remappable in Settings (3.13).
import { globalShortcut } from 'electron';

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

/**
 * Registers every session hotkey; returns the accelerators another app already holds (shown in Settings later), and a
 * function that unregisters them all.
 */
export function registerSessionHotkeys(actions: Record<HotkeyAction, () => void>): {
  taken: string[];
  unregister: () => void;
} {
  const taken: string[] = [];
  const registered: string[] = [];
  for (const [action, accelerator] of Object.entries(sessionHotkeys) as [HotkeyAction, string][]) {
    if (globalShortcut.register(accelerator, actions[action])) registered.push(accelerator);
    else taken.push(accelerator);
  }
  return {
    taken,
    unregister: () => {
      for (const accelerator of registered) globalShortcut.unregister(accelerator);
    },
  };
}
