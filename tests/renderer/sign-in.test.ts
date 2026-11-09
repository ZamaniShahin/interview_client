// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/renderer/app/app-store';
import { fakeAppApi } from './fake-app-api';
import ProblemBanner from '../../src/renderer/app/components/ProblemBanner.vue';
import SignInBanner from '../../src/renderer/app/components/SignInBanner.vue';
import { initialAppState, type AppState, type AuthView } from '../../src/shared/app-state';

async function showing(auth: AuthView, change: Partial<AppState> = {}) {
  const { api, send: push } = fakeAppApi({ ...initialAppState, auth, ...change });
  window.appApi = api;
  await useAppStore().load();
  const wrapper = mount(SignInBanner);
  const problem = mount(ProblemBanner);
  await flushPromises();
  const button = (label: string) => wrapper.findAll('button').find((b) => b.text().startsWith(label));
  return { api, push, wrapper, problem, button };
}

describe('the sign-in banner', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('offers to sign in, in the browser, when nobody is signed in', async () => {
    const { wrapper, button, api } = await showing({ status: 'signed-out' });

    expect(wrapper.text()).toContain('Not signed in.');
    await button('Sign in')!.trigger('click');
    expect(api.signIn).toHaveBeenCalledOnce();
  });

  it('says to finish in the browser while it waits, and can stop waiting', async () => {
    const { wrapper, button, api } = await showing({ status: 'signing-in' });

    expect(wrapper.text()).toContain('Finish signing in in your browser.');
    await button('Cancel')!.trigger('click');
    expect(api.cancelSignIn).toHaveBeenCalledOnce();
  });

  it('asks to sign in again when the sign-in has ended', async () => {
    const { wrapper, button } = await showing({ status: 'expired' });

    expect(wrapper.text()).toContain('Your sign-in has ended.');
    expect(button('Sign in again')).toBeDefined();
  });

  it("says Sotto can't be reached, and tries again on request", async () => {
    const { wrapper, button, api } = await showing({ status: 'unreachable' });

    expect(wrapper.text()).toContain("Can't reach Sotto right now.");
    await button('Try again')!.trigger('click');
    expect(api.refresh).toHaveBeenCalledOnce();
  });

  it('shows nothing once signed in, and follows what main says', async () => {
    const { wrapper, push } = await showing({ status: 'signing-in' });

    push({ ...initialAppState, auth: { status: 'signed-in', email: 'sam@example.com', name: 'Sam' } });
    await flushPromises();

    expect(wrapper.text()).toBe('');
  });
});

describe('the problem banner', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows the server's words, with Try again when trying again can help", async () => {
    const { problem } = await showing(
      { status: 'signed-in', email: 'sam@example.com', name: 'Sam' },
      { problem: { code: 'unavailable', message: "Can't reach Sotto right now." } },
    );

    expect(problem.text()).toContain("Can't reach Sotto right now.");
    expect(problem.findAll('button').map((b) => b.text())).toEqual(['Try again']);
  });

  it('offers nothing to retry when retrying would not help', async () => {
    const { problem } = await showing(
      { status: 'signed-in', email: 'sam@example.com', name: 'Sam' },
      { problem: { code: 'no_entitlement', message: "Your plan doesn't include live sessions." } },
    );

    expect(problem.text()).toContain("Your plan doesn't include live sessions.");
    expect(problem.findAll('button')).toHaveLength(0);
  });
});
