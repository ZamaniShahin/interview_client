import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  maskEmail,
  shortDate,
  toAccountView,
  toCatalogView,
  toLedgerEntries,
  type AccountSources,
  type CatalogDto,
} from '../../src/main/account/account-mapping';

// Midday, so local dates are the same whatever the computer's time zone.
const now = new Date('2026-11-08T12:00:00Z');

const catalog: CatalogDto = {
  purchases: true,
  plans: [
    {
      id: 'credits_monthly',
      name: 'Credits',
      features: ['live', 'screenshots', 'smart_tier'],
      limits: { liveMinutesPerPeriod: 400, fairUseMinutesPerPeriod: null, maxSessionMinutes: 120, devices: 3 },
    },
    {
      id: 'unlimited',
      name: 'Unlimited',
      features: ['live', 'smart_tier'],
      limits: { liveMinutesPerPeriod: null, fairUseMinutesPerPeriod: 3600, maxSessionMinutes: 120, devices: 3 },
    },
  ],
  topUps: [{ id: 'topup_100', minutes: 100, validDays: 365 }],
  trial: {
    days: 14,
    plan: {
      id: 'trial',
      name: 'Trial',
      features: ['live', 'screenshots'],
      limits: { liveMinutesPerPeriod: 30, fairUseMinutesPerPeriod: null, maxSessionMinutes: 10, devices: 2 },
    },
  },
};

function sources(change: Partial<AccountSources> = {}): AccountSources {
  return {
    me: {
      id: 'u1',
      email: 'sam@example.com',
      emailVerified: true,
      displayName: 'Sam Rivera',
      createdAt: '2026-10-01T12:00:00Z',
      deviceRemovals: { left: 3, max: 3, windowDays: 30, nextFreesAt: null },
    },
    entitlements: {
      accountId: 'a1',
      planId: 'credits_monthly',
      planName: 'Credits',
      state: 'active',
      features: ['smart_tier', 'practice'],
      limits: { liveMinutesPerPeriod: 600, fairUseMinutesPerPeriod: null, maxSessionMinutes: 120, devices: 3 },
      validUntil: '2026-12-01T12:00:00Z',
      renews: true,
      trialUsed: true,
      trialEndsAt: null,
      licensed: false,
    },
    credits: {
      balance: 442,
      lots: [
        {
          source: 'plan',
          granted: 600,
          remaining: 400,
          grantedAt: '2026-11-01T12:00:00Z',
          expiresAt: '2026-12-01T12:00:00Z',
        },
        { source: 'purchase', granted: 60, remaining: 42, grantedAt: '2026-11-03T12:00:00Z', expiresAt: null },
      ],
    },
    ledger: {
      entries: [
        {
          number: 3,
          type: 'debit_live',
          minutes: -42,
          balanceAfter: 442,
          sessionId: 's1',
          createdAt: '2026-11-07T12:00:00Z',
        },
        {
          number: 2,
          type: 'grant_plan',
          minutes: 400,
          balanceAfter: 484,
          sessionId: null,
          createdAt: '2026-11-01T12:00:00Z',
        },
      ],
      next: null,
    },
    devices: [
      {
        id: 'd1',
        name: 'Work laptop',
        platform: 'windows',
        appVersion: '0.1.0',
        createdAt: '2026-10-01T12:00:00Z',
        lastSeenAt: '2026-11-08T09:00:00Z',
      },
      {
        id: 'd2',
        name: 'Home PC',
        platform: 'macos',
        appVersion: '0.1.0',
        createdAt: '2026-10-02T12:00:00Z',
        lastSeenAt: '2026-11-07T12:00:00Z',
      },
    ],
    catalog,
    deviceId: 'd1',
    ...change,
  };
}

const entitled = (change: Partial<AccountSources['entitlements']>) => ({ ...sources().entitlements, ...change });

describe("the account's view, from the REST API's", () => {
  it('shows the user by name, with the email masked and whether it is verified', () => {
    expect(toAccountView(sources(), now).user).toEqual({
      name: 'Sam Rivera',
      emailMasked: 's•••@example.com',
      emailVerified: true,
    });
  });

  it('shows the email, masked, when the user has no display name', () => {
    const me = { ...sources().me, displayName: null, emailVerified: false };

    const user = toAccountView(sources({ me }), now).user;

    expect(user.name).toBe('sam@example.com');
    expect(user.emailVerified).toBe(false);
  });

  it('shows the plan, its state, when it renews and what it gives', () => {
    expect(toAccountView(sources(), now).plan).toEqual({
      id: 'credits_monthly',
      name: 'Credits',
      state: 'active',
      until: 'Dec 1',
      renews: true,
      licensed: false,
      daysLeft: 23,
      periodMinutes: 600,
      fairUseMinutes: null,
      maxSessionMinutes: 120,
      smart: true,
    });
  });

  it.each([
    ['none', 'none'],
    ['trialing', 'trialing'],
    ['active', 'active'],
    ['past_due', 'past_due'],
    ['suspended', 'suspended'],
    ['cancelled', 'none'],
    ['frozen', 'none'],
    ['', 'none'],
  ])('reads the state %j as %j', (state, shown) => {
    expect(toAccountView(sources({ entitlements: entitled({ state }) }), now).plan.state).toBe(shown);
  });

  it('keeps a cancelled plan active to its end, without renewing', () => {
    const plan = toAccountView(sources({ entitlements: entitled({ renews: false }) }), now).plan;

    expect(plan).toMatchObject({ state: 'active', renews: false, until: 'Dec 1' });
  });

  it('reads a licence as given, never renewing, with no end when it has none', () => {
    const plan = toAccountView(
      sources({
        entitlements: entitled({ planId: 'team', planName: 'Team', licensed: true, renews: false, validUntil: null }),
      }),
      now,
    ).plan;

    expect(plan).toMatchObject({
      id: 'team',
      name: 'Team',
      licensed: true,
      renews: false,
      until: null,
      daysLeft: null,
    });
  });

  it('has no date or days left for a plan without an end', () => {
    const plan = toAccountView(sources({ entitlements: entitled({ validUntil: null }) }), now).plan;

    expect(plan.until).toBeNull();
    expect(plan.daysLeft).toBeNull();
  });

  it('reads the tier from the features: fast without smart_tier', () => {
    expect(toAccountView(sources({ entitlements: entitled({ features: ['live'] }) }), now).plan.smart).toBe(false);
  });

  it.each([
    [false, null, { used: false, endsOn: null }],
    [true, null, { used: true, endsOn: null }],
    [true, '2026-11-15T12:00:00Z', { used: true, endsOn: 'Nov 15' }],
    [true, '2027-01-02T12:00:00Z', { used: true, endsOn: 'Jan 2, 2027' }],
  ])("reads the user's trial: used %s, ending %s", (trialUsed, trialEndsAt, trial) => {
    expect(toAccountView(sources({ entitlements: entitled({ trialUsed, trialEndsAt }) }), now).trial).toEqual(trial);
  });

  it('shows the minutes usable now and each lot behind them', () => {
    expect(toAccountView(sources(), now).minutes).toEqual({
      usable: 442,
      lots: [
        { source: 'Plan minutes', left: 400, granted: 600, expires: 'Dec 1' },
        { source: 'Top-up', left: 42, granted: 60, expires: 'never' },
      ],
    });
  });

  it('shows no minutes on a plan with fair use instead (Unlimited)', () => {
    const entitlements = entitled({
      limits: { liveMinutesPerPeriod: null, fairUseMinutesPerPeriod: 3000, maxSessionMinutes: 180, devices: 3 },
    });

    const view = toAccountView(sources({ entitlements }), now);

    expect(view.minutes).toBeNull();
    expect(view.plan).toMatchObject({ periodMinutes: null, fairUseMinutes: 3000, maxSessionMinutes: 180 });
  });

  it('names each ledger entry, says how long a session took, and keeps its number for paging', () => {
    const view = toAccountView(sources(), now);

    expect(view.ledger).toEqual([
      { number: 3, date: 'Nov 7', kind: 'Session', detail: '42 minutes', minutes: -42, balanceAfter: 442 },
      { number: 2, date: 'Nov 1', kind: 'Plan minutes', detail: '', minutes: 400, balanceAfter: 484 },
    ]);
    expect(view.ledgerNext).toBeNull();
  });

  it("keeps where the ledger's next page starts", () => {
    const ledger = { ...sources().ledger, next: 2 };

    expect(toAccountView(sources({ ledger }), now).ledgerNext).toBe(2);
  });

  it('marks this computer among the devices, and says when the others were last seen', () => {
    const view = toAccountView(sources(), now);

    expect(view.devices).toEqual([
      {
        id: 'd1',
        name: 'Work laptop',
        platform: 'Windows',
        appVersion: '0.1.0',
        firstSeen: 'Oct 1',
        lastSeen: 'now',
        isThisComputer: true,
      },
      {
        id: 'd2',
        name: 'Home PC',
        platform: 'macOS',
        appVersion: '0.1.0',
        firstSeen: 'Oct 2',
        lastSeen: 'yesterday',
        isThisComputer: false,
      },
    ]);
    expect(view.deviceLimit).toBe(3);
  });

  it.each([
    [
      { left: 3, max: 3, windowDays: 30, nextFreesAt: null },
      { left: 3, max: 3, windowDays: 30, nextFreesOn: null },
    ],
    [
      { left: 1, max: 3, windowDays: 30, nextFreesAt: '2026-12-06T12:00:00Z' },
      { left: 1, max: 3, windowDays: 30, nextFreesOn: 'Dec 6' },
    ],
    [
      { left: 0, max: 3, windowDays: 30, nextFreesAt: '2027-01-03T12:00:00Z' },
      { left: 0, max: 3, windowDays: 30, nextFreesOn: 'Jan 3, 2027' },
    ],
  ])('says what the removal cap leaves: %j', (deviceRemovals, shown) => {
    const me = { ...sources().me, deviceRemovals };

    expect(toAccountView(sources({ me }), now).deviceRemovals).toEqual(shown);
  });

  it('offers nothing to buy when the catalog could not be read', () => {
    expect(toAccountView(sources({ catalog: null }), now).catalog).toBeNull();
  });
});

describe('the catalog, as the plan screens read it', () => {
  it('describes each plan by its minutes, sessions, computers and tier, in the order the server gave', () => {
    expect(toCatalogView(catalog).plans).toEqual([
      {
        id: 'credits_monthly',
        name: 'Credits',
        periodMinutes: 400,
        fairUseMinutes: null,
        maxSessionMinutes: 120,
        devices: 3,
        smart: true,
      },
      {
        id: 'unlimited',
        name: 'Unlimited',
        periodMinutes: null,
        fairUseMinutes: 3600,
        maxSessionMinutes: 120,
        devices: 3,
        smart: true,
      },
    ]);
  });

  it('keeps the top-ups and how long they last', () => {
    expect(toCatalogView(catalog).topUps).toEqual([{ id: 'topup_100', minutes: 100, validDays: 365 }]);
  });

  it('describes the trial by its days and its plan', () => {
    expect(toCatalogView(catalog).trial).toEqual({
      days: 14,
      minutes: 30,
      maxSessionMinutes: 10,
      devices: 2,
      smart: false,
    });
  });

  it('has no trial while trials are off, and says whether buying works', () => {
    const view = toCatalogView({ ...catalog, purchases: false, trial: null });

    expect(view.trial).toBeNull();
    expect(view.purchases).toBe(false);
  });

  it('keeps an empty catalog empty', () => {
    expect(toCatalogView({ purchases: false, plans: [], topUps: [], trial: null })).toEqual({
      purchases: false,
      plans: [],
      topUps: [],
      trial: null,
    });
  });
});

describe('a page of the ledger', () => {
  it.each([
    ['grant_trial', 30, 'Trial minutes', ''],
    ['grant_plan', 400, 'Plan minutes', ''],
    ['purchase', 100, 'Top-up', ''],
    ['debit_live', -12, 'Session', '12 minutes'],
    ['debit_practice', -7, 'Practice', '7 minutes'],
    ['refund', -100, 'Refund', ''],
    ['expiry', -30, 'Expired', ''],
    ['adjustment', 60, 'Adjustment', ''],
    ['something_new', 5, 'something_new', ''],
  ])('names a %s entry', (type, minutes, kind, detail) => {
    const page = toLedgerEntries(
      {
        entries: [{ number: 9, type, minutes, balanceAfter: 100, sessionId: null, createdAt: '2026-11-02T12:00:00Z' }],
        next: 4,
      },
      now,
    );

    expect(page).toEqual([{ number: 9, date: 'Nov 2', kind, detail, minutes, balanceAfter: 100 }]);
  });
});

describe('the small formats', () => {
  it('shows a date in another year with its year', () => {
    expect(shortDate('2027-11-04T12:00:00Z', now)).toBe('Nov 4, 2027');
  });

  it.each([
    ['2026-11-08T12:00:00Z', 0],
    ['2026-11-08T12:00:01Z', 1],
    ['2026-11-09T12:00:00Z', 1],
    ['2026-11-09T12:00:01Z', 2],
    ['2026-11-22T12:00:00Z', 14],
    ['2026-11-01T12:00:00Z', 0],
  ])('counts the days left until %s as %i', (iso, days) => {
    expect(daysUntil(iso, now)).toBe(days);
  });

  it('masks an email down to its first letter and its domain', () => {
    expect(maskEmail('shahin@example.com')).toBe('s•••@example.com');
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});
