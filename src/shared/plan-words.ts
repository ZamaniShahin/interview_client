// The words for the account's plan, wherever they show (the sidebar, Home, Account): one function, so the state always
// has a word (F10 · d) and every page says the same. Pure, and tested state by state.
import type { AccountView, CatalogView, PlanOffer, TopUpOffer, TrialOffer } from './account';

export interface PlanWords {
  /** The small label above: "Minutes", "Trial". */
  eyebrow: string;
  /** The line in large type: "187 min left", "22 min · 9 days", "Unlimited", "No plan yet". */
  headline: string;
  /** The line under it: "Credits plan · renews Dec 1", "Ends Nov 15", "Payment due · Nov 9". */
  detail: string;
  /** The state's word beside the plan's name (F10 · d): "Active", "Trial · 9 days left", "Cancelled · runs until Dec 1". */
  tag: string;
}

export function planWords(account: AccountView): PlanWords {
  const { plan, minutes, trial } = account;
  const left = minutes ? `${minutes.usable} min left` : 'Unlimited';
  const named = `${plan.name} plan`;
  switch (plan.state) {
    case 'trialing': {
      const days = plan.daysLeft === null ? '' : ` · ${plural(plan.daysLeft, 'day')}`;
      return {
        eyebrow: 'Trial',
        headline: `${minutes?.usable ?? 0} min${days}`,
        detail: plan.until ? `Ends ${plan.until}` : 'Trial',
        tag: plan.daysLeft === null ? 'Trial' : `Trial · ${plural(plan.daysLeft, 'day')} left`,
      };
    }
    case 'active':
      return plan.renews
        ? {
            eyebrow: 'Minutes',
            headline: left,
            detail: plan.until ? `${named} · renews ${plan.until}` : named,
            tag: 'Active',
          }
        : {
            eyebrow: 'Minutes',
            headline: left,
            detail: plan.until ? `${named} · ends ${plan.until}` : named,
            tag: plan.until ? `Cancelled · runs until ${plan.until}` : 'Cancelled',
          };
    case 'past_due':
      return {
        eyebrow: 'Minutes',
        headline: left,
        detail: plan.until ? `Payment due · ${plan.until}` : 'Payment due',
        tag: 'Payment due',
      };
    case 'suspended':
      return { eyebrow: 'Minutes', headline: 'Suspended', detail: 'Your account is suspended.', tag: 'Suspended' };
    case 'none':
      if (trial.used && trial.endsOn) {
        return { eyebrow: 'Minutes', headline: 'No plan', detail: `The trial ended ${trial.endsOn}`, tag: 'No plan' };
      }
      if (trial.used || !account.catalog?.trial) {
        return { eyebrow: 'Minutes', headline: 'No plan', detail: 'Pick a plan to start sessions', tag: 'No plan' };
      }
      return { eyebrow: 'Minutes', headline: 'No plan yet', detail: 'Start the trial, or pick a plan', tag: 'No plan' };
  }
}

/** The trial is offered on Home (F9 · a) only to someone who never had one, while trials are on. */
export function trialOffered(account: AccountView): TrialOffer | null {
  return account.plan.state === 'none' && !account.trial.used ? (account.catalog?.trial ?? null) : null;
}

/**
 * Top-ups add minutes to a plan that has them (a trial's included), so they are offered only then: without such a plan
 * the server refuses them (`no_entitlement`), and on Unlimited there is nothing to add to.
 */
export function topUpsOffered(account: AccountView): TopUpOffer[] {
  const { plan, catalog } = account;
  const hasMinutes =
    plan.periodMinutes !== null && (plan.state === 'active' || plan.state === 'past_due' || plan.state === 'trialing');
  return catalog?.purchases && hasMinutes ? catalog.topUps : [];
}

/**
 * The plans a user can buy here: none for a subscriber, who changes plan in the provider's portal (the server answers
 * `already_subscribed`), and none where nothing can be bought.
 */
export function plansOffered(account: AccountView): PlanOffer[] {
  return account.catalog?.purchases && !subscribed(account) ? account.catalog.plans : [];
}

/** A paid plan that renews or was paid for: changing it, the card or cancelling happen in the provider's portal. */
export function subscribed(account: AccountView): boolean {
  const { plan } = account;
  return (plan.state === 'active' || plan.state === 'past_due') && plan.id !== null && plan.id !== 'trial';
}

/** A plan card's lines (F9 · c): "400 minutes a month, sessions up to 120", "Smart answers · 3 computers". */
export function offerLines(offer: PlanOffer): string[] {
  const minutes =
    offer.periodMinutes !== null
      ? `${offer.periodMinutes} minutes a month`
      : offer.fairUseMinutes !== null
        ? `Fair use, up to ${hours(offer.fairUseMinutes)} a month`
        : 'No live minutes';
  return [
    `${minutes}, sessions up to ${offer.maxSessionMinutes} minutes`,
    `${offer.smart ? 'Smart answers' : 'Fast answers'} · ${plural(offer.devices, 'computer')}`,
  ];
}

/** The trial's lines (F9 · a): "30 minutes over 14 days", "Sessions up to 10 minutes, fast answers", "2 computers". */
export function trialLines(trial: TrialOffer): string[] {
  return [
    `${trial.minutes ?? 0} minutes over ${plural(trial.days, 'day')}`,
    `Sessions up to ${trial.maxSessionMinutes} minutes, ${trial.smart ? 'smart' : 'fast'} answers`,
    plural(trial.devices, 'computer'),
  ];
}

/** "+100 minutes", and how long they last: "Valid for 12 months, used after your plan's minutes." */
export function topUpLines(topUp: TopUpOffer): { title: string; detail: string } {
  return {
    title: `+${topUp.minutes} minutes`,
    detail: `Valid for ${validity(topUp.validDays)}, used after your plan's minutes.`,
  };
}

/** 365 days → "12 months", 90 → "3 months", 45 → "45 days". */
function validity(days: number): string {
  if (days % 365 === 0) return plural((days / 365) * 12, 'month');
  return days >= 60 ? plural(Math.round(days / 30.4), 'month') : plural(days, 'day');
}

/** The catalog's plan other than the user's, to offer after a session ran out (F8 · a's "Or change plan"). */
export function otherPlans(account: AccountView, catalog: CatalogView | null = account.catalog): PlanOffer[] {
  return (catalog?.plans ?? []).filter((offer) => offer.id !== account.plan.id);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** 3600 minutes → "60 hours". */
function hours(minutes: number): string {
  return minutes % 60 === 0 ? plural(minutes / 60, 'hour') : plural(minutes, 'minute');
}
