import { defaultSettings, type Settings, type SettingsPatch } from '../shared/settings';

/** Main owns the settings and tells every window when they change. Kept in memory until the local database (3.13). */
export class SettingsStore {
  private settings: Settings = { ...defaultSettings };

  constructor(private readonly changed: (settings: Settings) => void) {}

  get(): Settings {
    return this.settings;
  }

  /** The patch was checked against `settingsPatchSchema` by the IPC handler. */
  update(patch: SettingsPatch): Settings {
    this.settings = { ...this.settings, ...patch };
    this.changed(this.settings);
    return this.settings;
  }
}
