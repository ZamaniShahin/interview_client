// What the window shows of the account, read from the REST API (backend docs/03 §5; main/account/account-mapping.ts),
// or the development preview's. Nothing here decides anything: the server enforces every limit.

/** The server's entitlement states. A cancelled plan is `active` until its end, with `renews` false. */
export type PlanState = 'none' | 'trialing' | 'active' | 'past_due' | 'suspended';

export interface MinutesLot {
  /** "Plan minutes", "Top-up", "Trial". */
  source: string;
  left: number;
  granted: number;
  /** A display date, such as "Dec 1". */
  expires: string;
}

export interface LedgerEntry {
  /** The entry's number, newest highest: the key a page of the ledger is read before. */
  number: number;
  date: string;
  /** "Session", "Practice", "Plan minutes", "Top-up", "Expired"… */
  kind: string;
  detail: string;
  /** Signed: +400, −42. */
  minutes: number;
  balanceAfter: number;
}

export interface DeviceView {
  id: string;
  name: string;
  platform: string;
  appVersion: string;
  firstSeen: string;
  lastSeen: string;
  isThisComputer: boolean;
}

export interface PlanView {
  /** `credits_monthly`, `unlimited`, `trial`; null without a plan. */
  id: string | null;
  /** The server's name: "Credits", "Unlimited", "Trial", "No plan". */
  name: string;
  state: PlanState;
  /** When the plan renews, ends, or (past due) must be paid by: "Dec 1"; null without one. */
  until: string | null;
  /** Whether the plan goes on past `until` by itself; never a trial, a cancelled plan or a licence. */
  renews: boolean;
  /** Given by Sotto through its licence registry, with no payment (backend 2.16): no billing for it here. */
  licensed: boolean;
  /** Whole days left until `until` (trial · 9 days left); null without one. */
  daysLeft: number | null;
  /** Live minutes a period gives; null on Unlimited, which has `fairUseMinutes` instead. */
  periodMinutes: number | null;
  fairUseMinutes: number | null;
  /** The longest session the plan allows; 0 without one. */
  maxSessionMinutes: number;
  smart: boolean;
}

/** The user's free trial: had or not, and when it ends or ended while it is the account's latest plan. */
export interface TrialView {
  used: boolean;
  endsOn: string | null;
}

/** What the device removal cap leaves (backend docs/05 §7): `left` of `max` in `windowDays` days. */
export interface DeviceRemovalsView {
  left: number;
  max: number;
  windowDays: number;
  /** When the oldest removal counted stops counting: "Dec 6"; null while none counts. */
  nextFreesOn: string | null;
}

/** A plan for sale (`GET /api/v1/billing/catalog`). Prices stay on the payment page (Q3). */
export interface PlanOffer {
  id: string;
  name: string;
  periodMinutes: number | null;
  fairUseMinutes: number | null;
  maxSessionMinutes: number;
  devices: number;
  smart: boolean;
}

export interface TopUpOffer {
  id: string;
  minutes: number;
  validDays: number;
}

export interface TrialOffer {
  days: number;
  minutes: number | null;
  maxSessionMinutes: number;
  devices: number;
  smart: boolean;
}

/** What can be had: nothing in the app names a plan or a number of its own. */
export interface CatalogView {
  /** Whether buying works here (a payment provider is set up). */
  purchases: boolean;
  plans: PlanOffer[];
  topUps: TopUpOffer[];
  /** Null while trials are off. */
  trial: TrialOffer | null;
}

export interface AccountView {
  user: { name: string; emailMasked: string; emailVerified: boolean };
  plan: PlanView;
  trial: TrialView;
  /** Null on a plan without minutes (Unlimited). */
  minutes: { usable: number; lots: MinutesLot[] } | null;
  ledger: LedgerEntry[];
  /** The `before` of the ledger's next page, or null when it is all shown. */
  ledgerNext: number | null;
  devices: DeviceView[];
  deviceLimit: number;
  deviceRemovals: DeviceRemovalsView;
  /** Null when the catalog couldn't be read: the plan screens then offer nothing to buy. */
  catalog: CatalogView | null;
  /** What a session needs: AUTO needs the résumé and the job description. */
  readiness: { resume: string | null; jobDescription: string | null; soundCheck: string | null };
}
