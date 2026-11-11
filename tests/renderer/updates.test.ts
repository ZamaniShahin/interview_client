// @vitest-environment happy-dom
// Automatic updates in the app window (4.2): a downloaded update says so and installs on request; an outdated
// version says how the new one is coming; nothing shows otherwise.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { initialAppState } from '../../src/shared/app-state';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import type { UpdateView } from '../../src/shared/updates';
import { useAppStore } from '../../src/renderer/app/app-store';
import UpdateBanner from '../../src/renderer/app/components/UpdateBanner.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);
beforeEach(() => setActivePinia(createPinia()));

async function banner(update: UpdateView, overrides: Partial<AppApi> = {}, outdated = false) {
  const fake = fakeAppApi(
    {
      ...initialAppState,
      update,
      problem: outdated
        ? { code: ErrorCodes.Identity.ClientOutdated, message: 'This version of Sotto is out of date.' }
        : null,
    },
    overrides,
  );
  window.appApi = fake.api;
  await useAppStore().load();
  return mount(UpdateBanner);
}

describe('automatic updates in the app window (4.2)', () => {
  it.each<UpdateView>([
    { status: 'off' },
    { status: 'idle' },
    { status: 'checking' },
    { status: 'failed' },
    { status: 'downloading', version: '0.2.0', percent: 40 },
  ])('shows nothing while the update is %j', async (update) => {
    expect((await banner(update)).text()).toBe('');
  });

  it('says a downloaded update is ready, and installs it on request', async () => {
    const installUpdate = vi.fn<AppApi['installUpdate']>(async () => ({ ok: true }));
    const wrapper = await banner({ status: 'ready', version: '0.2.0' }, { installUpdate });
    expect(wrapper.text()).toContain('Sotto 0.2.0 is ready. It installs the next time Sotto closes, or now.');
    await wrapper.find('button').trigger('click');
    expect(installUpdate).toHaveBeenCalledTimes(1);
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('says why it could not install now, and lets the user try again', async () => {
    const wrapper = await banner(
      { status: 'ready', version: '0.2.0' },
      {
        installUpdate: async () => ({
          ok: false,
          code: ErrorCodes.Session.AlreadyInSession,
          message: 'Finish the session first: the update installs when it ends.',
        }),
      },
    );
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe('Finish the session first: the update installs when it ends.');
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });

  it('says how the new version is coming while this one is out of date', async () => {
    const wrapper = await banner({ status: 'downloading', version: '0.2.0', percent: 63 }, {}, true);
    expect(wrapper.text()).toBe('The new version is downloading (63%). Restart Sotto once it is ready.');
  });

  it('offers the install as soon as the new version is ready, outdated or not', async () => {
    const wrapper = await banner({ status: 'ready', version: '0.2.0' }, {}, true);
    expect(wrapper.text()).toContain('Restart to update');
  });
});
