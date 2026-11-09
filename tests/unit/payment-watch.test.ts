import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentWatch, paymentWatchTiming, purchaseArrived } from '../../src/main/account/payment-watch';
import { previewAccount } from '../../src/main/preview/account';
import type { AccountView, MinutesLot } from '../../src/shared/account';

const topUp: MinutesLot = { source: 'Top-up', left: 100, granted: 100, expires: 'Nov 9, 2027' };
const withLots = (lots: MinutesLot[], usable = 187): AccountView => ({ ...previewAccount, minutes: { usable, lots } });
const before = withLots([{ source: 'Plan minutes', left: 0, granted: 400, expires: 'Dec 1' }], 0);
const after = withLots([{ source: 'Plan minutes', left: 0, granted: 400, expires: 'Dec 1' }, topUp], 100);

const noPlan: AccountView = {
  ...previewAccount,
  plan: {
    ...previewAccount.plan,
    id: null,
    name: 'No plan',
    state: 'none',
    until: null,
    renews: false,
    periodMinutes: 0,
  },
  minutes: { usable: 0, lots: [] },
};

describe('a purchase showing in the account (F8 · c)', () => {
  it('says how many minutes a top-up added, and until when they last', () => {
    expect(purchaseArrived({ topUpId: 'topup_100' }, before, after)).toBe(
      '100 minutes added. They last until Nov 9, 2027.',
    );
  });

  it('names the newest top-up when there was one already', () => {
    const older = { ...topUp, left: 40, expires: 'Mar 1, 2027' };

    expect(purchaseArrived({ topUpId: 'topup_100' }, withLots([older]), withLots([older, topUp]))).toBe(
      '100 minutes added. They last until Nov 9, 2027.',
    );
  });

  it('waits while no top-up was added', () => {
    expect(purchaseArrived({ topUpId: 'topup_100' }, before, before)).toBeNull();
    expect(purchaseArrived({ topUpId: 'topup_100' }, after, after)).toBeNull();
    expect(purchaseArrived({ topUpId: 'topup_100' }, before, { ...before, minutes: null })).toBeNull();
  });

  it("says a plan started, with the plan's own minutes", () => {
    const subscribed: AccountView = { ...previewAccount, minutes: { usable: 400, lots: [] } };

    expect(purchaseArrived({ planId: 'credits_monthly' }, noPlan, subscribed)).toBe(
      'Credits plan started: 400 minutes a month.',
    );
  });

  it("says the plan's minutes, not the balance, which holds what was left of a trial or a top-up", () => {
    const withLeftovers: AccountView = { ...previewAccount, minutes: { usable: 528, lots: [] } };

    expect(purchaseArrived({ planId: 'credits_monthly' }, noPlan, withLeftovers)).toBe(
      'Credits plan started: 400 minutes a month.',
    );
  });

  it('says an unmetered plan started without minutes', () => {
    const unlimited: AccountView = {
      ...previewAccount,
      plan: { ...previewAccount.plan, id: 'unlimited', name: 'Unlimited', periodMinutes: null, fairUseMinutes: 3600 },
      minutes: null,
    };

    expect(purchaseArrived({ planId: 'unlimited' }, noPlan, unlimited)).toBe('Unlimited plan started.');
  });

  it('waits while the account is not on the plan bought, or was on it already', () => {
    expect(purchaseArrived({ planId: 'unlimited' }, noPlan, previewAccount)).toBeNull();
    expect(purchaseArrived({ planId: 'credits_monthly' }, previewAccount, previewAccount)).toBeNull();
    expect(purchaseArrived({ planId: 'credits_monthly' }, noPlan, noPlan)).toBeNull();
  });

  it('takes a plan that starts overdue as started', () => {
    const due: AccountView = { ...previewAccount, plan: { ...previewAccount.plan, state: 'past_due' } };

    expect(purchaseArrived({ planId: 'credits_monthly' }, noPlan, due)).toMatch(/^Credits plan started/);
  });
});

describe('waiting for a payment (F8 · b)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function watch(reads: (AccountView | null)[]) {
    const arrived = vi.fn();
    const stale = vi.fn();
    const read = vi.fn(async () => (reads.length > 1 ? reads.shift()! : reads[0]!));
    return { watch: new PaymentWatch({ read, arrived, stale, now: () => Date.now() }), read, arrived, stale };
  }

  it('reads the account every few seconds until the purchase shows, then says so once and stops', async () => {
    const { watch: payments, read, arrived } = watch([before, before, after]);
    payments.start({ topUpId: 'topup_100' }, before);

    await vi.advanceTimersByTimeAsync(paymentWatchTiming.everyMs * 3);
    expect(arrived).toHaveBeenCalledExactlyOnceWith('100 minutes added. They last until Nov 9, 2027.');
    expect(payments.waiting).toBe(false);

    await vi.advanceTimersByTimeAsync(paymentWatchTiming.everyMs * 5);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('reads at once when the window comes back from the browser', async () => {
    const { watch: payments, read, arrived } = watch([after]);
    payments.start({ topUpId: 'topup_100' }, before);

    await payments.check();

    expect(read).toHaveBeenCalledOnce();
    expect(arrived).toHaveBeenCalledOnce();
  });

  it('keeps waiting through a read that failed', async () => {
    const { watch: payments, arrived } = watch([null, after]);
    payments.start({ topUpId: 'topup_100' }, before);

    await vi.advanceTimersByTimeAsync(paymentWatchTiming.everyMs);
    expect(arrived).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(paymentWatchTiming.everyMs);
    expect(arrived).toHaveBeenCalledOnce();
  });

  it('says once that it is a long wait, then reads every half minute until cancelled', async () => {
    const { watch: payments, read, stale, arrived } = watch([before]);
    payments.start({ topUpId: 'topup_100' }, before);

    await vi.advanceTimersByTimeAsync(paymentWatchTiming.staleAfterMs + paymentWatchTiming.everyMs);
    expect(stale).toHaveBeenCalledOnce();
    const reads = read.mock.calls.length;

    await vi.advanceTimersByTimeAsync(paymentWatchTiming.staleEveryMs * 4);
    expect(read.mock.calls.length - reads).toBe(4);
    expect(stale).toHaveBeenCalledOnce();
    expect(arrived).not.toHaveBeenCalled();
    expect(payments.waiting).toBe(true);

    payments.stop();
    await vi.advanceTimersByTimeAsync(paymentWatchTiming.staleEveryMs * 4);
    expect(read.mock.calls.length - reads).toBe(4);
  });

  it('stops reading when cancelled, and a read in flight answers nothing', async () => {
    let finish: (view: AccountView) => void = () => {};
    const arrived = vi.fn();
    const payments = new PaymentWatch({
      read: () => new Promise<AccountView>((resolve) => (finish = resolve)),
      arrived,
      stale: vi.fn(),
    });
    payments.start({ topUpId: 'topup_100' }, before);
    const check = payments.check();

    payments.stop();
    finish(after);
    await check;

    expect(arrived).not.toHaveBeenCalled();
  });

  it('waits for the newest purchase only, when another is started', async () => {
    const { watch: payments, arrived } = watch([after]);
    payments.start({ planId: 'unlimited' }, noPlan);
    payments.start({ topUpId: 'topup_100' }, before);

    await vi.advanceTimersByTimeAsync(paymentWatchTiming.everyMs);

    expect(arrived).toHaveBeenCalledExactlyOnceWith('100 minutes added. They last until Nov 9, 2027.');
  });

  it('reads one at a time', async () => {
    const reads: ((view: AccountView) => void)[] = [];
    const read = vi.fn(() => new Promise<AccountView>((resolve) => reads.push(resolve)));
    const payments = new PaymentWatch({ read, arrived: vi.fn(), stale: vi.fn() });
    payments.start({ topUpId: 'topup_100' }, before);

    void payments.check();
    void payments.check();

    expect(read).toHaveBeenCalledOnce();
    reads[0]!(before);
  });
});
