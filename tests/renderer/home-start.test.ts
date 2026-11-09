// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { previewAccount } from '../../src/main/preview/account';
import { useAppStore } from '../../src/renderer/app/app-store';
import { fakeAppApi } from './fake-app-api';
import HomePage from '../../src/renderer/app/pages/HomePage.vue';
import { initialAppState, type AppState, type Problem } from '../../src/shared/app-state';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';

/** Main's state as Home reads it, signed in with an account, and the preload bridge recording what Home asks. */
async function home(problem: Problem | null = null) {
  const state: AppState = {
    ...initialAppState,
    auth: { status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' },
    account: previewAccount,
    problem,
  };
  const { api } = fakeAppApi(state);
  window.appApi = api;
  await useAppStore().load();
  const wrapper = mount(HomePage);
  await flushPromises();
  const startButton = () => wrapper.findAll('button').find((b) => /^Start/.test(b.text()))!;
  return { api, wrapper, startButton };
}

describe('starting a session from Home', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('waits for the consent box, then starts without taking anything over', async () => {
    const { api, wrapper, startButton } = await home();

    expect(startButton().text()).toBe('Start session');
    expect(startButton().attributes('disabled')).toBeDefined();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await startButton().trigger('click');
    await flushPromises();

    expect(api.startSession).toHaveBeenCalledWith({ consent: true });
  });

  it("offers to start here once the server says the account's session is open elsewhere", async () => {
    const { api, wrapper, startButton } = await home({
      code: ErrorCodes.Session.ActiveElsewhere,
      message:
        'A live session is already open on your account, on this computer or another. Start here to end that one.',
    });

    expect(startButton().text()).toBe('Start here');
    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.text()).toContain('Ends the session on your other device.');
    await startButton().trigger('click');
    await flushPromises();

    expect(api.startSession).toHaveBeenCalledWith({ consent: true, takeOver: true });
  });

  it('never takes over without the consent box', async () => {
    const { api, startButton } = await home({ code: ErrorCodes.Session.ActiveElsewhere, message: 'Open elsewhere.' });

    await startButton().trigger('click');
    await flushPromises();

    expect(api.startSession).not.toHaveBeenCalled();
  });
});
