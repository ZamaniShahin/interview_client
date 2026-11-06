// What the window shows of the account. It is read from the REST API (backend docs/03 §5) from checkpoint 1.10 on;
// until then only the development preview fills it. Nothing here decides anything: the server enforces every limit.

export type PlanState = 'none' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';

export interface MinutesLot {
  /** "Plan minutes", "Top-up", "Trial". */
  source: string;
  left: number;
  granted: number;
  /** A display date, such as "Dec 1". */
  expires: string;
}

export interface LedgerEntry {
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

export interface AccountView {
  user: { name: string; emailMasked: string };
  plan: { name: string; state: PlanState; renewsOn: string | null };
  /** Null on a plan without minutes (Unlimited). */
  minutes: { usable: number; lots: MinutesLot[] } | null;
  ledger: LedgerEntry[];
  devices: DeviceView[];
  deviceLimit: number;
  /** What a session needs: AUTO needs the résumé and the job description. */
  readiness: { resume: string | null; jobDescription: string | null; soundCheck: string | null };
}
