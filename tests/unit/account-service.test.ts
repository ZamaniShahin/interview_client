import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from '../../src/main/account/account-service';
import { ApiError, type RequestOptions } from '../../src/main/api/rest-client';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import { DeviceIdentity } from '../../src/main/device/device-identity';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';

interface Call {
  method: string;
  path: string;
  body: unknown;
  proof: { header: Record<string, unknown>; payload: Record<string, unknown> } | null;
}

function decode(proof: string) {
  const [header, payload] = proof.split('.');
  return {
    header: JSON.parse(Buffer.from(header!, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<string, unknown>,
  };
}

const device = (id: string) => ({
  id,
  name: 'Test PC',
  platform: 'windows',
  appVersion: '0.1.0',
  createdAt: '2026-11-01T12:00:00Z',
  lastSeenAt: '2026-11-08T12:00:00Z',
});

/** Plays the REST API: one answer (or a queue of them) per route, and every call kept with its proof read back. */
class FakeRest {
  readonly calls: Call[] = [];
  readonly answers = new Map<string, (() => unknown)[]>();

  constructor() {
    this.answer('GET /api/v1/me', () => ({ id: 'u1', email: 'sam@example.com', emailVerified: true, displayName: 'Sam', createdAt: '2026-11-01T12:00:00Z' }));
    this.answer('GET /api/v1/me/entitlements', () => entitlements(['smart_tier', 'practice']));
    this.answer('GET /api/v1/me/credits', () => ({ balance: 120, lots: [] }));
    this.answer('GET /api/v1/me/credits/ledger?limit=20', () => ({ entries: [], next: null }));
    this.answer('GET /api/v1/devices', () => [device('d1')]);
    this.answer('POST /api/v1/devices', () => device('d1'));
    this.answer('GET /api/v1/devices/current', () => device('d1'));
  }

  /** Replaces a route's answers; the last one repeats. */
  answer(route: string, ...answers: (() => unknown)[]): void {
    this.answers.set(route, answers);
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.handle('GET', path, options) as Promise<T>;
  }

  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.handle('POST', path, options) as Promise<T>;
  }

  private async handle(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    const proof = options.proof ? decode(await options.proof('access-token')) : null;
    this.calls.push({ method, path, body: options.body, proof });
    const queue = this.answers.get(`${method} ${path}`);
    if (!queue?.length) throw new Error(`Nothing answers ${method} ${path}.`);
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    return next();
  }

  routes(): string[] {
    return this.calls.map((call) => `${call.method} ${call.path}`);
  }
}

function entitlements(features: string[]) {
  return {
    accountId: 'a1',
    planId: 'pro',
    planName: 'Pro',
    state: 'active',
    features,
    limits: { liveMinutesPerPeriod: 600, fairUseMinutesPerPeriod: null, maxSessionMinutes: 120, devices: 3 },
    validUntil: null,
  };
}

const refuse = (status: number, code: string) => () => {
  throw new ApiError(status, code, `Refused: ${code}.`);
};

describe('the account service', () => {
  let rest: FakeRest;
  let identity: DeviceIdentity;
  let service: AccountService;

  beforeEach(() => {
    rest = new FakeRest();
    identity = new DeviceIdentity(new MemorySecretStore());
    service = new AccountService({
      rest,
      device: identity,
      appVersion: '0.1.0',
      platform: 'windows',
      fingerprint: async () => 'f'.repeat(64),
      deviceName: () => 'Test PC',
      now: () => new Date('2026-11-08T12:00:00Z'),
    });
  });

  it('registers this computer the first time, with a proof that carries its new key', async () => {
    const loaded = await service.load();

    expect(rest.routes().slice(0, 2)).toEqual(['GET /api/v1/me', 'POST /api/v1/devices']);
    const registration = rest.calls[1]!;
    expect(registration.body).toEqual({ name: 'Test PC', platform: 'windows', appVersion: '0.1.0', fingerprint: 'f'.repeat(64) });
    expect(registration.proof!.header['jwk']).toEqual((await identity.keyPair()).publicJwk);
    expect(registration.proof!.header).not.toHaveProperty('kid');
    expect(registration.proof!.payload).toMatchObject({ htm: 'POST', htu: '/api/v1/devices' });
    expect(await identity.id()).toBe('d1');
    expect(loaded.view.devices[0]!.isThisComputer).toBe(true);
  });

  it('checks a computer it registered before with a proof that names it, and registers nothing', async () => {
    await identity.keyPair();
    await identity.remember('d1');

    await service.load();

    expect(rest.routes()).not.toContain('POST /api/v1/devices');
    const check = rest.calls.find((call) => call.path === '/api/v1/devices/current')!;
    expect(check.proof!.header['kid']).toBe('d1');
    expect(check.proof!.payload).toMatchObject({ htm: 'GET', htu: '/api/v1/devices/current' });
  });

  it('registers again, with the same key, when the server no longer knows this computer', async () => {
    const key = await identity.keyPair();
    await identity.remember('d1');
    rest.answer('GET /api/v1/devices/current', refuse(401, ErrorCodes.Identity.DeviceNotRegistered));

    await service.load();

    const registration = rest.calls.find((call) => call.method === 'POST')!;
    expect(registration.proof!.header['jwk']).toEqual(key.publicJwk);
  });

  it('makes a new key when the old one was removed from the account', async () => {
    const old = await identity.keyPair();
    await identity.remember('d1');
    rest.answer('GET /api/v1/devices/current', refuse(401, ErrorCodes.Identity.DeviceNotRegistered));
    rest.answer('POST /api/v1/devices', refuse(409, ErrorCodes.Identity.DeviceKeyRevoked), () => device('d2'));
    rest.answer('GET /api/v1/devices', () => [device('d2')]);

    await service.load();

    const registrations = rest.calls.filter((call) => call.method === 'POST');
    expect(registrations).toHaveLength(2);
    expect(registrations[0]!.proof!.header['jwk']).toEqual(old.publicJwk);
    expect(registrations[1]!.proof!.header['jwk']).not.toEqual(old.publicJwk);
    expect(await identity.id()).toBe('d2');
  });

  it('makes a key of its own when another account holds this one', async () => {
    rest.answer('POST /api/v1/devices', refuse(409, ErrorCodes.Identity.DeviceKeyInUse), () => device('d3'));

    await service.load();

    expect(rest.calls.filter((call) => call.method === 'POST')).toHaveLength(2);
    expect(await identity.id()).toBe('d3');
  });

  it("stops at the device limit, with the server's code", async () => {
    rest.answer('POST /api/v1/devices', refuse(429, ErrorCodes.Identity.DeviceLimitReached));

    await expect(service.load()).rejects.toMatchObject({ code: ErrorCodes.Identity.DeviceLimitReached });
    expect(await identity.id()).toBeNull();
  });

  it('runs sessions on the smart tier only when the plan has it', async () => {
    expect((await service.load()).tier).toBe('smart');

    rest.answer('GET /api/v1/me/entitlements', () => entitlements(['practice']));
    expect((await service.load()).tier).toBe('fast');
  });

  it('signs hub proofs with the device id, HUB and the method, bound to the connection token', async () => {
    await service.load();

    const proof = decode(await service.hubProof('StartSession', 'connection-token'));

    expect(proof.header['kid']).toBe('d1');
    expect(proof.payload).toMatchObject({
      htm: 'HUB',
      htu: 'StartSession',
      ath: createHash('sha256').update('connection-token').digest('base64url'),
    });
  });

  it('signs no hub proof before this computer is registered', async () => {
    await expect(service.hubProof('StartSession', 'connection-token')).rejects.toMatchObject({
      code: ErrorCodes.Identity.DeviceNotRegistered,
    });
  });
});
