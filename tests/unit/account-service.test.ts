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
    this.answer('GET /api/v1/me', () => ({
      id: 'u1',
      email: 'sam@example.com',
      emailVerified: true,
      displayName: 'Sam',
      createdAt: '2026-11-01T12:00:00Z',
      deviceRemovals: { left: 2, max: 3, windowDays: 30, nextFreesAt: '2026-12-06T12:00:00Z' },
    }));
    this.answer('GET /api/v1/me/entitlements', () => entitlements(['smart_tier', 'practice']));
    this.answer('GET /api/v1/me/credits', () => ({ balance: 120, lots: [] }));
    this.answer('GET /api/v1/me/credits/ledger?limit=20', () => ({ entries: [], next: null }));
    this.answer('GET /api/v1/devices', () => [device('d1')]);
    this.answer('POST /api/v1/devices', () => device('d1'));
    this.answer('GET /api/v1/devices/current', () => device('d1'));
    this.answer('GET /api/v1/billing/catalog', () => ({
      purchases: true,
      plans: [
        {
          id: 'credits_monthly',
          name: 'Credits',
          features: ['live', 'smart_tier'],
          limits: { liveMinutesPerPeriod: 400, fairUseMinutesPerPeriod: null, maxSessionMinutes: 120, devices: 3 },
        },
      ],
      topUps: [{ id: 'topup_100', minutes: 100, validDays: 365 }],
      trial: null,
    }));
    this.answer('POST /api/v1/me/trial', () => entitlements(['live']));
    this.answer('POST /api/v1/billing/checkout', () => ({ url: 'https://billing.example/checkout/cs_1' }));
    this.answer('POST /api/v1/billing/portal', () => ({ url: 'https://billing.example/portal/cus_1' }));
    this.answer('DELETE /api/v1/devices/d2', () => undefined);
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

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.handle('DELETE', path, options) as Promise<T>;
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
    renews: true,
    trialUsed: false,
    trialEndsAt: null,
    licensed: false,
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
    expect(registration.body).toEqual({
      name: 'Test PC',
      platform: 'windows',
      appVersion: '0.1.0',
      fingerprint: 'f'.repeat(64),
    });
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

  it("signs a connection's proof for its handshake, GET and the hub's path, bound to the connection token", async () => {
    await service.load();

    const proof = decode(await service.connectProof('connection-token'));

    expect(proof.header['kid']).toBe('d1');
    expect(proof.payload).toMatchObject({
      htm: 'GET',
      htu: '/hubs/live',
      ath: createHash('sha256').update('connection-token').digest('base64url'),
    });
  });

  it('signs a fresh proof for every connection, since the server takes each once', async () => {
    await service.load();

    const first = decode(await service.connectProof('connection-token'));
    const second = decode(await service.connectProof('connection-token'));

    expect(first.payload['jti']).not.toBe(second.payload['jti']);
  });

  it('signs no proof to connect before this computer is registered', async () => {
    await expect(service.connectProof('connection-token')).rejects.toMatchObject({
      code: ErrorCodes.Identity.DeviceNotRegistered,
    });
  });

  it('reads what is for sale with the account, and still shows the account when the catalog fails', async () => {
    expect((await service.load()).view.catalog?.topUps).toEqual([{ id: 'topup_100', minutes: 100, validDays: 365 }]);

    rest.answer('GET /api/v1/billing/catalog', refuse(503, ErrorCodes.Request.Unavailable));
    const loaded = await service.load();

    expect(loaded.view.catalog).toBeNull();
    expect(loaded.view.plan.name).toBe('Pro');
  });

  it('reads the removals left and the first page of the ledger with the account', async () => {
    const { view } = await service.load();

    expect(view.deviceRemovals).toEqual({ left: 2, max: 3, windowDays: 30, nextFreesOn: 'Dec 6' });
    expect(rest.routes()).toContain('GET /api/v1/me/credits/ledger?limit=20');
  });

  it('reads the minutes only once the plan is read, and the ledger after the minutes', async () => {
    await service.load();

    const routes = rest.routes();
    const at = (route: string) => routes.indexOf(route);
    expect(at('GET /api/v1/me/credits')).toBeGreaterThan(at('GET /api/v1/me/entitlements'));
    expect(at('GET /api/v1/me/credits/ledger?limit=20')).toBeGreaterThan(at('GET /api/v1/me/credits'));
  });

  it("reads the ledger's earlier page before the given entry", async () => {
    rest.answer('GET /api/v1/me/credits/ledger?before=21&limit=20', () => ({
      entries: [
        {
          number: 20,
          type: 'grant_plan',
          minutes: 400,
          balanceAfter: 400,
          sessionId: null,
          createdAt: '2026-10-01T12:00:00Z',
        },
      ],
      next: null,
    }));

    const page = await service.ledgerPage(21);

    expect(page).toEqual({
      entries: [{ number: 20, date: 'Oct 1', kind: 'Plan minutes', detail: '', minutes: 400, balanceAfter: 400 }],
      next: null,
    });
  });

  it('starts the trial with a proof from this computer, for that request', async () => {
    await service.load();

    await service.startTrial();

    const trial = rest.calls.find((call) => call.path === '/api/v1/me/trial')!;
    expect(trial.method).toBe('POST');
    expect(trial.proof!.header['kid']).toBe('d1');
    expect(trial.proof!.payload).toMatchObject({ htm: 'POST', htu: '/api/v1/me/trial' });
  });

  it.each([
    ErrorCodes.Identity.EmailNotVerified,
    ErrorCodes.Licensing.TrialAlreadyUsed,
    ErrorCodes.Licensing.TrialNotAvailable,
    ErrorCodes.Identity.AccountSuspended,
  ])("passes the trial's refusal on with the server's code: %s", async (code) => {
    await service.load();
    rest.answer('POST /api/v1/me/trial', refuse(409, code));

    await expect(service.startTrial()).rejects.toMatchObject({ code });
  });

  it('starts no trial before this computer is registered', async () => {
    await expect(service.startTrial()).rejects.toMatchObject({ code: ErrorCodes.Identity.DeviceNotRegistered });
    expect(rest.routes()).not.toContain('POST /api/v1/me/trial');
  });

  it.each([[{ planId: 'credits_monthly' }], [{ topUpId: 'topup_100' }]])(
    'asks for a checkout of %j, with no proof, and answers with its page',
    async (purchase) => {
      const url = await service.checkout(purchase);

      const checkout = rest.calls.find((call) => call.path === '/api/v1/billing/checkout')!;
      expect(checkout.body).toEqual(purchase);
      expect(checkout.proof).toBeNull();
      expect(url).toBe('https://billing.example/checkout/cs_1');
    },
  );

  it.each([
    ErrorCodes.Billing.AlreadySubscribed,
    ErrorCodes.Licensing.NoEntitlement,
    ErrorCodes.Billing.BillingUnavailable,
  ])("passes a checkout's refusal on: %s", async (code) => {
    rest.answer('POST /api/v1/billing/checkout', refuse(409, code));

    await expect(service.checkout({ planId: 'credits_monthly' })).rejects.toMatchObject({ code });
  });

  it('opens the billing portal with a proof from this computer', async () => {
    await service.load();

    expect(await service.portal()).toBe('https://billing.example/portal/cus_1');
    const portal = rest.calls.find((call) => call.path === '/api/v1/billing/portal')!;
    expect(portal.proof!.payload).toMatchObject({ htm: 'POST', htu: '/api/v1/billing/portal' });
  });

  it("passes the portal's refusal on when nothing was bought yet", async () => {
    await service.load();
    rest.answer('POST /api/v1/billing/portal', refuse(404, ErrorCodes.Billing.NoBillingCustomer));

    await expect(service.portal()).rejects.toMatchObject({ code: ErrorCodes.Billing.NoBillingCustomer });
  });

  it('removes another computer with a proof from this one, signed for that path', async () => {
    await service.load();

    await service.removeDevice('d2');

    const removal = rest.calls.find((call) => call.method === 'DELETE')!;
    expect(removal.path).toBe('/api/v1/devices/d2');
    expect(removal.proof!.header['kid']).toBe('d1');
    expect(removal.proof!.payload).toMatchObject({ htm: 'DELETE', htu: '/api/v1/devices/d2' });
  });

  it("passes a removal's refusal on at the removal cap", async () => {
    await service.load();
    rest.answer('DELETE /api/v1/devices/d2', refuse(429, ErrorCodes.Identity.DeviceRemovalLimitReached));

    await expect(service.removeDevice('d2')).rejects.toMatchObject({
      code: ErrorCodes.Identity.DeviceRemovalLimitReached,
    });
  });

  it("lists the account's computers and the removals left when this one can't be added", async () => {
    rest.answer('GET /api/v1/devices', () => [device('d1'), device('d2'), device('d3')]);

    const limit = await service.deviceLimit();

    expect(limit.devices.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
    expect(limit.devices.some((d) => d.isThisComputer)).toBe(false);
    expect(limit.limit).toBe(3);
    expect(limit.removals).toEqual({ left: 2, max: 3, windowDays: 30, nextFreesOn: 'Dec 6' });
  });

  it('adds this computer in place of the one named, in one registration', async () => {
    rest.answer('POST /api/v1/devices', () => device('d9'));

    expect(await service.replaceDevice('d2')).toBe('d9');

    const registration = rest.calls.find((call) => call.method === 'POST')!;
    expect(registration.body).toMatchObject({ name: 'Test PC', replacesDeviceId: 'd2' });
    expect(registration.proof!.payload).toMatchObject({ htm: 'POST', htu: '/api/v1/devices' });
    expect(await identity.id()).toBe('d9');
  });

  it('registers without naming a device to replace when there is room', async () => {
    await service.load();

    expect(rest.calls.find((call) => call.method === 'POST')!.body).not.toHaveProperty('replacesDeviceId');
  });
});
