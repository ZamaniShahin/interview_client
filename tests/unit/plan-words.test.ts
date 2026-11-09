import { describe, expect, it } from 'vitest';
import { previewAccount } from '../../src/main/preview/account';
import type { AccountView, PlanView } from '../../src/shared/account';
import {
  offerLines,
  otherPlans,
  planWords,
  plansOffered,
  plural,
  subscribed,
  topUpLines,
  topUpsOffered,
  trialLines,
  trialOffered,
} from '../../src/shared/plan-words';

/** The preview's account with its plan, trial or catalog changed: one fact at a time. */
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
    {
      minutes: { usable: 0, lots: [] },
      trial: { used: false, endsOn: null },
      ...change,
    },
  );

describe("the plan's words, state by state (F10 · d)", () => {
  it('says the minutes left and when an active plan renews', () => {
    expect(planWords(account())).toEqual({
      eyebrow: 'Minutes',
      headline: '187 min left',
      detail: 'Credits plan · renews Dec 1',
      tag: 'Active',
    });
  });

  it('says a cancelled plan ends, never that it renews', () => {
    expect(planWords(account({ renews: false }))).toEqual({
      eyebrow: 'Minutes',
      headline: '187 min left',
      detail: 'Credits plan · ends Dec 1',
      tag: 'Cancelled · runs until Dec 1',
    });
  });

  it('names a plan without an end by itself', () => {
    expect(planWords(account({ until: null })).detail).toBe('Credits plan');
    expect(planWords(account({ until: null, renews: false })).tag).toBe('Cancelled');
  });

  it('says Unlimited where a plan has no minutes to count', () => {
    const words = planWords(
      account({ name: 'Unlimited', periodMinutes: null, fairUseMinutes: 3600 }, { minutes: null }),
    );

    expect(words.headline).toBe('Unlimited');
    expect(words.detail).toBe('Unlimited plan · renews Dec 1');
  });

  it('says a payment is due, and by when', () => {
    expect(planWords(account({ state: 'past_due', until: 'Nov 9' }))).toEqual({
      eyebrow: 'Minutes',
      headline: '187 min left',
      detail: 'Payment due · Nov 9',
      tag: 'Payment due',
    });
  });

  it.each([
    [9, '22 min · 9 days', 'Trial · 9 days left'],
    [1, '22 min · 1 day', 'Trial · 1 day left'],
    [0, '22 min · 0 days', 'Trial · 0 days left'],
  ])('puts the days and minutes of a trial side by side (F9 · b): %i days', (daysLeft, headline, tag) => {
    const trial = account(
      { id: 'trial', name: 'Trial', state: 'trialing', until: 'Nov 15', daysLeft, renews: false },
      { minutes: { usable: 22, lots: [] } },
    );

    expect(planWords(trial)).toEqual({ eyebrow: 'Trial', headline, detail: 'Ends Nov 15', tag });
  });

  it('says suspended in every field it shows', () => {
    expect(planWords(account({ state: 'suspended' }))).toEqual({
      eyebrow: 'Minutes',
      headline: 'Suspended',
      detail: 'Your account is suspended.',
      tag: 'Suspended',
    });
  });

  it('offers the trial or a plan to someone who never had a plan (F9 · a), never "No plan plan"', () => {
    const words = planWords(noPlan());

    expect(words).toEqual({
      eyebrow: 'Minutes',
      headline: 'No plan yet',
      detail: 'Start the trial, or pick a plan',
      tag: 'No plan',
    });
    expect(Object.values(words).join(' ')).not.toContain('plan plan');
  });

  it('says when the trial ended, once it has (F9 · c)', () => {
    expect(planWords(noPlan({ trial: { used: true, endsOn: 'Nov 15' } }))).toMatchObject({
      headline: 'No plan',
      detail: 'The trial ended Nov 15',
    });
  });

  it('offers a plan, not the trial, to someone who had it or while trials are off', () => {
    const offPlan = { ...previewAccount.catalog!, trial: null };

    expect(planWords(noPlan({ trial: { used: true, endsOn: null } })).detail).toBe('Pick a plan to start sessions');
    expect(planWords(noPlan({ catalog: offPlan })).detail).toBe('Pick a plan to start sessions');
    expect(planWords(noPlan({ catalog: null })).detail).toBe('Pick a plan to start sessions');
  });
});

describe('what the screens offer', () => {
  it('offers the trial only without a plan, to someone who never had one, while trials are on', () => {
    expect(trialOffered(noPlan())).toEqual(previewAccount.catalog!.trial);
    expect(trialOffered(noPlan({ trial: { used: true, endsOn: 'Nov 15' } }))).toBeNull();
    expect(trialOffered(noPlan({ catalog: { ...previewAccount.catalog!, trial: null } }))).toBeNull();
    expect(trialOffered(account())).toBeNull();
  });

  it.each([
    ['active', true],
    ['past_due', true],
    ['trialing', true],
    ['none', false],
    ['suspended', false],
  ] as const)('offers top-ups on a plan with minutes that is %s: %s', (state, offered) => {
    expect(topUpsOffered(account({ state })).length > 0).toBe(offered);
  });

  it('offers no top-up on Unlimited, nor where nothing can be bought', () => {
    expect(topUpsOffered(account({ periodMinutes: null, fairUseMinutes: 3600 }))).toEqual([]);
    expect(topUpsOffered(account({}, { catalog: { ...previewAccount.catalog!, purchases: false } }))).toEqual([]);
    expect(topUpsOffered(account({}, { catalog: null }))).toEqual([]);
  });

  it('counts a paid plan as subscribed, renewing or cancelled, but not a trial or no plan', () => {
    expect(subscribed(account())).toBe(true);
    expect(subscribed(account({ renews: false }))).toBe(true);
    expect(subscribed(account({ state: 'past_due' }))).toBe(true);
    expect(subscribed(account({ id: 'trial', state: 'trialing' }))).toBe(false);
    expect(subscribed(noPlan())).toBe(false);
    expect(subscribed(account({ state: 'suspended' }))).toBe(false);
  });

  it('offers plans to buy only to someone without a paid plan, where buying works', () => {
    expect(plansOffered(noPlan()).map((p) => p.id)).toEqual(['credits_monthly', 'unlimited']);
    expect(plansOffered(account())).toEqual([]);
    expect(plansOffered(noPlan({ catalog: { ...previewAccount.catalog!, purchases: false } }))).toEqual([]);
  });

  it("offers the catalog's other plans, not the user's own", () => {
    expect(otherPlans(account()).map((p) => p.id)).toEqual(['unlimited']);
    expect(otherPlans(noPlan()).map((p) => p.id)).toEqual(['credits_monthly', 'unlimited']);
  });
});

describe("an offer's lines", () => {
  it('describes a plan with minutes, and one with fair use', () => {
    const [credits, unlimited] = previewAccount.catalog!.plans;

    expect(offerLines(credits!)).toEqual([
      '400 minutes a month, sessions up to 120 minutes',
      'Smart answers · 3 computers',
    ]);
    expect(offerLines(unlimited!)).toEqual([
      'Fair use, up to 60 hours a month, sessions up to 120 minutes',
      'Smart answers · 3 computers',
    ]);
  });

  it('says fair use in minutes when it is not whole hours, and fast answers on one computer', () => {
    const odd = {
      id: 'odd',
      name: 'Odd',
      periodMinutes: null,
      fairUseMinutes: 90,
      maxSessionMinutes: 30,
      devices: 1,
      smart: false,
    };

    expect(offerLines(odd)).toEqual([
      'Fair use, up to 90 minutes a month, sessions up to 30 minutes',
      'Fast answers · 1 computer',
    ]);
  });

  it('describes the trial (F9 · a)', () => {
    expect(trialLines(previewAccount.catalog!.trial!)).toEqual([
      '30 minutes over 14 days',
      'Sessions up to 10 minutes, fast answers',
      '2 computers',
    ]);
  });

  it.each([
    [365, 'Valid for 12 months'],
    [730, 'Valid for 24 months'],
    [180, 'Valid for 6 months'],
    [90, 'Valid for 3 months'],
    [60, 'Valid for 2 months'],
    [45, 'Valid for 45 days'],
    [1, 'Valid for 1 day'],
  ])('says how long %i days of a top-up last', (validDays, words) => {
    expect(topUpLines({ id: 't', minutes: 100, validDays })).toEqual({
      title: '+100 minutes',
      detail: `${words}, used after your plan's minutes.`,
    });
  });

  it.each([
    [0, 'days'],
    [1, 'day'],
    [2, 'days'],
  ])('counts %i in words', (n, word) => {
    expect(plural(n, 'day')).toBe(`${n} ${word}`);
  });
});
