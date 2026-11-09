import { defaultSettings, type Settings, type SettingsPatch } from '../shared/settings';

/**
 * Main owns the settings and tells every window when they change. They start as the defaults; once the local
 * database is open (1.14), `restore` brings back what was kept, and every change after is kept too.
 */
export class SettingsStore {
  private settings: Settings = { ...defaultSettings };
  private keep: (settings: Settings) => void = () => {};

  constructor(private readonly changed: (settings: Settings) => void) {}

  get(): Settings {
    return this.settings;
  }

  /** What was kept, over the defaults (a field missing or unreadable keeps its default); then keeps each change. */
  restore(kept: Partial<Settings>, keep: (settings: Settings) => void): void {
    this.settings = { ...defaultSettings, ...kept };
    this.keep = keep;
    this.changed(this.settings);
  }

  /** The patch was checked against `settingsPatchSchema` by the IPC handler. */
  update(patch: SettingsPatch): Settings {
    this.settings = { ...this.settings, ...patch };
    this.keep(this.settings);
    this.changed(this.settings);
    return this.settings;
  }
}
