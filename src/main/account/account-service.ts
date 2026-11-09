// The account as the server knows it, and this computer's place in it. After sign-in it creates the user record
// (`GET /me`), registers this installation with its key, then reads the plan, the minutes, the devices and what is
// for sale. It also makes the account's changes the window asks for (the trial, a purchase, the portal, removing a
// computer) and signs the device proofs the hub asks for.
import { hostname } from 'node:os';
import type { AccountView, DeviceRemovalsView, DeviceView, LedgerEntry } from '../../shared/account';
import { ErrorCodes, Protocol } from '../../shared/contracts/sotto-contracts';
import type { Tier } from '../../shared/live/view-state';
import { ApiError, type RestClient } from '../api/rest-client';
import type { DeviceIdentity } from '../device/device-identity';
import { signDeviceProof } from '../device/proof';
import {
  shortDate,
  toAccountView,
  toLedgerEntries,
  type CatalogDto,
  type CreditsDto,
  type DeviceDto,
  type EntitlementsDto,
  type LedgerDto,
  type MeDto,
} from './account-mapping';

export interface AccountServiceDependencies {
  rest: Pick<RestClient, 'get' | 'post' | 'delete'>;
  device: DeviceIdentity;
  appVersion: string;
  /** `windows`, `macos` or `linux`: the names the API accepts. */
  platform: 'windows' | 'macos' | 'linux';
  fingerprint: () => Promise<string>;
  deviceName?: () => string;
  now?: () => Date;
}

export interface LoadedAccount {
  view: AccountView;
  /** The quality tier a session runs on: the plan's, with no choice (backend Q17). */
  tier: Tier;
}

/** The account's computers when this one can't be added (F3): the list to remove one from, and what the cap leaves. */
export interface DeviceLimitView {
  devices: DeviceView[];
  limit: number;
  removals: DeviceRemovalsView;
}

/** What a purchase buys: a plan, or a top-up of minutes. */
export type Purchase = { planId: string } | { topUpId: string };

/** How many ledger entries a page holds, the first one included. */
export const ledgerPageSize = 20;

/** Registration refusals that a new key answers. */
const keyRefusals: ReadonlySet<string> = new Set([
  ErrorCodes.Identity.DeviceKeyRevoked,
  ErrorCodes.Identity.DeviceKeyInUse,
]);

export class AccountService {
  constructor(private readonly deps: AccountServiceDependencies) {}

  private get now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async load(): Promise<LoadedAccount> {
    const { rest } = this.deps;
    // Creates the user record on the first call after sign-in (README, "Talking to a local backend").
    const me = await rest.get<MeDto>('/api/v1/me');
    const deviceId = await this.ensureDevice();
    // The minutes are read after the plan, and the ledger after the minutes: reading the credits grants a period that
    // just started (backend docs/03 §5), so a plan read as bought always comes with its minutes, never a read before.
    const entitlementsRead = rest.get<EntitlementsDto>('/api/v1/me/entitlements');
    const creditsRead = entitlementsRead.then(() => rest.get<CreditsDto>('/api/v1/me/credits'));
    const [entitlements, credits, ledger, devices, catalog] = await Promise.all([
      entitlementsRead,
      creditsRead,
      creditsRead.then(() => rest.get<LedgerDto>(`/api/v1/me/credits/ledger?limit=${ledgerPageSize}`)),
      rest.get<DeviceDto[]>('/api/v1/devices'),
      // What is for sale is the same for everyone: without it the screens offer nothing to buy, and the rest still shows.
      rest.get<CatalogDto>('/api/v1/billing/catalog').catch(() => null),
    ]);
    return {
      view: toAccountView({ me, entitlements, credits, ledger, devices, catalog, deviceId }, this.now),
      tier: entitlements.features.includes('smart_tier') ? 'smart' : 'fast',
    };
  }

  /** The ledger's page before entry `before` ("Show earlier", F10 · b). */
  async ledgerPage(before: number): Promise<{ entries: LedgerEntry[]; next: number | null }> {
    const page = await this.deps.rest.get<LedgerDto>(
      `/api/v1/me/credits/ledger?before=${before}&limit=${ledgerPageSize}`,
    );
    return { entries: toLedgerEntries(page, this.now), next: page.next };
  }

  /** Starts the free trial from this computer (F9 · a): device-bound, once per person and per computer. */
  async startTrial(): Promise<void> {
    const id = await this.registeredId();
    await this.deps.rest.post('/api/v1/me/trial', {
      proof: (token) => this.proof('POST', '/api/v1/me/trial', token, id),
    });
  }

  /** The provider's checkout page for a plan or a top-up; the purchase is finished there, in the browser. */
  async checkout(purchase: Purchase): Promise<string> {
    const { url } = await this.deps.rest.post<{ url: string }>('/api/v1/billing/checkout', { body: purchase });
    return url;
  }

  /** The provider's billing portal (plan, card, cancelling): device-bound, so a stolen token alone can't open it. */
  async portal(): Promise<string> {
    const id = await this.registeredId();
    const { url } = await this.deps.rest.post<{ url: string }>('/api/v1/billing/portal', {
      proof: (token) => this.proof('POST', '/api/v1/billing/portal', token, id),
    });
    return url;
  }

  /** Removes one of the account's other computers (F10 · c): it is signed out and can't be added back. */
  async removeDevice(deviceId: string): Promise<void> {
    const id = await this.registeredId();
    const path = `/api/v1/devices/${encodeURIComponent(deviceId)}`;
    await this.deps.rest.delete(path, { proof: (token) => this.proof('DELETE', path, token, id) });
  }

  /** The account's computers and what the removal cap leaves, read when this one can't be added (F3 · a). */
  async deviceLimit(): Promise<DeviceLimitView> {
    const { rest } = this.deps;
    const [me, entitlements, devices] = await Promise.all([
      rest.get<MeDto>('/api/v1/me'),
      rest.get<EntitlementsDto>('/api/v1/me/entitlements'),
      rest.get<DeviceDto[]>('/api/v1/devices'),
    ]);
    const view = toAccountView(
      {
        me,
        entitlements,
        credits: { balance: 0, lots: [] },
        ledger: { entries: [], next: null },
        devices,
        catalog: null,
        deviceId: null,
      },
      this.now,
    );
    return { devices: view.devices, limit: view.deviceLimit, removals: view.deviceRemovals };
  }

  /** Adds this computer in place of one of the account's (F3 · b): the named one is removed in the same step. */
  async replaceDevice(deviceId: string): Promise<string> {
    return this.register(deviceId);
  }

  /**
   * This computer's device id, registering it first when needed. The server answers `device_not_registered` for a
   * device it doesn't know as this account's (removed, lost, or another account's); registering again then decides
   * whether the key can stay. At the device limit it fails with `device_limit_reached` (F3).
   */
  async ensureDevice(): Promise<string> {
    const { rest, device } = this.deps;
    const known = await device.id();
    if (known) {
      try {
        await rest.get('/api/v1/devices/current', {
          proof: (token) => this.proof('GET', '/api/v1/devices/current', token, known),
        });
        return known;
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== ErrorCodes.Identity.DeviceNotRegistered) throw error;
      }
    }

    try {
      return await this.register();
    } catch (error) {
      // A removed key never comes back (`device_key_revoked`: the computer registers as a new device, J4), and a key
      // belongs to one account (`device_key_in_use`, after someone else signed in here). Either way: a new key, once.
      if (!(error instanceof ApiError) || !keyRefusals.has(error.code)) throw error;
      await device.forget();
      return this.register();
    }
  }

  private async register(replacesDeviceId?: string): Promise<string> {
    const { rest, device } = this.deps;
    const key = await device.keyPair();
    const registered = await rest.post<DeviceDto>('/api/v1/devices', {
      body: {
        // The server takes at most 100 characters.
        name: (this.deps.deviceName?.() ?? hostname()).slice(0, 100) || 'This computer',
        platform: this.deps.platform,
        appVersion: this.deps.appVersion,
        fingerprint: await this.deps.fingerprint(),
        ...(replacesDeviceId ? { replacesDeviceId } : {}),
      },
      proof: (token) =>
        signDeviceProof({
          privateKey: key.privateKey,
          htm: 'POST',
          htu: '/api/v1/devices',
          accessToken: token,
          jwk: key.publicJwk,
        }),
    });
    await device.remember(registered.id);
    return registered.id;
  }

  /** A proof for a hub command (`StartSession`, `ResumeSession`), bound to the token the connection was opened with. */
  async hubProof(method: string, accessToken: string): Promise<string> {
    return this.proof('HUB', method, accessToken, await this.registeredId());
  }

  /**
   * The proof a hub connection opens with, in its handshake: signed for that request as a REST proof is, GET and the
   * hub's path, whatever the transport makes of it (backend docs/04 §6). One per connection, bound to its token.
   */
  async connectProof(accessToken: string): Promise<string> {
    return this.proof('GET', Protocol.HubPath, accessToken, await this.registeredId());
  }

  /** "Dec 1", as the window writes dates. */
  shortDate(iso: string): string {
    return shortDate(iso, this.now);
  }

  private async registeredId(): Promise<string> {
    const id = await this.deps.device.id();
    if (!id) throw new ApiError(401, ErrorCodes.Identity.DeviceNotRegistered, 'This computer is not registered yet.');
    return id;
  }

  private async proof(htm: string, htu: string, accessToken: string, kid: string): Promise<string> {
    const { privateKey } = await this.deps.device.keyPair();
    return signDeviceProof({ privateKey, htm, htu, accessToken, kid });
  }
}
