// @vitest-environment happy-dom
// Hotkeys changed in Settings (3.13): pressed, checked, saved or put back; and the keys in effect named wherever the
// overlay or the setup names one.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialAppState } from '../../src/shared/app-state';
import { sessionHotkeys } from '../../src/shared/hotkeys';
import { defaultSettings } from '../../src/shared/settings';
import HotkeySettings from '../../src/renderer/app/components/HotkeySettings.vue';
import SetupHotkeys from '../../src/renderer/app/setup/SetupHotkeys.vue';
import AskBar from '../../src/renderer/overlay/components/AskBar.vue';
import AttachmentTray from '../../src/renderer/overlay/components/AttachmentTray.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const button = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label || b.attributes('aria-label') === label);

function keydown(code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...mods }));
}

const row = (wrapper: ReturnType<typeof mount>, name: string) =>
  wrapper.findAll('ul[aria-label="Hotkeys"] > li').find((li) => li.find('.name').text() === name)!;

describe('the hotkeys in Settings (3.13)', () => {
  it('lists every action with its keys, the screenshot key included', () => {
    const wrapper = mount(HotkeySettings, { props: { changed: {} } });
    const names = wrapper.findAll('.name').map((n) => n.text());
    expect(names).toEqual([
      'Answer now',
      'Type in the overlay',
      'AUTO or MANUAL',
      'Pause or resume',
      'Earlier answer',
      'Later answer',
      'Compact or full view',
      'Hide or show the overlay',
      'Screenshot of an area',
    ]);
    expect(row(wrapper, 'Screenshot of an area').text()).toContain('Ctrl');
    expect(button(wrapper, 'Put back every default')).toBeUndefined();
  });

  it('takes new keys as they are pressed, and saves them as a change', async () => {
    const wrapper = mount(HotkeySettings, { props: { changed: {} } });
    await button(wrapper, 'Change “Screenshot of an area”')!.trigger('click');
    expect(wrapper.text()).toContain('Press the new keys, with Ctrl or Alt.');
    keydown('ShiftLeft', { shiftKey: true });
    await flushPromises();
    expect(button(wrapper, 'Save')!.attributes('disabled')).toBeDefined();
    keydown('KeyS', { ctrlKey: true, altKey: true });
    await flushPromises();
    expect(wrapper.find('[role="group"]').text()).toContain('S');
    await button(wrapper, 'Save')!.trigger('click');
    expect(wrapper.emitted('save')).toEqual([[{ capture: 'CommandOrControl+Alt+S' }]]);
  });

  it.each<[string, Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>, string]>([
    ['KeyS', { ctrlKey: true }, 'Add Shift or Alt: other apps use Ctrl with a letter for their own keys.'],
    ['KeyS', { shiftKey: true }, 'Add Ctrl or Alt.'],
    ['KeyH', { ctrlKey: true, shiftKey: true }, '“Hide or show the overlay” has that one.'],
    ['F4', { altKey: true }, 'Windows keeps that one for itself.'],
  ])('says why %s with %j cannot be the key, and saves nothing', async (code, mods, problem) => {
    const wrapper = mount(HotkeySettings, { props: { changed: {} } });
    await button(wrapper, 'Change “Screenshot of an area”')!.trigger('click');
    keydown(code, mods);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe(problem);
    expect(button(wrapper, 'Save')!.attributes('disabled')).toBeDefined();
  });

  it('keeps the keys as they were on Esc or Cancel', async () => {
    const wrapper = mount(HotkeySettings, { props: { changed: {} } });
    await button(wrapper, 'Change “Answer now”')!.trigger('click');
    keydown('Escape');
    await flushPromises();
    expect(wrapper.find('[role="group"]').exists()).toBe(false);
    await button(wrapper, 'Change “Answer now”')!.trigger('click');
    await button(wrapper, 'Cancel')!.trigger('click');
    expect(wrapper.find('[role="group"]').exists()).toBe(false);
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('changes one at a time', async () => {
    const wrapper = mount(HotkeySettings, { props: { changed: {} } });
    await button(wrapper, 'Change “Answer now”')!.trigger('click');
    expect(button(wrapper, 'Change “Screenshot of an area”')!.attributes('disabled')).toBeDefined();
  });

  it('saves the default pressed again as no change at all', async () => {
    const wrapper = mount(HotkeySettings, { props: { changed: { capture: 'Alt+Shift+S', hide: 'Alt+Shift+H' } } });
    await button(wrapper, 'Change “Screenshot of an area”')!.trigger('click');
    keydown('KeyG', { ctrlKey: true, shiftKey: true });
    await flushPromises();
    await button(wrapper, 'Save')!.trigger('click');
    expect(wrapper.emitted('save')).toEqual([[{ hide: 'Alt+Shift+H' }]]);
  });

  it('puts one default back, or all of them', async () => {
    const wrapper = mount(HotkeySettings, { props: { changed: { capture: 'Alt+Shift+S', hide: 'Alt+Shift+H' } } });
    expect(button(wrapper, 'Put back “Answer now”')).toBeUndefined();
    await button(wrapper, 'Put back “Screenshot of an area”')!.trigger('click');
    await button(wrapper, 'Put back every default')!.trigger('click');
    expect(wrapper.emitted('save')).toEqual([[{ hide: 'Alt+Shift+H' }], [{}]]);
  });

  it('stops listening when the page goes', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const wrapper = mount(HotkeySettings, { props: { changed: {} } });
    await button(wrapper, 'Change “Answer now”')!.trigger('click');
    wrapper.unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true);
  });
});

describe('the keys in effect, named where they are mentioned (3.13)', () => {
  it('in the screenshot button’s words', () => {
    const wrapper = mount(AskBar, {
      props: { send: async () => true, capture: async () => ({ ok: true }), manual: true, captureKey: 'Alt+Shift+S' },
    });
    expect(wrapper.html()).toContain('Screenshot of an area, for your next question (Alt+Shift+S)');
  });

  it('in the attached screenshots’ words', () => {
    (window as unknown as { overlayApi: unknown }).overlayApi = { screenshot: async () => null };
    const wrapper = mount(AttachmentTray, { props: { ids: [], max: 5, manual: true, triggerKey: 'Ctrl+Alt+Enter' } });
    expect(wrapper.text()).toContain('Ctrl+Alt+Enter answers with them');
  });

  it('in the setup’s hotkey step, as Settings has them', async () => {
    const fake = fakeAppApi(initialAppState, {
      getSettings: vi.fn(async () => ({ ...defaultSettings, hotkeys: { focus: 'CommandOrControl+Alt+Space' } })),
    });
    window.appApi = fake.api;
    const wrapper = mount(SetupHotkeys);
    await flushPromises();
    expect(wrapper.text()).toContain('Only Ctrl+Alt+Space moves the keyboard to Sotto.');
    expect(wrapper.text()).not.toContain(sessionHotkeys.focus);
  });
});
