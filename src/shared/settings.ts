// The user's settings. Main owns them and tells every window when they change; the local database keeps them (1.14,
// local-store.ts), each field on its own, so one a newer app wrote that this one can't read keeps its default.
import { z } from 'zod';
import { effectiveHotkeys, hotkeyOverridesSchema, hotkeyProblems } from './hotkeys';

export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light']),
  /** The answer's text size: 15, 16 or 18 px. */
  textSize: z.enum(['S', 'M', 'L']),
  /** For comfort only: the overlay is left out of captures at any opacity. */
  opacity: z.union([z.literal(100), z.literal(90), z.literal(80)]),
  // No "tray only": during a session Sotto has neither a taskbar button nor a tray icon (Q16), so nothing to choose.
  startCompact: z.boolean(),
  keepTranscripts: z.boolean(),
  keepRecordings: z.boolean(),
  /** The hotkeys the user changed (3.13): only those, over the defaults. A set where two clash, or one can't stand, isn't one. */
  hotkeys: hotkeyOverridesSchema.refine(
    (changed) => Object.keys(hotkeyProblems(effectiveHotkeys(changed))).length === 0,
  ),
});

export type Settings = z.infer<typeof settingsSchema>;

/** A change from a window: some fields, nothing else. */
export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  theme: 'dark',
  textSize: 'M',
  opacity: 100,
  startCompact: false,
  keepTranscripts: false,
  keepRecordings: false,
  hotkeys: {},
};
