// @vitest-environment happy-dom
// The overlay's gap filler line (backend Q47): the server's text shown as text, never as HTML; gone when its text goes;
// never left up past 30 s if its answer never comes; and its switch in Settings.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { initialAppState } from '../../src/shared/app-state';
import { defaultSettings, type Settings } from '../../src/shared/settings';
import SettingsPage from '../../src/renderer/app/pages/SettingsPage.vue';
import GapFillerLine from '../../src/renderer/overlay/components/GapFillerLine.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const shown = (wrapper: ReturnType<typeof mount>) => wrapper.find('.filler').exists();

describe("the overlay's gap filler line", () => {
  it('shows the server text as text, under its label', () => {
    const wrapper = mount(GapFillerLine, { props: { text: 'Hmm.... let me <b>think</b> of a good example here....' } });

    expect(wrapper.find('.label').text()).toBe('Say while it loads');
    expect(wrapper.find('.text').text()).toBe('Hmm.... let me <b>think</b> of a good example here....');
    expect(wrapper.find('.text b').exists()).toBe(false);
    expect(wrapper.find('.filler').attributes('aria-live')).toBe('polite');
  });

  it.each([null, ''])('shows nothing for %j', (text) => {
    expect(shown(mount(GapFillerLine, { props: { text } }))).toBe(false);
  });

  it('goes when its text goes, and comes back with a new one', async () => {
    const wrapper = mount(GapFillerLine, { props: { text: 'Okay.... let me think....' } });

    await wrapper.setProps({ text: null });
    expect(shown(wrapper)).toBe(false);
    await wrapper.setProps({ text: 'Right.... give me a second....' });
    expect(wrapper.find('.text').text()).toBe('Right.... give me a second....');
  });

  it('goes on its own 30 s after it went up, and a new line starts its own 30 s', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(GapFillerLine, { props: { text: 'Okay.... let me think....' } });

      vi.advanceTimersByTime(29_999);
      await wrapper.vm.$nextTick();
      expect(shown(wrapper)).toBe(true);
      vi.advanceTimersByTime(1);
      await wrapper.vm.$nextTick();
      expect(shown(wrapper)).toBe(false);

      await wrapper.setProps({ text: 'Right.... give me a second....' });
      expect(shown(wrapper)).toBe(true);
      vi.advanceTimersByTime(20_000);
      await wrapper.setProps({ text: 'Mm.... let me pick a good one....' });
      vi.advanceTimersByTime(20_000);
      await wrapper.vm.$nextTick();
      expect(shown(wrapper)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the gap fillers switch in Settings', () => {
  async function settingsPage(kept: Partial<Settings> = {}) {
    let current: Settings = { ...defaultSettings, ...kept };
    const setSettings = vi.fn<AppApi['setSettings']>(async (patch) => (current = { ...current, ...patch }));
    const { api } = fakeAppApi(initialAppState, { getSettings: vi.fn(async () => current), setSettings });
    window.appApi = api;
    const wrapper = mount(SettingsPage);
    await flushPromises();
    const toggle = wrapper.findAll('[role="switch"]').find((s) => s.text().includes('Gap fillers'))!;
    return { wrapper, setSettings, toggle };
  }

  it.each([true, false])('shows the setting kept (%s) and switches it', async (on) => {
    const { toggle, setSettings, wrapper } = await settingsPage({ gapFillers: on });

    expect(toggle.attributes('aria-checked')).toBe(String(on));
    await toggle.trigger('click');
    expect(setSettings.mock.calls.map(([patch]) => patch)).toEqual([{ gapFillers: !on }]);
    expect(wrapper.text()).toContain('A line to say while an answer loads');
  });
});
