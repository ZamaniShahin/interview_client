// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LedgerRow from '../../src/renderer/app/components/LedgerRow.vue';
import type { LedgerEntry } from '../../src/shared/account';

const entry = (change: Partial<LedgerEntry>): LedgerEntry => ({
  date: 'Nov 8',
  kind: 'Session',
  detail: '42 minutes',
  minutes: -42,
  balanceAfter: 442,
  ...change,
});

describe('a ledger row', () => {
  it('shows what the change was and how long, with the sign and the balance after', () => {
    const text = mount(LedgerRow, { props: { entry: entry({}) } }).text();

    expect(text).toContain('Session · 42 minutes');
    expect(text).toContain('−42');
    expect(text).toContain('442');
  });

  it('leaves no separator behind when there is no detail', () => {
    const text = mount(LedgerRow, {
      props: { entry: entry({ kind: 'Trial minutes', detail: '', minutes: 30, balanceAfter: 30 }) },
    }).text();

    expect(text).toContain('Trial minutes');
    expect(text).not.toContain('·');
    expect(text).toContain('+30');
  });

  it('shows no sign on a change of nothing', () => {
    const text = mount(LedgerRow, {
      props: { entry: entry({ detail: '0 minutes', minutes: 0, balanceAfter: 30 }) },
    }).text();

    expect(text).not.toContain('−0');
    expect(text).not.toContain('+0');
  });
});
