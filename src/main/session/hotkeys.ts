// Global hotkeys, registered only while a session runs, so they never steal keys from other apps the rest of the time.
// The list is shared (src/shared/hotkeys.ts): the first run's step 5 shows the same one, and Settings changes it (3.13).
import { globalShortcut } from 'electron';
import { sessionHotkeys, type HotkeyAction, type Hotkeys } from '../../shared/hotkeys';

export { sessionHotkeys, type HotkeyAction };

/**
 * Registers every session hotkey; returns the accelerators another app already holds (shown in Settings later), and a
 * function that unregisters them all.
 */
export function registerSessionHotkeys(
  actions: Record<HotkeyAction, () => void>,
  keys: Hotkeys = sessionHotkeys,
): {
  taken: string[];
  unregister: () => void;
} {
  const taken: string[] = [];
  const registered: string[] = [];
  for (const [action, accelerator] of Object.entries(keys) as [HotkeyAction, string][]) {
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
