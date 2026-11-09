// Waiting for a purchase finished in the browser (F8 · b): the account is read again every few seconds until what was
// bought shows in it, then one quiet line says so (F8 · c). Outside a session the app has no hub connection, and the
// server's push (EntitlementsUpdated) reaches only a connected app, so reading is how the app learns of a payment.
import type { AccountView } from '../../shared/account';
import type { Purchase } from './account-service';

export interface PaymentWatchDependencies {
  /** The account read again; null when it couldn't be (tried again at the next tick). */
  read: () => Promise<AccountView | null>;
  /** What was bought showed: `notice` is the line that says so. */
  arrived: (notice: string) => void;
  /** Nothing showed for a long while: the window says so, once, and the reads slow down until the user cancels. */
  stale: () => void;
  timing?: Partial<typeof paymentWatchTiming>;
  now?: () => number;
}

/** How often the account is read while waiting, when the wait is said to be long, and how often after that. */
export const paymentWatchTiming = { everyMs: 3_000, staleAfterMs: 15 * 60_000, staleEveryMs: 30_000 };

export class PaymentWatch {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private purchase: Purchase | null = null;
  private before: AccountView | null = null;
  private startedAt = 0;
  private saidStale = false;
  private reading = false;

  constructor(private readonly deps: PaymentWatchDependencies) {}

  get waiting(): boolean {
    return this.purchase !== null;
  }

  /** Starts waiting for `purchase`, against the account as it was before it. */
  start(purchase: Purchase, before: AccountView): void {
    this.stop();
    this.purchase = purchase;
    this.before = before;
    this.startedAt = this.now();
    this.saidStale = false;
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.purchase = null;
    this.before = null;
  }

  /** Reads the account now (the window came back from the browser), as every tick does. One read at a time. */
  async check(): Promise<void> {
    const purchase = this.purchase;
    const before = this.before;
    if (!purchase || !before || this.reading) return;
    this.reading = true;
    try {
      const after = await this.deps.read();
      // Stopped, or started again for another purchase, meanwhile: this read answers nothing any more.
      if (!after || this.purchase !== purchase) return;
      const notice = purchaseArrived(purchase, before, after);
      if (notice) {
        this.stop();
        this.deps.arrived(notice);
      }
    } finally {
      this.reading = false;
    }
  }

  private schedule(): void {
    const timing = { ...paymentWatchTiming, ...this.deps.timing };
    const stale = this.now() - this.startedAt >= timing.staleAfterMs;
    if (stale && !this.saidStale) {
      this.saidStale = true;
      this.deps.stale();
    }
    this.timer = setTimeout(
      () => {
        void this.check().finally(() => {
          if (this.purchase) this.schedule();
        });
      },
      stale ? timing.staleEveryMs : timing.everyMs,
    );
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

/** The line that says a purchase arrived, once the account shows it; null while it doesn't. */
export function purchaseArrived(purchase: Purchase, before: AccountView, after: AccountView): string | null {
  if ('topUpId' in purchase) {
    const added = topUps(after).length > topUps(before).length;
    const newest = topUps(after).at(-1);
    if (!added || !newest) return null;
    // Lots come soonest-expiring first, so a top-up just bought is the last of them.
    return `${newest.granted} minutes added. They last until ${newest.expires}.`;
  }
  const { plan } = after;
  const onIt = plan.id === purchase.planId && (plan.state === 'active' || plan.state === 'past_due');
  const already = before.plan.id === purchase.planId && before.plan.state === plan.state;
  if (!onIt || already) return null;
  // The plan's own numbers, not the balance: that also holds whatever was left of the trial or a top-up.
  return plan.periodMinutes !== null
    ? `${plan.name} plan started: ${plan.periodMinutes} minutes a month.`
    : `${plan.name} plan started.`;
}

function topUps(account: AccountView) {
  return account.minutes?.lots.filter((lot) => lot.source === 'Top-up') ?? [];
}
