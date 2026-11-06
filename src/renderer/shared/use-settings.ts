import { onBeforeUnmount, ref } from 'vue';
import { defaultSettings, type Settings, type SettingsPatch } from '../../shared/settings';
import type { SettingsApi } from '../../preload/api';

/** Applies the theme and the answer size to <html>, where the tokens read them. */
export function applyToDocument(settings: Settings, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('theme-light', settings.theme === 'light');
  root.classList.toggle('theme-dark', settings.theme === 'dark');
  root.classList.toggle('text-s', settings.textSize === 'S');
  root.classList.toggle('text-l', settings.textSize === 'L');
}

/** The settings, kept current: main owns them and says when they change. */
export function useSettings(api: SettingsApi) {
  const settings = ref<Settings>({ ...defaultSettings });
  applyToDocument(settings.value);

  void api.getSettings().then((loaded) => {
    settings.value = loaded;
    applyToDocument(loaded);
  });
  const stop = api.onSettings((changed) => {
    settings.value = changed;
    applyToDocument(changed);
  });
  onBeforeUnmount(stop);

  async function update(patch: SettingsPatch): Promise<void> {
    settings.value = await api.setSettings(patch);
  }

  return { settings, update };
}
