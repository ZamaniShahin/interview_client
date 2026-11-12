// @vitest-environment happy-dom
// The glass in the pages (Shahin, 2026-11-12): each window paints its background at the opacity chosen for it, and
// only where main said Windows draws the glass behind it; the slider that chooses it; and Settings, with and without.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { initialAppState } from '../../src/shared/app-state';
import { defaultSettings, minOpacity, type Settings } from '../../src/shared/settings';
import SettingsPage from '../../src/renderer/app/pages/SettingsPage.vue';
import SSlider from '../../src/renderer/shared/components/SSlider.vue';
import { applyToDocument, hasGlass, windowKindOf } from '../../src/renderer/shared/use-settings';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const html = document.documentElement;
const alpha = (root: HTMLElement = html) => root.style.getPropertyValue('--window-alpha-chosen');
const steps = Array.from({ length: (100 - minOpacity) / 5 + 1 }, (_, i) => minOpacity + i * 5);

function resetDocument(): void {
  html.className = '';
  html.removeAttribute('style');
  history.replaceState(null, '', '/');
}

beforeEach(resetDocument);
afterEach(resetDocument);

describe('which window a page is in, and whether it has the glass', () => {
  it.each<[string, 'overlay' | 'app']>([
    ['/overlay/index.html', 'overlay'],
    ['/app/index.html', 'app'],
    ['/', 'app'],
    ['/documents/index.html', 'app'],
  ])('%s is in the %s window', (pathname, kind) => {
    expect(windowKindOf({ pathname })).toBe(kind);
  });

  it.each<[string, boolean]>([
    ['?glass=1', true],
    ['?x=2&glass=1', true],
    ['', false],
    ['?glass=0', false],
    ['?glass=true', false],
    ['?glass=', false],
    ['?glass', false],
    ['?Glass=1', false],
    ['#glass=1', false],
  ])('the address %j has the glass: %s', (search, glass) => {
    expect(hasGlass({ search })).toBe(glass);
  });

  it("reads this page's own address when given none", () => {
    history.replaceState(null, '', '/overlay/index.html?glass=1#hiding-test');
    expect(windowKindOf()).toBe('overlay');
    expect(hasGlass()).toBe(true);
    history.replaceState(null, '', '/app/index.html');
    expect(windowKindOf()).toBe('app');
    expect(hasGlass()).toBe(false);
  });
});

describe('the settings applied to a page', () => {
  const settings = (over: Partial<Settings> = {}): Settings => ({ ...defaultSettings, ...over });

  it("paints the overlay at the overlay's opacity and the app window at its own", () => {
    applyToDocument(settings({ overlayOpacity: 40, appOpacity: 90 }), html, 'overlay', true);
    expect(alpha()).toBe('0.4');
    applyToDocument(settings({ overlayOpacity: 40, appOpacity: 90 }), html, 'app', true);
    expect(alpha()).toBe('0.9');
  });

  it.each(steps)('gives %i%% as its fraction, for either window', (percent) => {
    applyToDocument(settings({ overlayOpacity: percent, appOpacity: percent }), html, 'overlay', true);
    expect(Number(alpha())).toBeCloseTo(percent / 100, 10);
    applyToDocument(settings({ overlayOpacity: percent, appOpacity: percent }), html, 'app', true);
    expect(Number(alpha())).toBeCloseTo(percent / 100, 10);
  });

  it('marks the page glassy only when main said so, and unmarks it', () => {
    applyToDocument(settings(), html, 'app', true);
    expect(html.classList.contains('glass')).toBe(true);
    applyToDocument(settings(), html, 'app', false);
    expect(html.classList.contains('glass')).toBe(false);
  });

  it("keeps the theme and the answer's size beside the glass", () => {
    applyToDocument(settings({ theme: 'light', textSize: 'L' }), html, 'overlay', true);
    expect([...html.classList].sort()).toEqual(['glass', 'text-l', 'theme-light']);
    applyToDocument(settings({ theme: 'dark', textSize: 'S' }), html, 'overlay', false);
    expect([...html.classList].sort()).toEqual(['text-s', 'theme-dark']);
    applyToDocument(settings({ textSize: 'M' }), html, 'overlay', false);
    expect([...html.classList].sort()).toEqual(['theme-dark']);
  });

  it('follows a change at once: the last opacity is the one painted', () => {
    for (const percent of [75, 30, 100, 55]) applyToDocument(settings({ appOpacity: percent }), html, 'app', true);
    expect(alpha()).toBe('0.55');
  });
});

describe('the slider (SSlider)', () => {
  const slider = (props: Partial<InstanceType<typeof SSlider>['$props']> = {}) =>
    mount(SSlider, {
      props: { modelValue: 75, min: 30, max: 100, step: 5, label: 'Overlay background', unit: '%', ...props },
    });

  it('is the browser’s own range input, named, its value said in words and beside it', () => {
    const wrapper = slider();
    const input = wrapper.find('input');
    expect(input.attributes()).toMatchObject({
      type: 'range',
      min: '30',
      max: '100',
      step: '5',
      'aria-label': 'Overlay background',
      'aria-valuetext': '75%',
    });
    expect((input.element as HTMLInputElement).value).toBe('75');
    expect(wrapper.find('.value').text()).toBe('75%');
    // The number beside it is for the eye; a screen reader hears the input's own value text.
    expect(wrapper.find('.value').attributes('aria-hidden')).toBe('true');
  });

  it('gives each value moved to as a number', async () => {
    const wrapper = slider();
    for (const value of ['60', '30', '100']) await wrapper.find('input').setValue(value);
    expect(wrapper.emitted('update:modelValue')).toEqual([[60], [30], [100]]);
  });

  it.each<[number, string]>([
    [30, '0%'],
    [65, '50%'],
    [100, '100%'],
  ])('fills the track up to %i', (modelValue, fill) => {
    expect(slider({ modelValue }).find('input').attributes('style')).toContain(`--fill: ${fill}`);
  });

  it('says a new value once its owner has it', async () => {
    const wrapper = slider();
    await wrapper.setProps({ modelValue: 40 });
    expect(wrapper.find('input').attributes('aria-valuetext')).toBe('40%');
    expect(wrapper.find('.value').text()).toBe('40%');
  });

  it('says a value with no unit as the number alone', () => {
    const wrapper = slider({ unit: undefined, modelValue: 3, min: 1, max: 5, step: 1, label: 'Steps' });
    expect(wrapper.find('input').attributes('aria-valuetext')).toBe('3');
    expect(wrapper.find('.value').text()).toBe('3');
  });

  it('can be off, and looks it', () => {
    const wrapper = slider({ disabled: true });
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
    expect(wrapper.classes()).toContain('disabled');
  });
});

describe('the background settings in Settings', () => {
  async function settingsPage(address: string, kept: Partial<Settings> = {}) {
    history.replaceState(null, '', address);
    let current: Settings = { ...defaultSettings, ...kept };
    const setSettings = vi.fn<AppApi['setSettings']>(async (patch) => (current = { ...current, ...patch }));
    const { api } = fakeAppApi(initialAppState, { getSettings: vi.fn(async () => current), setSettings });
    window.appApi = api;
    const wrapper = mount(SettingsPage);
    await flushPromises();
    const sliders = wrapper.findAll('input[type="range"]');
    return { wrapper, setSettings, sliders, labels: sliders.map((s) => s.attributes('aria-label')) };
  }

  it('with the glass, gives each window its own background, at the opacity kept', async () => {
    const { wrapper, sliders, labels } = await settingsPage('/app/index.html?glass=1', {
      overlayOpacity: 55,
      appOpacity: 90,
    });
    expect(labels).toEqual(['Overlay background', 'Window background']);
    expect(sliders.map((s) => (s.element as HTMLInputElement).value)).toEqual(['55', '90']);
    expect(sliders.map((s) => s.attributes('min'))).toEqual(['30', '30']);
    expect(wrapper.text()).toContain('How much of the screen shows through, blurred, behind the text');
    // This page is the app window's: it is painted at the app window's opacity.
    expect(html.classList.contains('glass')).toBe(true);
    expect(alpha()).toBe('0.9');
  });

  it('changes only the window whose slider moved', async () => {
    const { setSettings, sliders } = await settingsPage('/app/index.html?glass=1');
    await sliders[1]!.setValue('65');
    await sliders[0]!.setValue('40');
    expect(setSettings.mock.calls.map(([patch]) => patch)).toEqual([{ appOpacity: 65 }, { overlayOpacity: 40 }]);
  });

  it('without the glass, has only the overlay fade, as a whole, and paints nothing see-through', async () => {
    const { wrapper, labels } = await settingsPage('/app/index.html', { appOpacity: 50 });
    expect(labels).toEqual(['Overlay opacity']);
    expect(wrapper.text()).toContain('Without Windows 11’s glass, the overlay fades as a whole.');
    expect(wrapper.text()).not.toContain('Window background');
    expect(html.classList.contains('glass')).toBe(false);
  });

  it('says either way that the opacity is for comfort only: the overlay is out of shares at any', async () => {
    for (const address of ['/app/index.html?glass=1', '/app/index.html']) {
      const { wrapper } = await settingsPage(address);
      expect(wrapper.text()).toMatch(/For your comfort only: (the overlay|it) is left out of shares either way\./);
    }
  });
});
