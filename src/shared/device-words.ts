// The words for removing a computer (F3, F10 · c), from what the server says the removal cap leaves: the rule before
// a removal, and what one more removal leaves. Pure, and tested.
import type { DeviceRemovalsView } from './account';
import { plural } from './plan-words';

/** "You can remove 3 in 30 days.", "You can remove 1 more until Dec 6.", or, used up, when the next one frees up. */
export function removalRule(removals: DeviceRemovalsView): string {
  const { left, max, windowDays, nextFreesOn } = removals;
  if (left === 0) {
    const next = nextFreesOn ? ` The next removal is possible on ${nextFreesOn}.` : '';
    return `You've removed ${plural(max, 'computer')} in ${windowDays} days.${next}`;
  }
  if (left >= max || !nextFreesOn) return `You can remove ${max} in ${windowDays} days.`;
  return `You can remove ${left} more until ${nextFreesOn}.`;
}

/**
 * What a removal's confirmation says (F3 · b): the computer is signed out for good, and what the cap leaves after it.
 * A removal now frees up `windowDays` days from `now` when it is the only one counted.
 */
export function removalConfirmation(removals: DeviceRemovalsView, now: Date): string {
  const after = removals.left - 1;
  const until = removals.nextFreesOn ?? shortDay(new Date(now.getTime() + removals.windowDays * 86_400_000), now);
  const base = "It is signed out and can't be added back.";
  return after <= 0
    ? `${base} After this, you can't remove another until ${until}.`
    : `${base} After this, you can remove ${after} more until ${until}.`;
}

function shortDay(date: Date, now: Date): string {
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
