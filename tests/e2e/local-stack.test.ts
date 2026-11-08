// Checkpoints 1.10 and 1.12 end to end, against the backend's whole local stack (`dotnet run --project
// src/Sotto.AppHost`, scripted AI): the real sign-in through Keycloak's pages and the loopback, the device registered
// with its proofs, the account read, then a live session over the hub that answers a typed question.
//
//   SOTTO_E2E=1 npx vitest run tests/e2e
//
// Main's own modules run here in plain Node, as they do in Electron's main process; only the browser is scripted.
// Each run leaves one user (client-e2e-<time>@example.com) in the local Keycloak and database.
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AccountService } from '../../src/main/account/account-service';
import { RestClient } from '../../src/main/api/rest-client';
import { AuthSession } from '../../src/main/auth/auth-session';
import { startLoopback } from '../../src/main/auth/loopback';
import { OpenIdClient } from '../../src/main/auth/oidc';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import { createLiveTransport } from '../../src/main/connection/live-connection';
import { DeviceIdentity } from '../../src/main/device/device-identity';
import { signDeviceProof } from '../../src/main/device/proof';
import { HubDriver } from '../../src/main/session/hub-driver';
import { SessionController } from '../../src/main/session/session-controller';
import { AskMode } from '../../src/shared/contracts/sotto-contracts';
import { signUpInBrowser } from './keycloak-browser';

const issuer = process.env['SOTTO_OIDC_ISSUER'] ?? 'http://localhost:8080/realms/sotto';
const apiBaseUrl = process.env['SOTTO_API_BASE_URL'] ?? 'http://localhost:5180';
const mailpit = process.env['SOTTO_MAILPIT_URL'] ?? 'http://localhost:8025';
const clientVersion = '0.1.0';

describe.skipIf(process.env['SOTTO_E2E'] !== '1')('the client against the local stack', () => {
  it('signs up in the browser, registers this computer, and gets an answer in a live session', async () => {
    // 1.10: sign in, as the app does it, with only the browser scripted.
    const secrets = new MemorySecretStore();
    const auth = new AuthSession({
      oidc: new OpenIdClient({ issuer, clientId: 'desktop', scopes: 'openid email profile offline_access', allowHttp: true }),
      secrets,
      loopback: () => startLoopback(60_000),
    });
    const email = `client-e2e-${Date.now()}@example.com`;
    const password = `E2e-${randomBytes(12).toString('base64url')}9!`;

    await auth.signIn((url) => signUpInBrowser(url, { email, password, mailpit }));

    expect(auth.current).toMatchObject({ status: 'signed-in', email });
    expect(await secrets.get('refresh-token')).toBeTruthy();

    // The account, with this computer registered by its key.
    const rest = new RestClient({ baseUrl: apiBaseUrl, clientVersion, accessToken: (options) => auth.accessToken(options) });
    const identity = new DeviceIdentity(secrets);
    // A trial is once per device too: a new fingerprint per run.
    const fingerprint = randomBytes(32).toString('hex');
    const accounts = new AccountService({
      rest,
      device: identity,
      appVersion: clientVersion,
      platform: 'windows',
      fingerprint: async () => fingerprint,
      deviceName: () => 'Client e2e',
    });

    let loaded = await accounts.load();
    expect(loaded.view.plan.state).toBe('none');
    expect(loaded.view.devices).toHaveLength(1);
    expect(loaded.view.devices[0]).toMatchObject({ name: 'Client e2e', isThisComputer: true });

    // A second load checks the device with a kid proof instead of registering again.
    const deviceId = await identity.id();
    loaded = await accounts.load();
    expect(await identity.id()).toBe(deviceId);
    expect(loaded.view.devices).toHaveLength(1);

    // The trial; the app's own button for it comes with the trial flow (F8).
    const { privateKey } = await identity.keyPair();
    await rest.post('/api/v1/me/trial', {
      proof: (token) =>
        signDeviceProof({ privateKey, htm: 'POST', htu: '/api/v1/me/trial', accessToken: token, kid: deviceId! }),
    });
    loaded = await accounts.load();
    expect(loaded.view.plan.state).toBe('trialing');
    expect(loaded.view.minutes?.usable).toBeGreaterThan(0);

    // 1.12: a live session over the hub, driven as the overlay drives it.
    const session = new SessionController(() => {});
    const driver = new HubDriver({
      connect: (accessToken, events) => createLiveTransport({ apiBaseUrl, clientVersion, accessToken, events }),
      accessToken: () => auth.accessToken(),
      proof: (method, token) => accounts.hubProof(method, token),
      auto: false,
    });

    expect(await session.start(driver)).toEqual({ ok: true });
    expect(await session.command({ type: 'ask', mode: AskMode.Question, text: 'What is a mutex?' })).toEqual({ ok: true });
    await vi.waitFor(
      () => {
        const answer = session.current.answers.at(-1);
        expect(answer?.ending).toBe('done');
        expect(answer?.text).toContain('Sure, here is the answer.');
      },
      { timeout: 30_000, interval: 100 },
    );

    // The server sends SessionEnded before it answers EndSession: the answer must still arrive.
    expect(await session.command({ type: 'endSession' })).toEqual({ ok: true });
    await vi.waitFor(() => expect(session.current.phase).toBe('ended'), { timeout: 15_000, interval: 100 });

    // Renewal rotates the refresh token, and the new one is kept; signing out forgets it.
    const before = await secrets.get('refresh-token');
    await auth.accessToken({ force: true });
    const after = await secrets.get('refresh-token');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);

    await auth.signOut();
    expect(auth.current).toEqual({ status: 'signed-out' });
    expect(await secrets.get('refresh-token')).toBeNull();
  }, 180_000);
});
