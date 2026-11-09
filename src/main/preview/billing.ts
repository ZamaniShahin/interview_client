// The development preview's account changes (`npm run dev:preview`): buying, the trial, removing a computer and the
// ledger's earlier page, played on the sample account with no server, so the window's flows can be worked on and
// tested end to end (tests/app). Never in a packaged build.
import type { AccountView, LedgerEntry } from '../../shared/account';
import type { CommandResult, PurchaseRequest } from '../../shared/ipc';
import { previewAccount } from './account';

/** How long the preview's "provider" takes to report a payment, as a real one takes a few seconds. */
export const previewPaymentMs = 1_500;

const olderEntries: LedgerEntry[] = [
  { number: 3, date: 'Oct 30', kind: 'Session', detail: '35 minutes', minutes: -35, balanceAfter: 0 },
  { number: 2, date: 'Oct 12', kind: 'Session', detail: '60 minutes', minutes: -60, balanceAfter: 35 },
  { number: 1, date: 'Oct 1', kind: 'Plan minutes', detail: 'October', minutes: 400, balanceAfter: 95 },
];

export class PreviewBilling {
  private view: AccountView = structuredClone(previewAccount);

  get account(): AccountView {
    return this.view;
  }

  /** The words the window waits with, and the change once the "provider" reports the payment. */
  buy(purchase: PurchaseRequest): { item: string; arrive: () => string } {
    const catalog = this.view.catalog;
    if ('topUpId' in purchase) {
      const topUp = catalog?.topUps.find((t) => t.id === purchase.topUpId);
      const minutes = topUp?.minutes ?? 100;
      return {
        item: `+${minutes} minutes`,
        arrive: () => {
          const minutesView = this.view.minutes ?? { usable: 0, lots: [] };
          this.view = {
            ...this.view,
            minutes: {
              usable: minutesView.usable + minutes,
              lots: [
                ...minutesView.lots,
                { source: 'Top-up', left: minutes, granted: minutes, expires: 'Nov 9, 2027' },
              ],
            },
          };
          return `${minutes} minutes added. They last until Nov 9, 2027.`;
        },
      };
    }
    const offer = catalog?.plans.find((p) => p.id === purchase.planId);
    const name = offer?.name ?? purchase.planId;
    return {
      item: name,
      arrive: () => {
        this.view = {
          ...this.view,
          plan: {
            ...this.view.plan,
            id: purchase.planId,
            name,
            state: 'active',
            renews: true,
            until: 'Dec 9',
            periodMinutes: offer?.periodMinutes ?? null,
            fairUseMinutes: offer?.fairUseMinutes ?? null,
          },
          minutes: offer?.periodMinutes === null ? null : this.view.minutes,
        };
        return offer?.periodMinutes
          ? `${name} plan started: ${offer.periodMinutes} minutes a month.`
          : `${name} plan started.`;
      },
    };
  }

  startTrial(): CommandResult {
    if (this.view.plan.state !== 'none' || this.view.trial.used) {
      return { ok: false, code: 'trial_not_available', message: 'This account already has a plan.' };
    }
    this.view = {
      ...this.view,
      plan: {
        ...this.view.plan,
        id: 'trial',
        name: 'Trial',
        state: 'trialing',
        until: 'Nov 23',
        daysLeft: 14,
        renews: false,
      },
      trial: { used: true, endsOn: 'Nov 23' },
      minutes: { usable: 30, lots: [{ source: 'Trial', left: 30, granted: 30, expires: 'Nov 23' }] },
    };
    return { ok: true };
  }

  removeDevice(deviceId: string): CommandResult {
    const { devices, deviceRemovals } = this.view;
    if (deviceRemovals.left === 0) {
      return { ok: false, code: 'device_removal_limit_reached', message: 'Devices can be removed 3 times in 30 days.' };
    }
    this.view = {
      ...this.view,
      devices: devices.filter((d) => d.id !== deviceId),
      deviceRemovals: {
        ...deviceRemovals,
        left: deviceRemovals.left - 1,
        nextFreesOn: deviceRemovals.nextFreesOn ?? 'Dec 9',
      },
    };
    return { ok: true };
  }

  ledgerMore(): void {
    if (this.view.ledgerNext === null) return;
    this.view = { ...this.view, ledger: [...this.view.ledger, ...olderEntries], ledgerNext: null };
  }
}
