import { describe, expect, it } from 'vitest';
import type { DeviceRemovalsView } from '../../src/shared/account';
import { removalConfirmation, removalRule } from '../../src/shared/device-words';

const now = new Date('2026-11-06T12:00:00Z');
const removals = (left: number, nextFreesOn: string | null): DeviceRemovalsView => ({
  left,
  max: 3,
  windowDays: 30,
  nextFreesOn,
});

describe("the removal rule's words (F3, F10 · c)", () => {
  it.each([
    [removals(3, null), 'You can remove 3 in 30 days.'],
    [removals(2, 'Dec 6'), 'You can remove 2 more until Dec 6.'],
    [removals(1, 'Dec 6'), 'You can remove 1 more until Dec 6.'],
    [removals(0, 'Dec 6'), "You've removed 3 computers in 30 days. The next removal is possible on Dec 6."],
    [removals(0, null), "You've removed 3 computers in 30 days."],
    [removals(2, null), 'You can remove 3 in 30 days.'],
  ])('%j reads %j', (view, words) => {
    expect(removalRule(view)).toBe(words);
  });

  it('follows the rule the server sends, whatever its numbers', () => {
    expect(removalRule({ left: 5, max: 5, windowDays: 7, nextFreesOn: null })).toBe('You can remove 5 in 7 days.');
    expect(removalRule({ left: 0, max: 1, windowDays: 7, nextFreesOn: 'Nov 13' })).toBe(
      "You've removed 1 computer in 7 days. The next removal is possible on Nov 13.",
    );
  });
});

describe("a removal's confirmation (F3 · b)", () => {
  it('says what is left after it, until the first removal frees up', () => {
    expect(removalConfirmation(removals(3, null), now)).toBe(
      "It is signed out and can't be added back. After this, you can remove 2 more until Dec 6.",
    );
    expect(removalConfirmation(removals(2, 'Nov 20'), now)).toBe(
      "It is signed out and can't be added back. After this, you can remove 1 more until Nov 20.",
    );
  });

  it('says when the next one is possible after the last removal the cap allows', () => {
    expect(removalConfirmation(removals(1, 'Nov 20'), now)).toBe(
      "It is signed out and can't be added back. After this, you can't remove another until Nov 20.",
    );
  });

  it('counts the window from now, into the next year when it crosses one', () => {
    expect(removalConfirmation(removals(3, null), new Date('2026-12-20T12:00:00Z'))).toBe(
      "It is signed out and can't be added back. After this, you can remove 2 more until Jan 19, 2027.",
    );
  });
});
