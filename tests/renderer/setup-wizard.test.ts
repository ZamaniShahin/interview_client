// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { previewAccount } from '../../src/main/preview/account';
import type { AppApi } from '../../src/preload/api';
import AppShell from '../../src/renderer/app/AppShell.vue';
import { initialAppState, type AppState } from '../../src/shared/app-state';
import { idleSoundCheck, type FirstRunView } from '../../src/shared/first-run';
import { defaultSettings } from '../../src/shared/settings';
import { fakeAppApi } from './fake-app-api';

const signedOut: Partial<AppState> = { auth: { status: 'signed-out' }, account: null };
const signedIn: Partial<AppState> = {
  auth: { status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' },
  account: previewAccount,
};

/** The app window over main's state, with the first run as given. */
async function shell(
  firstRun: Partial<FirstRunView> = {},
  change: Partial<AppState> = {},
  overrides: Partial<AppApi> = {},
) {
  const state: AppState = {
    ...initialAppState,
    ...signedOut,
    ...change,
    firstRun: { acknowledged: false, finished: false, hidingTested: false, ...firstRun },
  };
  const fake = fakeAppApi(state, { getSettings: vi.fn(async () => defaultSettings), ...overrides });
  window.appApi = fake.api;
  const wrapper = mount(AppShell);
  await flushPromises();
  // A button's words, without what only a screen reader hears (an external link's "(opens your browser)").
  const button = (text: string) =>
    wrapper.findAll('button').find((b) => b.text().replace('(opens your browser)', '').trim() === text);
  const click = async (text: string) => {
    const found = button(text);
    if (!found) throw new Error(`No "${text}" button; the screen says: ${wrapper.text().slice(0, 200)}`);
    await found.trigger('click');
    await flushPromises();
  };
  const heading = () => wrapper.find('h1').text();
  return { ...fake, wrapper, state, button, click, heading };
}

describe('the first run, opening by itself (1.14)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('opens the setup on the first run, framed as Setup, with no sidebar and no Maximize', async () => {
    const { wrapper, heading } = await shell();

    expect(heading()).toBe('Before your first session: what goes where');
    expect(wrapper.find('.chrome').text()).toContain('Setup');
    expect(wrapper.find('button[aria-label="Maximize"]').exists()).toBe(false);
    expect(wrapper.find('nav').exists()).toBe(false);
    expect(wrapper.find('[aria-current="step"]').text()).toContain('What goes where');
  });

  it('opens Home once the setup was finished', async () => {
    const { wrapper } = await shell({ acknowledged: true, finished: true });
    expect(wrapper.find('.wizard').exists()).toBe(false);
  });

  it('starts at sign-in when the notice was read before the setup was left', async () => {
    const { heading } = await shell({ acknowledged: true });
    expect(heading()).toBe('Sign in');
  });

  it('asks only for the notice, when its words changed after the setup was finished', async () => {
    const { api, wrapper, click } = await shell({ acknowledged: false, finished: true });

    expect(wrapper.text()).toContain('The words have changed since you last read them.');
    expect(wrapper.find('[aria-label="Setup steps"]').exists()).toBe(false);
    await click('I understand');

    expect(api.acknowledgeNotice).toHaveBeenCalledWith(1);
    expect(wrapper.find('.wizard').exists()).toBe(false);
  });
});

describe('the setup, step by step (1.14)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows what goes where, with the draft lede, and moves on once it is understood', async () => {
    const { api, wrapper, click, heading } = await shell();

    expect(wrapper.text()).toContain('A draft for layout; the final words wait for legal review.');
    expect(wrapper.text()).toContain('OpenAI may keep them for up to 30 days to watch for abuse, then deletes them.');
    expect(wrapper.text()).toContain('Step 1 of 5');
    await click('I understand');

    expect(api.acknowledgeNotice).toHaveBeenCalledWith(1);
    expect(heading()).toBe('Sign in');
  });

  it("stays on the notice with main's words when it can't be kept", async () => {
    const { wrapper, click, heading } = await shell(
      {},
      {},
      {
        acknowledgeNotice: vi.fn(async () => ({
          ok: false as const,
          code: 'invalid_input',
          message: 'The notice has changed: read it again.',
        })),
      },
    );

    await click('I understand');

    expect(heading()).toBe('Before your first session: what goes where');
    expect(wrapper.text()).toContain('The notice has changed: read it again.');
  });

  it('signs in in the browser, waits with the page at hand, and moves on by itself', async () => {
    const { api, send, state, wrapper, click, heading } = await shell({ acknowledged: true });

    await click('Sign in');
    expect(api.signIn).toHaveBeenCalled();
    send({ ...state, auth: { status: 'signing-in' } });
    await flushPromises();
    expect(heading()).toBe('Finish signing in in your browser.');
    expect(wrapper.text()).toContain('Waiting for the browser…');
    await click('Open the page again');
    await click('Copy the link');
    expect(api.signInPage.mock.calls).toEqual([['open'], ['copy']]);

    send({ ...state, ...signedIn });
    await flushPromises();

    expect(heading()).toBe('Your documents');
  });

  it('says who is signed in on a second run, and waits for Continue', async () => {
    const { wrapper, click, heading } = await shell({ acknowledged: true }, signedIn);

    expect(heading()).toBe("You're signed in");
    expect(wrapper.text()).toContain('As s•••@example.com.');
    await click('Continue');
    expect(heading()).toBe('Your documents');
  });

  it('stops waiting for the browser when going back', async () => {
    const { api, send, state, click, heading } = await shell({ acknowledged: true });
    await click('Sign in');
    send({ ...state, auth: { status: 'signing-in' } });
    await flushPromises();

    await click('Back');

    expect(api.cancelSignIn).toHaveBeenCalled();
    expect(heading()).toBe('Before your first session: what goes where');
  });

  it('keeps the documents that changed, and moves on', async () => {
    const { api, wrapper, click, heading } = await shell(
      { acknowledged: true },
      {
        ...signedIn,
        documents: { ...initialAppState.documents, name: 'Sam Rivera' },
      },
    );
    await click('Continue');

    const [name, resume] = wrapper.findAll('textarea');
    expect((name!.element as HTMLTextAreaElement).value).toBe('Sam Rivera');
    await resume!.setValue('Backend engineer, 7 years.');
    await click('Continue');

    expect(api.setDocument.mock.calls).toEqual([[{ field: 'resume', text: 'Backend engineer, 7 years.' }]]);
    expect(heading()).toBe('The sound check');
  });

  it('skips the documents without keeping anything, and holds Continue past a limit', async () => {
    const { api, wrapper, click, button, heading } = await shell({ acknowledged: true }, signedIn);
    await click('Continue');

    await wrapper.findAll('textarea')[0]!.setValue('x'.repeat(201));
    expect(button('Continue')!.attributes('disabled')).toBeDefined();
    await click('Skip for now');

    expect(api.setDocument).not.toHaveBeenCalled();
    expect(heading()).toBe('The sound check');
  });

  it('runs the sound check only when asked, shows what it hears, and ends it on leaving', async () => {
    const { api, soundCheck, wrapper, click, heading } = await shell({ acknowledged: true }, signedIn);
    await click('Continue');
    await click('Skip for now');

    expect(wrapper.text()).toContain('It runs as a short session, so it uses session minutes like one.');
    await click('Start the sound check');
    expect(api.soundCheck).toHaveBeenCalledWith('start');
    soundCheck({
      ...idleSoundCheck,
      phase: 'live',
      startedAtMs: Date.now(),
      heard: { finished: 'The telescope sees in infrared.', live: 'so what left them' },
      heardSomething: true,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Hearing this computer's sound");
    expect(wrapper.text()).toContain('The telescope sees in infrared.');
    expect(wrapper.find('.live').text()).toBe('so what left them');
    expect(wrapper.text()).toContain('Sotto can hear it.');
    await click('Continue');

    expect(api.soundCheck).toHaveBeenLastCalledWith('stop');
    expect(heading()).toBe('Your hands stay on the call');
  });

  it("says why the sound check couldn't start", async () => {
    const { wrapper, click } = await shell({ acknowledged: true }, signedIn, {
      soundCheck: vi.fn(async () => ({
        ok: false as const,
        code: 'no_entitlement',
        message: "Your plan doesn't include live sessions.",
      })),
    });
    await click('Continue');
    await click('Skip for now');

    await click('Start the sound check');

    expect(wrapper.text()).toContain("Your plan doesn't include live sessions.");
  });

  it('lists the hotkeys main registers, then tests hiding with a real share, then finishes', async () => {
    const { api, wrapper, click, heading } = await shell({ acknowledged: true }, signedIn);
    await click('Continue');
    await click('Skip for now');
    await click('Continue');

    expect(wrapper.findAll('.key')).toHaveLength(7);
    expect(wrapper.text()).toContain('Only Ctrl+Shift+Space moves the keyboard to Sotto.');
    await click('Continue');
    expect(heading()).toBe('Test hiding');

    await click('Show the overlay');
    await click('I can see it in the share');
    expect(wrapper.text()).toContain('If the share shows Sotto:');
    await click("It's hidden");
    expect(wrapper.text()).toContain('Sotto is hidden from your share.');
    await click('Finish');

    expect(api.hidingTest.mock.calls).toEqual([['show'], ['hidden'], ['hide']]);
    expect(api.finishSetup).toHaveBeenCalled();
    expect(wrapper.find('.wizard').exists()).toBe(false);
  });

  it('finishes without the test', async () => {
    const { api, wrapper, click } = await shell({ acknowledged: true }, signedIn);
    for (const step of ['Continue', 'Skip for now', 'Continue', 'Continue']) await click(step);

    await click('Skip the test');

    expect(api.finishSetup).toHaveBeenCalled();
    expect(wrapper.find('.wizard').exists()).toBe(false);
  });
});

describe('Help (1.14)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  async function help() {
    const opened = await shell({ acknowledged: true, finished: true }, signedIn);
    await opened.wrapper
      .findAll('nav button')
      .find((b) => b.text().includes('Help'))!
      .trigger('click');
    await flushPromises();
    return opened;
  }

  it('runs the whole setup again, from the notice', async () => {
    const { click, heading } = await help();
    await click('Run the setup');
    expect(heading()).toBe("You're signed in");
  });

  it('tests hiding on its own, with nothing to go back to', async () => {
    const { api, button, click, heading, wrapper } = await help();
    await click('Test hiding');

    expect(heading()).toBe('Test hiding');
    expect(button('Back')).toBeUndefined();
    expect(button('Skip the test')).toBeUndefined();
    await click('Done');

    expect(api.finishSetup).not.toHaveBeenCalled();
    expect(wrapper.find('.wizard').exists()).toBe(false);
  });
});
