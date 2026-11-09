// The REST API's views (camelCase JSON, backend src/Modules/*/Features) shaped for the window (src/shared/account.ts).
// Pure, so it is tested without a server. Nothing here decides anything: the server enforces every limit.
import type { AccountView, PlanState } from '../../shared/account';

export interface MeDto {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  createdAt: string;
}

export interface EntitlementsDto {
  accountId: string;
  planId: string | null;
  planName: string;
  state: string;
  features: string[];
  limits: {
    liveMinutesPerPeriod: number | null;
    fairUseMinutesPerPeriod: number | null;
    maxSessionMinutes: number;
    devices: number;
  };
  validUntil: string | null;
}

export interface CreditsDto {
  balance: number;
  lots: { source: string; granted: number; remaining: number; grantedAt: string; expiresAt: string | null }[];
}

export interface LedgerDto {
  entries: {
    number: number;
    type: string;
    minutes: number;
    balanceAfter: number;
    sessionId: string | null;
    createdAt: string;
  }[];
  next: number | null;
}

export interface DeviceDto {
  id: string;
  name: string;
  platform: string;
  appVersion: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface AccountSources {
  me: MeDto;
  entitlements: EntitlementsDto;
  credits: CreditsDto;
  ledger: LedgerDto;
  devices: DeviceDto[];
  /** This computer's device id, to mark it in the list. */
  deviceId: string | null;
}

const planStates: readonly PlanState[] = ['none', 'trialing', 'active', 'past_due', 'cancelled', 'suspended'];

const lotSources: Record<string, string> = {
  trial: 'Trial',
  plan: 'Plan minutes',
  purchase: 'Top-up',
  adjustment: 'Adjustment',
};

const ledgerKinds: Record<string, string> = {
  grant_trial: 'Trial minutes',
  grant_plan: 'Plan minutes',
  purchase: 'Top-up',
  debit_live: 'Session',
  debit_practice: 'Practice',
  refund: 'Refund',
  expiry: 'Expired',
  adjustment: 'Adjustment',
};

const platforms: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

export function toAccountView(sources: AccountSources, now: Date): AccountView {
  const { me, entitlements, credits, ledger, devices, deviceId } = sources;
  // A plan with fair use and no minute allowance (Unlimited) shows no minutes.
  const unlimited =
    entitlements.limits.liveMinutesPerPeriod === null && entitlements.limits.fairUseMinutesPerPeriod !== null;
  return {
    user: { name: me.displayName || me.email, emailMasked: maskEmail(me.email) },
    plan: {
      name: entitlements.planName,
      state: planStates.includes(entitlements.state as PlanState) ? (entitlements.state as PlanState) : 'none',
      renewsOn: entitlements.validUntil ? shortDate(entitlements.validUntil, now) : null,
    },
    minutes: unlimited
      ? null
      : {
          usable: credits.balance,
          lots: credits.lots.map((lot) => ({
            source: lotSources[lot.source] ?? lot.source,
            left: lot.remaining,
            granted: lot.granted,
            expires: lot.expiresAt ? shortDate(lot.expiresAt, now) : 'never',
          })),
        },
    ledger: ledger.entries.map((entry) => ({
      date: shortDate(entry.createdAt, now),
      kind: ledgerKinds[entry.type] ?? entry.type,
      detail: entry.type.startsWith('debit_') ? `${Math.abs(entry.minutes)} minutes` : '',
      minutes: entry.minutes,
      balanceAfter: entry.balanceAfter,
    })),
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      platform: platforms[device.platform] ?? device.platform,
      appVersion: device.appVersion,
      firstSeen: shortDate(device.createdAt, now),
      lastSeen: device.id === deviceId ? 'now' : lastSeen(device.lastSeenAt, now),
      isThisComputer: device.id === deviceId,
    })),
    deviceLimit: entitlements.limits.devices,
    // The documents live on this computer, with the first run and the local database (1.14).
    readiness: { resume: null, jobDescription: null, soundCheck: null },
  };
}

/** "Nov 6", or "Nov 4, 2027" in another year. */
export function shortDate(iso: string, now: Date): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function lastSeen(iso: string, now: Date): string {
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return shortDate(iso, now);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "s•••@example.com": the window may be on a shared screen outside a session. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? `${email[0]}•••${email.slice(at)}` : email;
}
