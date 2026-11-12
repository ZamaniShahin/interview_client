import { onBeforeUnmount, ref } from 'vue';
import { glassOf, type Glass } from '../../shared/glass';
import { defaultSettings, type Settings, type SettingsPatch } from '../../shared/settings';
import type { SettingsApi } from '../../preload/api';

/** Which window this page is: the overlay, or the app window (the selector and the hidden pages have no settings). */
export type WindowKind = 'overlay' | 'app';

/** The window this page is in, by its address (`…/overlay/index.html`). */
export function windowKindOf(location: { pathname: string } = window.location): WindowKind {
  return location.pathname.includes('/overlay/') ? 'overlay' : 'app';
}

/** The glass main gave this window (`?glass=clear` or `?glass=frosted`, shared/glass.ts), or none. */
export function windowGlass(location: { search: string } = window.location): Glass | null {
  return glassOf(location.search);
}

/**
 * Applies the theme, the answer size and the glass to <html>, where the tokens read them. With either glass, the
 * window's background is painted at the opacity chosen for this window (`--window-alpha-chosen`), the text staying
 * solid: through clear glass what is behind is sharp, through frosted glass (`frosted`) Windows blurs it. Without
 * glass, nothing is see-through.
 */
export function applyToDocument(
  settings: Settings,
  root: HTMLElement = document.documentElement,
  kind: WindowKind = windowKindOf(),
  glass: Glass | null = windowGlass(),
): void {
  root.classList.toggle('theme-light', settings.theme === 'light');
  root.classList.toggle('theme-dark', settings.theme === 'dark');
  root.classList.toggle('text-s', settings.textSize === 'S');
  root.classList.toggle('text-l', settings.textSize === 'L');
  root.classList.toggle('glass', glass !== null);
  root.classList.toggle('frosted', glass === 'frosted');
  const percent = kind === 'overlay' ? settings.overlayOpacity : settings.appOpacity;
  root.style.setProperty('--window-alpha-chosen', String(percent / 100));
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
