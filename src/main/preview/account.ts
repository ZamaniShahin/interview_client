// The development preview's account (`npm run dev:preview`), so the window's pages show realistic data with no server.
// Numbers follow the design handoff's §9 and add up: 87 plan minutes + 100 top-up = 187 usable.
import type { AccountView } from '../../shared/account';

export const previewAccount: AccountView = {
  user: { name: 'Sam Rivera', emailMasked: 's•••@example.com' },
  plan: { name: 'Minutes', state: 'active', renewsOn: 'Dec 1' },
  minutes: {
    usable: 187,
    lots: [
      { source: 'Plan minutes', left: 87, granted: 400, expires: 'Dec 1' },
      { source: 'Top-up', left: 100, granted: 100, expires: 'Nov 4, 2027' },
    ],
  },
  ledger: [
    { date: 'Nov 6', kind: 'Session', detail: '42 minutes', minutes: -42, balanceAfter: 187 },
    { date: 'Nov 5', kind: 'Practice', detail: '14 minutes at half rate', minutes: -7, balanceAfter: 229 },
    { date: 'Nov 5', kind: 'Session', detail: '80 minutes', minutes: -80, balanceAfter: 236 },
    { date: 'Nov 4', kind: 'Top-up', detail: 'valid until Nov 4, 2027', minutes: 100, balanceAfter: 316 },
    { date: 'Nov 3', kind: 'Session', detail: "120 minutes, the plan's longest", minutes: -120, balanceAfter: 216 },
    { date: 'Nov 2', kind: 'Session', detail: '64 minutes', minutes: -64, balanceAfter: 336 },
    { date: 'Nov 1', kind: 'Plan minutes', detail: 'November', minutes: 400, balanceAfter: 400 },
  ],
  devices: [
    { id: 'desk', name: 'Desk PC', platform: 'Windows 11', appVersion: '0.1.0', firstSeen: 'Oct 30', lastSeen: 'now', isThisComputer: true },
    { id: 'laptop', name: 'Laptop', platform: 'Windows 11', appVersion: '0.1.0', firstSeen: 'Nov 2', lastSeen: 'today', isThisComputer: false },
  ],
  deviceLimit: 3,
  readiness: { resume: 'updated Nov 4', jobDescription: 'Senior Backend Engineer, Payments', soundCheck: 'passed Nov 4' },
};
