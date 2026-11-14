// What changed on the server on 2026-11-14, end to end against the backend's whole local stack (`dotnet run --project
// src/Sotto.AppHost`, scripted AI), with main's own modules in plain Node as in local-stack.test.ts:
// - support ends a live session from the staff dashboard's API, and the app hears `support` (backend 4.12);
// - the trial practises once, and a second practice is refused in the server's words (backend Q48);
// - nothing said while the session is paused is heard, and what is said after the resume is (backend docs/02 §4).
//
//   SOTTO_E2E=1 npx vitest run tests/e2e/staff-flows.test.ts
//
// The staff token is the staff realm's `admin`, with the password the backend's AppHost generated (its user-secrets,
// found next to this repository or at SOTTO_BACKEND). Each run leaves its users (client-staff-<time>@example.com).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { AccountService } from '../../src/main/account/account-service';
import { RestClient } from '../../src/main/api/rest-client';
import { AuthSession } from '../../src/main/auth/auth-session';
import { DpopKeys } from '../../src/main/auth/dpop';
import { startLoopback } from '../../src/main/auth/loopback';
import { OpenIdClient } from '../../src/main/auth/oidc';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import { createLiveTransport } from '../../src/main/connection/live-connection';
import { DeviceIdentity } from '../../src/main/device/device-identity';
import { HubDriver } from '../../src/main/session/hub-driver';
import { SessionController } from '../../src/main/session/session-controller';
import { createLiveHub, PracticeFocus, Protocol, SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import { endedText } from '../../src/shared/live/copy';
import { signUpInBrowser, staffAccessToken } from './keycloak-browser';

const keycloak = process.env['SOTTO_KEYCLOAK'] ?? 'http://localhost:8080';
const issuer = `${keycloak}/realms/sotto`;
const apiBaseUrl = process.env['SOTTO_API_BASE_URL'] ?? 'http://localhost:5180';
const staffHost = process.env['SOTTO_STAFF_HOST'] ?? 'http://localhost:5181';
const mailpit = process.env['SOTTO_MAILPIT_URL'] ?? 'http://localhost:8025';
const backend =
  process.env['SOTTO_BACKEND'] ??
  join(fileURLToPath(new URL('../..', import.meta.url)), '..', 'backend', 'interview_backend');
const clientVersion = '0.1.0';

/** A new user on a trial, signed in and registered as the app does it, and a way to open live sessions. */
async function trialUser() {
  const secrets = new MemorySecretStore();
  const auth = new AuthSession({
    oidc: new OpenIdClient({
      issuer,
      clientId: 'desktop',
      scopes: 'openid email profile offline_access',
      allowHttp: true,
    }),
    secrets,
    dpop: new DpopKeys(secrets),
    loopback: () => startLoopback(60_000),
  });
  const email = `client-staff-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const password = `E2e-${randomBytes(12).toString('base64url')}9!`;
  await auth.signIn((url) => signUpInBrowser(url, { email, password, mailpit }));
  const rest = new RestClient({
    baseUrl: apiBaseUrl,
    clientVersion,
    accessToken: (options) => auth.accessToken(options),
    dpopProof: (method, url, token) => auth.dpopProof(method, url, token),
  });
  const fingerprint = randomBytes(32).toString('hex');
  const accounts = new AccountService({
    rest,
    device: new DeviceIdentity(secrets),
    appVersion: clientVersion,
    platform: 'windows',
    fingerprint: async () => fingerprint,
    deviceName: () => 'Client staff e2e',
  });
  await accounts.load();
  await accounts.startTrial();
  const me = (await (
    await fetch(`${apiBaseUrl}/api/v1/me`, {
      headers: {
        authorization: `DPoP ${await auth.accessToken()}`,
        dpop: await auth.dpopProof('GET', new URL('/api/v1/me', apiBaseUrl), await auth.accessToken()),
      },
    })
  ).json()) as { id: string };

  const driver = () =>
    new HubDriver({
      connect: (accessToken, deviceProof, dpopProof, events) => {
        const transport = createLiveTransport({
          apiBaseUrl,
          clientVersion,
          accessToken,
          deviceProof,
          dpopProof,
          events,
        });
        createLiveHub(transport.connection);
        return transport;
      },
      accessToken: () => auth.accessToken(),
      connectProof: (token) => accounts.connectProof(token),
      dpopProof: (token) => auth.dpopProof('GET', new URL(Protocol.HubPath, apiBaseUrl), token),
      proof: (method, token) => accounts.hubProof(method, token),
      auto: false,
      // The documents practice writes its questions from: a practice refused for want of them would hide the count.
      context: { Name: 'Ann', Resume: 'Resume text.', JobDescription: 'Job description text.', Notes: null },
      prepDoc: null,
      preferences: null,
    });
  return { email, userId: me.id, driver };
}

function staffPassword(): string {
  const listing = execFileSync(
    'dotnet',
    ['user-secrets', 'list', '--json', '--project', join(backend, 'src', 'Sotto.AppHost')],
    {
      encoding: 'utf8',
    },
  );
  const secrets = JSON.parse(listing.slice(listing.indexOf('{'), listing.lastIndexOf('}') + 1)) as Record<
    string,
    string
  >;
  const password = secrets['Parameters:staff-admin-password'];
  if (!password) throw new Error('The backend AppHost has no staff-admin-password: run it once.');
  return password;
}

const timeout = { timeout: 30_000, interval: 100 };

describe.skipIf(process.env['SOTTO_E2E'] !== '1')("the server's changes of 2026-11-14, against the local stack", () => {
  it('support ends a live session, the app says so, and a new session starts', async () => {
    const user = await trialUser();
    const session = new SessionController(() => {});
    expect(await session.start(user.driver())).toEqual({ ok: true });
    const staff = await staffAccessToken({ keycloak, password: staffPassword() });
    const asStaff = { authorization: `Bearer ${staff}` };

    const live = (await (await fetch(`${staffHost}/admin/v1/sessions/live`, { headers: asStaff })).json()) as {
      sessions: { sessionId: string; userId: string | null; email: string | null; minutes: number }[];
    };
    const mine = live.sessions.find((s) => s.userId === user.userId);
    expect(mine).toMatchObject({ email: user.email, minutes: 1 });

    const ended = await fetch(`${staffHost}/admin/v1/sessions/${mine!.sessionId}/end`, {
      method: 'POST',
      headers: { ...asStaff, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Client end-to-end check.' }),
    });
    expect(ended.status).toBe(202);

    await vi.waitFor(() => expect(session.current.phase).toBe('ended'), timeout);
    expect(session.current.endReason).toBe(SessionEndReasons.Support);
    expect(endedText(session.current.endReason)).toBe('Support ended this session. You can start another.');

    const again = new SessionController(() => {});
    expect(await again.start(user.driver())).toEqual({ ok: true });
    await again.command({ type: 'endSession' });
  }, 120_000);

  it("the trial practises once, and a second practice is refused in the server's words", async () => {
    const user = await trialUser();
    const session = new SessionController(() => {});
    expect(await session.start(user.driver())).toEqual({ ok: true });
    const start = { type: 'mockStart' as const, count: 1, focus: PracticeFocus.Mixed, questions: ['Chosen one?'] };

    expect(await session.practice(start)).toEqual({ ok: true });
    expect(await session.practice({ type: 'mockStop' })).toEqual({ ok: true });
    const refused = await session.practice(start);

    expect(refused).toMatchObject({
      ok: false,
      code: 'quota_exceeded',
      message: 'The trial includes one practice interview, already used. Choose a plan to practise more.',
    });
    await session.command({ type: 'endSession' });
  }, 120_000);

  it('nothing said while paused is heard, and what is said after the resume is', async () => {
    const user = await trialUser();
    const session = new SessionController(() => {});
    expect(await session.start(user.driver())).toEqual({ ok: true });
    const say = (words: string) => session.audio(new TextEncoder().encode(`SOTTO-SCRIPT final: ${words}`), Date.now());

    say('Before the pause.');
    await vi.waitFor(() => expect(session.current.heard.finished).toBe('Before the pause.'), timeout);

    expect(await session.command({ type: 'setMode', auto: null, paused: true })).toEqual({ ok: true });
    await vi.waitFor(() => expect(session.current.paused).toBe(true), timeout);
    say('Said while paused.');
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(session.current.heard.finished).not.toContain('Said while paused.');

    expect(await session.command({ type: 'setMode', auto: null, paused: false })).toEqual({ ok: true });
    await vi.waitFor(() => expect(session.current.paused).toBe(false), timeout);
    say('After the resume.');
    await vi.waitFor(() => expect(session.current.heard.finished).toContain('After the resume.'), timeout);
    expect(session.current.heard.finished).not.toContain('Said while paused.');
    await session.command({ type: 'endSession' });
  }, 120_000);
});
