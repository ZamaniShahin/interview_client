// The account as the server knows it, and this computer's place in it. After sign-in it creates the user record
// (`GET /me`), registers this installation with its key, then reads the plan, the minutes and the devices. It also
// signs the device proofs the hub asks for.
import { hostname } from 'node:os';
import type { AccountView } from '../../shared/account';
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import type { Tier } from '../../shared/live/view-state';
import { ApiError, type RestClient } from '../api/rest-client';
import type { DeviceIdentity } from '../device/device-identity';
import { signDeviceProof } from '../device/proof';
import {
  toAccountView,
  type CreditsDto,
  type DeviceDto,
  type EntitlementsDto,
  type LedgerDto,
  type MeDto,
} from './account-mapping';

export interface AccountServiceDependencies {
  rest: Pick<RestClient, 'get' | 'post'>;
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

/** Registration refusals that a new key answers. */
const keyRefusals: ReadonlySet<string> = new Set([ErrorCodes.Identity.DeviceKeyRevoked, ErrorCodes.Identity.DeviceKeyInUse]);

export class AccountService {
  constructor(private readonly deps: AccountServiceDependencies) {}

  async load(): Promise<LoadedAccount> {
    const { rest } = this.deps;
    // Creates the user record on the first call after sign-in (README, "Talking to a local backend").
    const me = await rest.get<MeDto>('/api/v1/me');
    const deviceId = await this.ensureDevice();
    const [entitlements, credits, ledger, devices] = await Promise.all([
      rest.get<EntitlementsDto>('/api/v1/me/entitlements'),
      rest.get<CreditsDto>('/api/v1/me/credits'),
      rest.get<LedgerDto>('/api/v1/me/credits/ledger?limit=20'),
      rest.get<DeviceDto[]>('/api/v1/devices'),
    ]);
    return {
      view: toAccountView({ me, entitlements, credits, ledger, devices, deviceId }, this.deps.now?.() ?? new Date()),
      tier: entitlements.features.includes('smart_tier') ? 'smart' : 'fast',
    };
  }

  /**
   * This computer's device id, registering it first when needed. The server answers `device_not_registered` for a
   * device it doesn't know as this account's (removed, lost, or another account's); registering again then decides
   * whether the key can stay.
   */
  async ensureDevice(): Promise<string> {
    const { rest, device } = this.deps;
    const known = await device.id();
    if (known) {
      try {
        await rest.get('/api/v1/devices/current', { proof: (token) => this.proof('GET', '/api/v1/devices/current', token, known) });
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

  private async register(): Promise<string> {
    const { rest, device } = this.deps;
    const key = await device.keyPair();
    const registered = await rest.post<DeviceDto>('/api/v1/devices', {
      body: {
        // The server takes at most 100 characters.
        name: (this.deps.deviceName?.() ?? hostname()).slice(0, 100) || 'This computer',
        platform: this.deps.platform,
        appVersion: this.deps.appVersion,
        fingerprint: await this.deps.fingerprint(),
      },
      proof: (token) =>
        signDeviceProof({ privateKey: key.privateKey, htm: 'POST', htu: '/api/v1/devices', accessToken: token, jwk: key.publicJwk }),
    });
    await device.remember(registered.id);
    return registered.id;
  }

  /** A proof for a hub command (`StartSession`, `ResumeSession`), bound to the token the connection was opened with. */
  async hubProof(method: string, accessToken: string): Promise<string> {
    const id = await this.deps.device.id();
    if (!id) throw new ApiError(401, ErrorCodes.Identity.DeviceNotRegistered, 'This computer is not registered yet.');
    return this.proof('HUB', method, accessToken, id);
  }

  private async proof(htm: string, htu: string, accessToken: string, kid: string): Promise<string> {
    const { privateKey } = await this.deps.device.keyPair();
    return signDeviceProof({ privateKey, htm, htu, accessToken, kid });
  }
}
