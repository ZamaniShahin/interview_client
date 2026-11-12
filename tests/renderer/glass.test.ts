// @vitest-environment happy-dom
// The glass in the pages (Shahin, 2026-11-12): each window paints its background at the opacity chosen for it, over
// what main said is behind it, the overlay's clear glass or the app window's frosted one; the slider that chooses it;
// and Settings, with the app window frosted and without.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { initialAppState } from '../../src/shared/app-state';
import type { Glass } from '../../src/shared/glass';
import { defaultSettings, minOpacity, type Settings } from '../../src/shared/settings';
import SettingsPage from '../../src/renderer/app/pages/SettingsPage.vue';
import SSlider from '../../src/renderer/shared/components/SSlider.vue';
import { applyToDocument, windowGlass, windowKindOf } from '../../src/renderer/shared/use-settings';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const html = document.documentElement;
const alpha = (root: HTMLElement = html) => root.style.getPropertyValue('--window-alpha-chosen');
const classes = () => [...html.classList].sort();
const steps = Array.from({ length: (100 - minOpacity) / 5 + 1 }, (_, i) => minOpacity + i * 5);

function resetDocument(): void {
  html.className = '';
  html.removeAttribute('style');
  history.replaceState(null, '', '/');
}

beforeEach(resetDocument);
afterEach(resetDocument);

describe('which window a page is in, and the glass behind it', () => {
  it.each<[string, 'overlay' | 'app']>([
    ['/overlay/index.html', 'overlay'],
    ['/app/index.html', 'app'],
    ['/', 'app'],
    ['/documents/index.html', 'app'],
  ])('%s is in the %s window', (pathname, kind) => {
    expect(windowKindOf({ pathname })).toBe(kind);
  });

  it.each<[string, Glass | null]>([
    ['?glass=clear', 'clear'],
    ['?glass=frosted', 'frosted'],
    ['?x=2&glass=frosted', 'frosted'],
    ['', null],
    ['?glass=1', null],
    ['?glass=true', null],
    ['?glass=', null],
    ['#glass=clear', null],
  ])('the address %j has %s glass', (search, glass) => {
    expect(windowGlass({ search })).toBe(glass);
  });

  it("reads this page's own address when given none", () => {
    history.replaceState(null, '', '/overlay/index.html?glass=clear#hiding-test');
    expect(windowKindOf()).toBe('overlay');
    expect(windowGlass()).toBe('clear');
    history.replaceState(null, '', '/app/index.html?glass=frosted');
    expect(windowKindOf()).toBe('app');
    expect(windowGlass()).toBe('frosted');
    history.replaceState(null, '', '/app/index.html');
    expect(windowGlass()).toBeNull();
  });
});

describe('the settings applied to a page', () => {
  const settings = (over: Partial<Settings> = {}): Settings => ({ ...defaultSettings, ...over });

  it("paints the overlay at the overlay's opacity and the app window at its own", () => {
    applyToDocument(settings({ overlayOpacity: 40, appOpacity: 90 }), html, 'overlay', 'clear');
    expect(alpha()).toBe('0.4');
    applyToDocument(settings({ overlayOpacity: 40, appOpacity: 90 }), html, 'app', 'frosted');
    expect(alpha()).toBe('0.9');
  });

  it.each(steps)('gives %i%% as its fraction, for either window', (percent) => {
    applyToDocument(settings({ overlayOpacity: percent, appOpacity: percent }), html, 'overlay', 'clear');
    expect(Number(alpha())).toBeCloseTo(percent / 100, 10);
    applyToDocument(settings({ overlayOpacity: percent, appOpacity: percent }), html, 'app', 'frosted');
    expect(Number(alpha())).toBeCloseTo(percent / 100, 10);
  });

  it.each<[Glass | null, string[]]>([
    ['clear', ['glass', 'theme-dark']],
    ['frosted', ['frosted', 'glass', 'theme-dark']],
    [null, ['theme-dark']],
  ])('marks the page for %s glass as main said, and only so', (glass, marks) => {
    applyToDocument(settings(), html, 'overlay', glass);
    expect(classes()).toEqual(marks);
  });

  it('unmarks the glass when told there is none any more', () => {
    applyToDocument(settings(), html, 'app', 'frosted');
    applyToDocument(settings(), html, 'app', null);
    expect(classes()).toEqual(['theme-dark']);
  });

  it("keeps the theme and the answer's size beside the glass", () => {
    applyToDocument(settings({ theme: 'light', textSize: 'L' }), html, 'overlay', 'clear');
    expect(classes()).toEqual(['glass', 'text-l', 'theme-light']);
    applyToDocument(settings({ theme: 'dark', textSize: 'S' }), html, 'app', 'frosted');
    expect(classes()).toEqual(['frosted', 'glass', 'text-s', 'theme-dark']);
    applyToDocument(settings({ textSize: 'M' }), html, 'app', null);
    expect(classes()).toEqual(['theme-dark']);
  });

  it('follows a change at once: the last opacity is the one painted', () => {
    for (const percent of [75, 30, 100, 55])
      applyToDocument(settings({ overlayOpacity: percent }), html, 'overlay', 'clear');
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

  it('with this window frosted, gives each window its own background, at the opacity kept', async () => {
    const { wrapper, sliders, labels } = await settingsPage('/app/index.html?glass=frosted', {
      overlayOpacity: 55,
      appOpacity: 90,
    });
    expect(labels).toEqual(['Overlay background', 'Window background']);
    expect(sliders.map((s) => (s.element as HTMLInputElement).value)).toEqual(['55', '90']);
    expect(sliders.map((s) => s.attributes('min'))).toEqual(['30', '30']);
    expect(wrapper.text()).toContain('The overlay keeps it sharp, so you can read it; this window blurs it.');
    // This page is the app window's: it is painted at the app window's opacity, over the frosted glass.
    expect(classes()).toEqual(['frosted', 'glass', 'theme-dark']);
    expect(alpha()).toBe('0.9');
  });

  it('changes only the window whose slider moved', async () => {
    const { setSettings, sliders } = await settingsPage('/app/index.html?glass=frosted');
    await sliders[1]!.setValue('65');
    await sliders[0]!.setValue('40');
    expect(setSettings.mock.calls.map(([patch]) => patch)).toEqual([{ appOpacity: 65 }, { overlayOpacity: 40 }]);
  });

  it("without Windows' acrylic, still sets the overlay's background, this window staying solid", async () => {
    const { wrapper, sliders, labels, setSettings } = await settingsPage('/app/index.html', { overlayOpacity: 60 });
    expect(labels).toEqual(['Overlay background']);
    expect((sliders[0]!.element as HTMLInputElement).value).toBe('60');
    expect(wrapper.text()).toContain(
      'How much of what is behind the overlay shows through, sharp, so you can read it.',
    );
    expect(wrapper.text()).not.toContain('Window background');
    expect(classes()).toEqual(['theme-dark']);
    await sliders[0]!.setValue('35');
    expect(setSettings).toHaveBeenCalledWith({ overlayOpacity: 35 });
  });

  it('says either way that the text stays solid and the overlay is out of shares', async () => {
    for (const address of ['/app/index.html?glass=frosted', '/app/index.html']) {
      const { wrapper } = await settingsPage(address);
      expect(wrapper.text()).toContain('The text stays solid.');
      expect(wrapper.text()).toContain('The overlay is left out of shares whatever you choose.');
    }
  });
});
