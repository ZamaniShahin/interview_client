// The development preview's account (`npm run dev:preview`), so the window's pages show realistic data with no server.
// Numbers follow the design handoff's §9 and add up: 87 plan minutes + 100 top-up = 187 usable. The plans and the
// catalog are the server's seeded ones (backend docs/05 §3), under the server's names.
import type { AccountView } from '../../shared/account';

export const previewAccount: AccountView = {
  user: { name: 'Sam Rivera', emailMasked: 's•••@example.com', emailVerified: true },
  plan: {
    id: 'credits_monthly',
    name: 'Credits',
    state: 'active',
    until: 'Dec 1',
    renews: true,
    daysLeft: 22,
    periodMinutes: 400,
    fairUseMinutes: null,
    maxSessionMinutes: 120,
    smart: true,
  },
  trial: { used: true, endsOn: null },
  minutes: {
    usable: 187,
    lots: [
      { source: 'Plan minutes', left: 87, granted: 400, expires: 'Dec 1' },
      { source: 'Top-up', left: 100, granted: 100, expires: 'Nov 4, 2027' },
    ],
  },
  ledger: [
    { number: 11, date: 'Nov 6', kind: 'Session', detail: '42 minutes', minutes: -42, balanceAfter: 187 },
    { number: 10, date: 'Nov 5', kind: 'Practice', detail: '14 minutes at half rate', minutes: -7, balanceAfter: 229 },
    { number: 9, date: 'Nov 5', kind: 'Session', detail: '80 minutes', minutes: -80, balanceAfter: 236 },
    { number: 8, date: 'Nov 4', kind: 'Top-up', detail: 'valid until Nov 4, 2027', minutes: 100, balanceAfter: 316 },
    {
      number: 7,
      date: 'Nov 3',
      kind: 'Session',
      detail: "120 minutes, the plan's longest",
      minutes: -120,
      balanceAfter: 216,
    },
    { number: 6, date: 'Nov 2', kind: 'Session', detail: '64 minutes', minutes: -64, balanceAfter: 336 },
    { number: 5, date: 'Nov 1', kind: 'Plan minutes', detail: 'November', minutes: 400, balanceAfter: 400 },
  ],
  ledgerNext: 5,
  devices: [
    {
      id: '01970000-0000-7000-8000-000000000001',
      name: 'Desk PC',
      platform: 'Windows 11',
      appVersion: '0.1.0',
      firstSeen: 'Oct 30',
      lastSeen: 'now',
      isThisComputer: true,
    },
    {
      id: '01970000-0000-7000-8000-000000000002',
      name: 'Laptop',
      platform: 'Windows 11',
      appVersion: '0.1.0',
      firstSeen: 'Nov 2',
      lastSeen: 'today',
      isThisComputer: false,
    },
  ],
  deviceLimit: 3,
  deviceRemovals: { left: 3, max: 3, windowDays: 30, nextFreesOn: null },
  catalog: {
    purchases: true,
    plans: [
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
    ],
    topUps: [{ id: 'topup_100', minutes: 100, validDays: 365 }],
    trial: { days: 14, minutes: 30, maxSessionMinutes: 10, devices: 2, smart: false },
  },
  readiness: {
    resume: 'updated Nov 4',
    jobDescription: 'Senior Backend Engineer, Payments',
    soundCheck: 'passed Nov 4',
  },
};
