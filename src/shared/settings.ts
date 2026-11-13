// The user's settings. Main owns them and tells every window when they change; the local database keeps them (1.14,
// local-store.ts), each field on its own, so one a newer app wrote that this one can't read keeps its default.
import { z } from 'zod';
import { effectiveHotkeys, hotkeyOverridesSchema, hotkeyProblems } from './hotkeys';

/** The least a background may be: below it, text over a busy screen stops being readable. */
export const minOpacity = 30;

/** A background opacity: 30 to 100 percent, in steps of 5. */
export const opacityPercent = z.number().int().min(minOpacity).max(100).multipleOf(5);

export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light']),
  /** The answer's text size: 15, 16 or 18 px. */
  textSize: z.enum(['S', 'M', 'L']),
  /**
   * How opaque each window's background is, in percent (Shahin, 2026-11-12), so the user sees what is behind Sotto;
   * the text stays solid (shared/glass.ts). Behind the overlay, what is on screen shows sharp, to be read through, on
   * every Windows; behind the app window, Windows 11 blurs it (its acrylic), and where it draws none (Windows 10) the
   * app window stays solid. The overlay is out of captures at any opacity.
   */
  overlayOpacity: opacityPercent,
  appOpacity: opacityPercent,
  // No "tray only": during a session Sotto has neither a taskbar button nor a tray icon (Q16), so nothing to choose.
  startCompact: z.boolean(),
  keepTranscripts: z.boolean(),
  keepRecordings: z.boolean(),
  /**
   * The interview's type the user last chose (Q47, v1 0.4.0's TECH / INTRO switch in the overlay's strip): sent as a
   * session starts, kept for the next one, as v1 kept it across a restart and a new interview.
   */
  interviewType: z.enum(['technical', 'intro']),
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
  overlayOpacity: 75,
  appOpacity: 80,
  startCompact: false,
  keepTranscripts: false,
  keepRecordings: false,
  interviewType: 'technical',
  hotkeys: {},
};
