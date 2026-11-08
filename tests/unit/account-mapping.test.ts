import { describe, expect, it } from 'vitest';
import { maskEmail, shortDate, toAccountView, type AccountSources } from '../../src/main/account/account-mapping';

// Midday, so local dates are the same whatever the computer's time zone.
const now = new Date('2026-11-08T12:00:00Z');

function sources(change: Partial<AccountSources> = {}): AccountSources {
  return {
    me: { id: 'u1', email: 'sam@example.com', emailVerified: true, displayName: 'Sam Rivera', createdAt: '2026-10-01T12:00:00Z' },
    entitlements: {
      accountId: 'a1',
      planId: 'pro',
      planName: 'Pro',
      state: 'active',
      features: ['smart_tier', 'practice'],
      limits: { liveMinutesPerPeriod: 600, fairUseMinutesPerPeriod: null, maxSessionMinutes: 120, devices: 3 },
      validUntil: '2026-12-01T12:00:00Z',
    },
    credits: {
      balance: 442,
      lots: [
        { source: 'plan', granted: 600, remaining: 400, grantedAt: '2026-11-01T12:00:00Z', expiresAt: '2026-12-01T12:00:00Z' },
        { source: 'purchase', granted: 60, remaining: 42, grantedAt: '2026-11-03T12:00:00Z', expiresAt: null },
      ],
    },
    ledger: {
      entries: [
        { number: 3, type: 'debit_live', minutes: -42, balanceAfter: 442, sessionId: 's1', createdAt: '2026-11-07T12:00:00Z' },
        { number: 2, type: 'grant_plan', minutes: 400, balanceAfter: 484, sessionId: null, createdAt: '2026-11-01T12:00:00Z' },
      ],
      next: null,
    },
    devices: [
      { id: 'd1', name: 'Work laptop', platform: 'windows', appVersion: '0.1.0', createdAt: '2026-10-01T12:00:00Z', lastSeenAt: '2026-11-08T09:00:00Z' },
      { id: 'd2', name: 'Home PC', platform: 'macos', appVersion: '0.1.0', createdAt: '2026-10-02T12:00:00Z', lastSeenAt: '2026-11-07T12:00:00Z' },
    ],
    deviceId: 'd1',
    ...change,
  };
}

describe("the account's view, from the REST API's", () => {
  it('shows the user by name, with the email masked', () => {
    expect(toAccountView(sources(), now).user).toEqual({ name: 'Sam Rivera', emailMasked: 's•••@example.com' });
  });

  it('shows the email, masked, when the user has no display name', () => {
    const me = { ...sources().me, displayName: null };

    expect(toAccountView(sources({ me }), now).user.name).toBe('sam@example.com');
  });

  it('shows the plan, its state and when it renews', () => {
    expect(toAccountView(sources(), now).plan).toEqual({ name: 'Pro', state: 'active', renewsOn: 'Dec 1' });
  });

  it('shows a state it does not know as no plan', () => {
    const entitlements = { ...sources().entitlements, state: 'frozen', validUntil: null };

    expect(toAccountView(sources({ entitlements }), now).plan).toEqual({ name: 'Pro', state: 'none', renewsOn: null });
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
    const entitlements = {
      ...sources().entitlements,
      limits: { liveMinutesPerPeriod: null, fairUseMinutesPerPeriod: 3000, maxSessionMinutes: 180, devices: 3 },
    };

    expect(toAccountView(sources({ entitlements }), now).minutes).toBeNull();
  });

  it('names each ledger entry, and says how long a session took', () => {
    expect(toAccountView(sources(), now).ledger).toEqual([
      { date: 'Nov 7', kind: 'Session', detail: '42 minutes', minutes: -42, balanceAfter: 442 },
      { date: 'Nov 1', kind: 'Plan minutes', detail: '', minutes: 400, balanceAfter: 484 },
    ]);
  });

  it('marks this computer among the devices, and says when the others were last seen', () => {
    const view = toAccountView(sources(), now);

    expect(view.devices).toEqual([
      { id: 'd1', name: 'Work laptop', platform: 'Windows', appVersion: '0.1.0', firstSeen: 'Oct 1', lastSeen: 'now', isThisComputer: true },
      { id: 'd2', name: 'Home PC', platform: 'macOS', appVersion: '0.1.0', firstSeen: 'Oct 2', lastSeen: 'yesterday', isThisComputer: false },
    ]);
    expect(view.deviceLimit).toBe(3);
  });
});

describe('the small formats', () => {
  it('shows a date in another year with its year', () => {
    expect(shortDate('2027-11-04T12:00:00Z', now)).toBe('Nov 4, 2027');
  });

  it('masks an email down to its first letter and its domain', () => {
    expect(maskEmail('shahin@example.com')).toBe('s•••@example.com');
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});
