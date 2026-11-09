// The REST API's views (camelCase JSON, backend src/Modules/*/Features) shaped for the window (src/shared/account.ts).
// Pure, so it is tested without a server. Nothing here decides anything: the server enforces every limit.
import type { AccountView, CatalogView, LedgerEntry, PlanOffer, PlanState } from '../../shared/account';

export interface MeDto {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  createdAt: string;
  deviceRemovals: { left: number; max: number; windowDays: number; nextFreesAt: string | null };
}

export interface LimitsDto {
  liveMinutesPerPeriod: number | null;
  fairUseMinutesPerPeriod: number | null;
  maxSessionMinutes: number;
  devices: number;
}

export interface EntitlementsDto {
  accountId: string;
  planId: string | null;
  planName: string;
  state: string;
  features: string[];
  limits: LimitsDto;
  validUntil: string | null;
  renews: boolean;
  trialUsed: boolean;
  trialEndsAt: string | null;
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

interface PlanDescriptionDto {
  id: string;
  name: string;
  features: string[];
  limits: LimitsDto;
}

export interface CatalogDto {
  purchases: boolean;
  plans: PlanDescriptionDto[];
  topUps: { id: string; minutes: number; validDays: number }[];
  trial: { days: number; plan: PlanDescriptionDto } | null;
}

export interface AccountSources {
  me: MeDto;
  entitlements: EntitlementsDto;
  credits: CreditsDto;
  ledger: LedgerDto;
  devices: DeviceDto[];
  /** Null when it couldn't be read: the screens then offer nothing to buy. */
  catalog: CatalogDto | null;
  /** This computer's device id, to mark it in the list. */
  deviceId: string | null;
}

const planStates: readonly PlanState[] = ['none', 'trialing', 'active', 'past_due', 'suspended'];

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

const dayMs = 86_400_000;

export function toAccountView(sources: AccountSources, now: Date): AccountView {
  const { me, entitlements, credits, ledger, devices, catalog, deviceId } = sources;
  const { limits } = entitlements;
  // A plan with fair use and no minute allowance (Unlimited) shows no minutes.
  const unlimited = limits.liveMinutesPerPeriod === null && limits.fairUseMinutesPerPeriod !== null;
  return {
    user: { name: me.displayName || me.email, emailMasked: maskEmail(me.email), emailVerified: me.emailVerified },
    plan: {
      id: entitlements.planId,
      name: entitlements.planName,
      state: planStates.includes(entitlements.state as PlanState) ? (entitlements.state as PlanState) : 'none',
      until: entitlements.validUntil ? shortDate(entitlements.validUntil, now) : null,
      renews: entitlements.renews,
      daysLeft: entitlements.validUntil ? daysUntil(entitlements.validUntil, now) : null,
      periodMinutes: limits.liveMinutesPerPeriod,
      fairUseMinutes: limits.fairUseMinutesPerPeriod,
      maxSessionMinutes: limits.maxSessionMinutes,
      smart: entitlements.features.includes('smart_tier'),
    },
    trial: {
      used: entitlements.trialUsed,
      endsOn: entitlements.trialEndsAt ? shortDate(entitlements.trialEndsAt, now) : null,
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
    ledger: toLedgerEntries(ledger, now),
    ledgerNext: ledger.next,
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      platform: platforms[device.platform] ?? device.platform,
      appVersion: device.appVersion,
      firstSeen: shortDate(device.createdAt, now),
      lastSeen: device.id === deviceId ? 'now' : lastSeen(device.lastSeenAt, now),
      isThisComputer: device.id === deviceId,
    })),
    deviceLimit: limits.devices,
    deviceRemovals: {
      left: me.deviceRemovals.left,
      max: me.deviceRemovals.max,
      windowDays: me.deviceRemovals.windowDays,
      nextFreesOn: me.deviceRemovals.nextFreesAt ? shortDate(me.deviceRemovals.nextFreesAt, now) : null,
    },
    catalog: catalog ? toCatalogView(catalog) : null,
    // The documents live on this computer, with the first run and the local database (1.14).
    readiness: { resume: null, jobDescription: null, soundCheck: null },
  };
}

/** One page of the ledger, newest first, as the window lists it. */
export function toLedgerEntries(ledger: LedgerDto, now: Date): LedgerEntry[] {
  return ledger.entries.map((entry) => ({
    number: entry.number,
    date: shortDate(entry.createdAt, now),
    kind: ledgerKinds[entry.type] ?? entry.type,
    detail: entry.type.startsWith('debit_') ? `${Math.abs(entry.minutes)} minutes` : '',
    minutes: entry.minutes,
    balanceAfter: entry.balanceAfter,
  }));
}

export function toCatalogView(catalog: CatalogDto): CatalogView {
  const offer = (plan: PlanDescriptionDto): PlanOffer => ({
    id: plan.id,
    name: plan.name,
    periodMinutes: plan.limits.liveMinutesPerPeriod,
    fairUseMinutes: plan.limits.fairUseMinutesPerPeriod,
    maxSessionMinutes: plan.limits.maxSessionMinutes,
    devices: plan.limits.devices,
    smart: plan.features.includes('smart_tier'),
  });
  const trial = catalog.trial ? offer(catalog.trial.plan) : null;
  return {
    purchases: catalog.purchases,
    plans: catalog.plans.map(offer),
    topUps: catalog.topUps.map((topUp) => ({ id: topUp.id, minutes: topUp.minutes, validDays: topUp.validDays })),
    trial:
      catalog.trial && trial
        ? {
            days: catalog.trial.days,
            minutes: trial.periodMinutes,
            maxSessionMinutes: trial.maxSessionMinutes,
            devices: trial.devices,
            smart: trial.smart,
          }
        : null,
  };
}

/** "Nov 6", or "Nov 4, 2027" in another year. */
export function shortDate(iso: string, now: Date): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Whole days until `iso`, counting a part of a day as one ("9 days left"); 0 once it has passed. */
export function daysUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / dayMs));
}

function lastSeen(iso: string, now: Date): string {
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / dayMs);
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
