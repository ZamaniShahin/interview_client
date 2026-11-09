// @vitest-environment happy-dom
// 2.13 in the app window, page by page: the account (F10), Home's offers (F8, F9) and the device limit (F3), over
// main's state as given. Each action is checked by what the window asks main for, through the preload bridge.
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { previewAccount } from '../../src/main/preview/account';
import type { AppApi } from '../../src/preload/api';
import AppShell from '../../src/renderer/app/AppShell.vue';
import type { AccountView, PlanView } from '../../src/shared/account';
import { initialAppState, type AppState, type DeviceLimitState } from '../../src/shared/app-state';
import { SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import { defaultSettings } from '../../src/shared/settings';
import { fakeAppApi } from './fake-app-api';

const finished = { acknowledged: true, finished: true, hidingTested: true };

function account(plan: Partial<PlanView> = {}, change: Partial<AccountView> = {}): AccountView {
  return { ...previewAccount, ...change, plan: { ...previewAccount.plan, ...plan } };
}

const noPlan = (change: Partial<AccountView> = {}) =>
  account(
    {
      id: null,
      name: 'No plan',
      state: 'none',
      until: null,
      renews: false,
      daysLeft: null,
      periodMinutes: 0,
      maxSessionMinutes: 0,
    },
    { minutes: { usable: 0, lots: [] }, trial: { used: false, endsOn: null }, ...change },
  );

/** The app window, signed in, over main's state as given; `page` is the sidebar's page to open. */
async function shell(change: Partial<AppState> = {}, overrides: Partial<AppApi> = {}, page = 'Home') {
  const state: AppState = {
    ...initialAppState,
    auth: { status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' },
    account: previewAccount,
    ...change,
    firstRun: finished,
  };
  const fake = fakeAppApi(state, { getSettings: vi.fn(async () => defaultSettings), ...overrides });
  window.appApi = fake.api;
  const wrapper = mount(AppShell);
  await flushPromises();
  const words = (b: { text: () => string }) => b.text().replace('(opens your browser)', '').trim();
  const button = (text: string) => wrapper.findAll('button').find((b) => words(b) === text);
  const click = async (text: string) => {
    const found = button(text);
    if (!found) throw new Error(`No "${text}" button; the screen says: ${wrapper.text().slice(0, 300)}`);
    await found.trigger('click');
    await flushPromises();
  };
  if (page !== 'Home') await click(page);
  const main = () => wrapper.find('main').text();
  const footer = () => wrapper.find('nav .foot').text();
  return { ...fake, wrapper, button, click, main, footer };
}

describe('the account page (F10)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows the plan with its state's word and when it renews, and opens the billing portal", async () => {
    const { main, click, api } = await shell({}, {}, 'Account');

    expect(main()).toContain('Credits Active');
    expect(main()).toContain('Renews Dec 1');

    await click('Manage billing');
    expect(api.billingPortal).toHaveBeenCalledOnce();
    await click('Change plan');
    expect(api.billingPortal).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ renews: false }, 'Cancelled · runs until Dec 1', 'Runs until Dec 1, then stops.'],
    [{ state: 'past_due' as const, until: 'Nov 9' }, 'Payment due', 'Update it in the browser by Nov 9'],
    [
      { id: 'trial', name: 'Trial', state: 'trialing' as const, until: 'Nov 15', daysLeft: 9 },
      'Trial · 9 days left',
      'Ends Nov 15 · 187 minutes left',
    ],
    [{ state: 'suspended' as const }, 'Suspended', 'Your account is suspended.'],
  ])('words a plan that is %j', async (plan, tag, line) => {
    const { main } = await shell({ account: account(plan) }, {}, 'Account');

    expect(main()).toContain(tag);
    expect(main()).toContain(line);
  });

  it('shows a licence as given by Sotto, with no billing to manage and nothing to buy', async () => {
    const team = account(
      {
        id: 'team',
        name: 'Team',
        licensed: true,
        renews: false,
        until: null,
        periodMinutes: null,
        fairUseMinutes: 1_000_000,
      },
      { minutes: null },
    );
    const { main, button, footer } = await shell({ account: team }, {}, 'Account');

    expect(main()).toContain('Team Licence');
    expect(main()).toContain('Given by Sotto, with no end: nothing to pay.');
    expect(button('Manage billing')).toBeUndefined();
    expect(button('Change plan')).toBeUndefined();
    expect(button('Top up +100 minutes')).toBeUndefined();
    expect(footer()).toContain('Team plan · given by Sotto');
  });

  it('lets someone without a paid plan pick one, in the browser', async () => {
    const { main, click, button, api } = await shell({ account: noPlan() }, {}, 'Account');

    expect(button('Manage billing')).toBeUndefined();
    await click('Change plan');
    expect(main()).toContain('400 minutes a month, sessions up to 120 minutes');
    expect(main()).toContain('Fair use, up to 60 hours a month');
    expect(main()).not.toMatch(/\$|€|£|\[PRICE\]/);

    await click('Choose Unlimited');
    expect(api.buy).toHaveBeenCalledExactlyOnceWith({ planId: 'unlimited' });
  });

  it('tops up from the minutes, and not while a payment is being waited for', async () => {
    const { click, api } = await shell({}, {}, 'Account');

    await click('Top up +100 minutes');
    expect(api.buy).toHaveBeenCalledExactlyOnceWith({ topUpId: 'topup_100' });

    setActivePinia(createPinia());
    const waiting = await shell({ payment: { item: '+100 minutes', stale: false } }, {}, 'Account');
    expect(waiting.button('Top up +100 minutes')!.attributes('disabled')).toBeDefined();
  });

  it('offers no top-up on Unlimited', async () => {
    const unlimited = account({ name: 'Unlimited', periodMinutes: null, fairUseMinutes: 3600 }, { minutes: null });
    const { button, main } = await shell({ account: unlimited }, {}, 'Account');

    expect(button('Top up +100 minutes')).toBeUndefined();
    expect(main()).toContain('No meter: fair use applies.');
  });

  it("pages the ledger by Show earlier, until it's all shown", async () => {
    const { click, main, api, button } = await shell({}, {}, 'Account');

    await click('The ledger');
    expect(main()).toContain('Minutes ledger');
    expect(main()).toContain('Session · 42 minutes');
    await click('Show earlier');
    expect(api.ledgerMore).toHaveBeenCalledOnce();

    setActivePinia(createPinia());
    const all = await shell({ account: account({}, { ledgerNext: null }) }, {}, 'Account');
    await all.click('The ledger');
    expect(all.button('Show earlier')).toBeUndefined();
    expect(button('Account ›')).toBeDefined();
  });

  it('removes another computer after asking, saying what the cap leaves', async () => {
    const { click, main, api } = await shell({}, {}, 'Account');

    await click('Manage computers');
    expect(main()).toContain('Your plan allows 3.');
    expect(main()).toContain('You can remove 3 in 30 days.');
    expect(main()).toContain('1 place free.');

    await click('Remove');
    expect(main()).toContain('Remove Laptop?');
    expect(main()).toMatch(/After this, you can remove 2 more until \w{3} \d{1,2}/);
    await click('Remove Laptop');
    expect(api.removeDevice).toHaveBeenCalledExactlyOnceWith('01970000-0000-7000-8000-000000000002');
  });

  it('says when the next removal is possible once they are used up, and offers none', async () => {
    const used = account({}, { deviceRemovals: { left: 0, max: 3, windowDays: 30, nextFreesOn: 'Dec 6' } });
    const { click, main, button } = await shell({ account: used }, {}, 'Account');

    await click('Manage computers');

    expect(main()).toContain("You've removed 3 computers in 30 days. The next removal is possible on Dec 6.");
    expect(button('Remove')!.attributes('disabled')).toBeDefined();
  });

  it('asks before signing out, and says what stays on this computer (F10 · e)', async () => {
    const { click, main, api, wrapper } = await shell({}, {}, 'Account');

    await click('Sign out');
    expect(main()).toContain('Sign out of Sotto on this computer?');
    expect(main()).toContain('This computer stays one of your 3.');
    expect(api.signOut).not.toHaveBeenCalled();

    await click('Cancel');
    expect(main()).not.toContain('Sign out of Sotto on this computer?');

    await click('Sign out');
    const confirm = wrapper.find('[role="group"]');
    await confirm
      .findAll('button')
      .find((b) => b.text() === 'Sign out')!
      .trigger('click');
    await flushPromises();
    expect(api.signOut).toHaveBeenCalledOnce();
  });

  it('saves a copy of the data from the account page (Q19)', async () => {
    const { click, main, api } = await shell({}, {}, 'Account');

    expect(main()).toContain('Your data');
    expect(main()).toContain('What was said in an interview was never kept.');
    await click('Save a copy');

    expect(api.exportData).toHaveBeenCalledOnce();
  });

  it('deletes the account only once something is typed, sending what was typed, trimmed (Q19)', async () => {
    const { click, main, api, button, wrapper } = await shell({}, {}, 'Account');

    await click('Delete account');
    expect(main()).toContain('Delete your Sotto account?');
    expect(main()).toContain('Cancel a paid plan in Manage billing first.');
    expect(button('Delete my account')!.attributes('disabled')).toBeDefined();

    await wrapper.find('#delete-email').setValue('  sam@example.com ');
    expect(button('Delete my account')!.attributes('disabled')).toBeUndefined();
    await click('Delete my account');

    expect(api.deleteAccount).toHaveBeenCalledExactlyOnceWith('sam@example.com');
    expect(main()).not.toContain('Delete your Sotto account?');
  });

  it('keeps the form, and what was typed, when the server refuses the deletion (Q19)', async () => {
    const deleteAccount = vi.fn<AppApi['deleteAccount']>(async () => ({
      ok: false,
      code: 'already_subscribed',
      message: 'Your plan is still paid for: cancel it in the billing portal first, then delete the account.',
    }));
    const { click, main, wrapper } = await shell({}, { deleteAccount }, 'Account');

    await click('Delete account');
    await wrapper.find('#delete-email').setValue('sam@example.com');
    await click('Delete my account');

    expect(main()).toContain('Delete your Sotto account?');
    expect((wrapper.find('#delete-email').element as HTMLInputElement).value).toBe('sam@example.com');
  });

  it('puts the form away on Keep it or Escape, forgetting what was typed (Q19)', async () => {
    const { click, main, api, wrapper } = await shell({}, {}, 'Account');

    await click('Delete account');
    await wrapper.find('#delete-email').setValue('sam@example.com');
    await click('Keep it');
    expect(main()).not.toContain('Delete your Sotto account?');

    await click('Delete account');
    expect((wrapper.find('#delete-email').element as HTMLInputElement).value).toBe('');
    await wrapper.find('[aria-label="Delete your account"]').trigger('keydown', { key: 'Escape' });
    expect(main()).not.toContain('Delete your Sotto account?');
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  it('offers neither in the preview, which has no server to ask (Q19)', async () => {
    const { button } = await shell({ preview: true }, {}, 'Account');

    expect(button('Save a copy')!.attributes('disabled')).toBeDefined();
    expect(button('Delete account')!.attributes('disabled')).toBeDefined();
  });
});

describe('Home, with what the account needs now (F8, F9)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('offers the trial to a new user, and starts it (F9 · a)', async () => {
    const { main, click, api, footer } = await shell({ account: noPlan() });

    expect(main()).toContain('Try Sotto in a real interview');
    expect(main()).toContain(
      'The trial is free: 14 days and 30 minutes, with sessions up to 10 minutes and fast answers.',
    );
    expect(main()).toContain('Once per person and per computer.');
    expect(footer()).toContain('No plan yet');
    expect(footer()).not.toContain('plan plan');

    await click('Start the trial');
    expect(api.startTrial).toHaveBeenCalledOnce();
  });

  it('shows the plans beside the trial when asked', async () => {
    const { main, click } = await shell({ account: noPlan() });
    expect(main()).not.toContain('Choose Credits');

    await click('See the plans');

    expect(main()).toContain('Choose Credits');
  });

  it('shows the plans when the trial has ended, and buys one in the browser (F9 · c)', async () => {
    const { main, click, api, footer } = await shell({ account: noPlan({ trial: { used: true, endsOn: 'Nov 15' } }) });

    expect(main()).toContain('Your trial has ended');
    expect(main()).not.toContain('Start the trial');
    expect(footer()).toContain('The trial ended Nov 15');

    await click('Choose Credits');
    expect(api.buy).toHaveBeenCalledExactlyOnceWith({ planId: 'credits_monthly' });
  });

  it('puts the trial and its days side by side wherever minutes show (F9 · b)', async () => {
    const trial = account(
      {
        id: 'trial',
        name: 'Trial',
        state: 'trialing',
        until: 'Nov 15',
        daysLeft: 9,
        renews: false,
        maxSessionMinutes: 10,
        smart: false,
      },
      { minutes: { usable: 22, lots: [] } },
    );
    const { main, footer } = await shell({ account: trial });

    expect(footer()).toContain('Trial');
    expect(footer()).toContain('22 min · 9 days');
    expect(footer()).toContain('Ends Nov 15');
    expect(main()).toContain('Ends Nov 15. Sessions up to 10 minutes.');
  });

  it('offers minutes after a session that ran out of them, and only then (F8 · a)', async () => {
    const { main, click, api } = await shell({ lastSessionEnd: SessionEndReasons.CreditExhausted });

    expect(main()).toContain('The session ended: no minutes left.');
    expect(main()).toContain('+100 minutes');
    expect(main()).toContain(
      "Your plan's 400 minutes come back on Dec 1. Nothing is charged until you finish in the browser.",
    );

    await click('Top up in the browser');
    expect(api.buy).toHaveBeenCalledExactlyOnceWith({ topUpId: 'topup_100' });
    await click('Not now');
    expect(api.dismiss).toHaveBeenCalledExactlyOnceWith('offer');
  });

  it.each([
    SessionEndReasons.User,
    SessionEndReasons.MaxLength,
    SessionEndReasons.Inactive,
    SessionEndReasons.CostLimit,
    null,
  ])('offers nothing after a session that ended for another reason: %s', async (reason) => {
    const { main } = await shell({ lastSessionEnd: reason });

    expect(main()).not.toContain('The session ended: no minutes left.');
  });

  it('offers the billing page, not another plan, to a subscriber who ran out', async () => {
    const { main, click, api } = await shell({ lastSessionEnd: SessionEndReasons.CreditExhausted });

    expect(main()).toContain('A plan is changed in your billing page.');
    await click('Manage billing');
    expect(api.billingPortal).toHaveBeenCalledOnce();
  });

  it('waits for a payment finished in the browser, and can open its page again or stop (F8 · b)', async () => {
    const { main, click, api } = await shell({ payment: { item: '+100 minutes', stale: false } });

    expect(main()).toContain('Finish in your browser.');
    expect(main()).toContain('Waiting for the payment…');

    await click('Open the page again');
    expect(api.payment).toHaveBeenCalledWith('open');
    await click('Cancel');
    expect(api.payment).toHaveBeenCalledWith('cancel');
  });

  it('says it keeps checking after a long wait', async () => {
    const { main } = await shell({ payment: { item: '+100 minutes', stale: true } });

    expect(main()).toContain('Still waiting. If you paid, it shows here within a minute or two: Sotto keeps checking.');
  });

  it('says in one quiet line that the minutes arrived, and puts it away (F8 · c)', async () => {
    const { main, click, api } = await shell({ notice: '100 minutes added. They last until Nov 9, 2027.' });

    expect(main()).toContain('100 minutes added. They last until Nov 9, 2027.');
    await click('OK');
    expect(api.dismiss).toHaveBeenCalledExactlyOnceWith('notice');
  });

  it('says the minutes, the plan and the longest session on Home', async () => {
    const { main, footer } = await shell();

    expect(main()).toContain('187 min left');
    expect(main()).toContain('Credits plan · renews Dec 1. Sessions up to 120 minutes.');
    expect(footer()).toContain('Credits plan · renews Dec 1');
  });
});

describe("the device limit, when this computer can't be added (F3)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const limit = (left = 3, nextFreesOn: string | null = null): DeviceLimitState => ({
    devices: [
      {
        id: '01970000-0000-7000-8000-00000000000a',
        name: 'Laptop',
        platform: 'Windows',
        appVersion: '2.0.0',
        firstSeen: 'Nov 2',
        lastSeen: 'today',
        isThisComputer: false,
      },
      {
        id: '01970000-0000-7000-8000-00000000000b',
        name: 'Desk PC',
        platform: 'Windows',
        appVersion: '2.0.0',
        firstSeen: 'Oct 30',
        lastSeen: 'yesterday',
        isThisComputer: false,
      },
      {
        id: '01970000-0000-7000-8000-00000000000c',
        name: 'Office PC',
        platform: 'Windows',
        appVersion: '1.9.3',
        firstSeen: 'Sep 12',
        lastSeen: 'Oct 1',
        isThisComputer: false,
      },
    ],
    limit: 3,
    removals: { left, max: 3, windowDays: 30, nextFreesOn },
    thisComputer: 'Travel laptop',
  });

  it("lists the account's computers in place of everything else, framed as Setup", async () => {
    const { wrapper } = await shell({ account: null, deviceLimit: limit() });

    expect(wrapper.find('h1').text()).toBe('This account is on 3 computers, the most your plan allows');
    expect(wrapper.text()).toContain('You can remove 3 in 30 days.');
    expect(wrapper.text()).toContain('This computer: Travel laptop, waiting to be added.');
    expect(wrapper.find('nav').exists()).toBe(false);
    expect(wrapper.find('.chrome').text()).toContain('Setup');
  });

  it('adds this computer in place of the one removed, after asking (F3 · b)', async () => {
    const { wrapper, api } = await shell({ account: null, deviceLimit: limit() });

    await wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Remove')[2]!
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Remove Office PC?');
    expect(wrapper.text()).toMatch(/After this, you can remove 2 more until/);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Remove Office PC')!
      .trigger('click');
    await flushPromises();

    expect(api.replaceDevice).toHaveBeenCalledExactlyOnceWith('01970000-0000-7000-8000-00000000000c');
  });

  it('offers no removal once they are used up, and says when the next is possible', async () => {
    const { wrapper } = await shell({ account: null, deviceLimit: limit(0, 'Dec 6') });

    expect(wrapper.text()).toContain('The next removal is possible on Dec 6.');
    for (const remove of wrapper.findAll('button').filter((b) => b.text() === 'Remove')) {
      expect(remove.attributes('disabled')).toBeDefined();
    }
  });

  it('signs out instead, when asked', async () => {
    const { click, api } = await shell({ account: null, deviceLimit: limit() });

    await click('Sign out instead');

    expect(api.signOut).toHaveBeenCalledOnce();
  });

  it('comes before the setup, which waits for this computer to be added', async () => {
    const state: AppState = {
      ...initialAppState,
      auth: { status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' },
      deviceLimit: limit(),
      firstRun: { acknowledged: true, finished: false, hidingTested: false },
    };
    window.appApi = fakeAppApi(state, { getSettings: vi.fn(async () => defaultSettings) }).api;
    const wrapper = mount(AppShell);
    await flushPromises();

    expect(wrapper.find('h1').text()).toBe('This account is on 3 computers, the most your plan allows');
  });
});
