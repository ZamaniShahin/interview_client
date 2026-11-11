// Checkpoint 2.13 end to end, against the backend's whole local stack (`dotnet run --project src/Sotto.AppHost`): the
// account as the app reads it, with the catalog; the trial started from this computer; a top-up and a plan bought, the
// payment finished as the local provider's webhook (the backend's tools/local-purchase.mjs plays the provider); the
// billing portal; and the device limit, met by a third computer and resolved by replacing one. Then 2.16's licence:
// staff give an email a plan with the backend's tools/staff.mjs, and its owner's app shows it as given. Then Q19: a copy
// of the user's data, and deleting the account.
//
//   SOTTO_E2E=1 npx vitest run tests/e2e
//
// The backend's repository is found next to this one (../backend/interview_backend), or at SOTTO_BACKEND. Each run
// leaves three users (client-e2e-billing-, -licence- and -delete-<time>@example.com, the last one's first account
// deleted) in the local Keycloak and database, and a revoked licence in the registry.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccountService } from '../../src/main/account/account-service';
import { purchaseArrived } from '../../src/main/account/payment-watch';
import { ApiError, RestClient } from '../../src/main/api/rest-client';
import { AuthSession } from '../../src/main/auth/auth-session';
import { startLoopback } from '../../src/main/auth/loopback';
import { OpenIdClient } from '../../src/main/auth/oidc';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import { DeviceIdentity } from '../../src/main/device/device-identity';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import { planWords, plansOffered, topUpsOffered, trialOffered } from '../../src/shared/plan-words';
import { signUpInBrowser } from './keycloak-browser';

const issuer = process.env['SOTTO_OIDC_ISSUER'] ?? 'http://localhost:8080/realms/sotto';
const apiBaseUrl = process.env['SOTTO_API_BASE_URL'] ?? 'http://localhost:5180';
const mailpit = process.env['SOTTO_MAILPIT_URL'] ?? 'http://localhost:8025';
const backend = process.env['SOTTO_BACKEND'] || resolve(__dirname, '..', '..', '..', 'backend', 'interview_backend');
const clientVersion = '0.1.0';

/** Finishes a purchase the way the provider would: the backend's own tool posts the signed webhook. */
function pay(checkoutUrl: string, ...args: string[]): string {
  return execFileSync(process.execPath, [resolve(backend, 'tools', 'local-purchase.mjs'), checkoutUrl, ...args], {
    encoding: 'utf8',
  });
}

/** The backend's staff tools, as an admin of the local staff realm runs them, with a session of this run's own. */
function staff(session: string, ...args: string[]): string {
  return execFileSync(process.execPath, [resolve(backend, 'tools', 'staff.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, SOTTO_STAFF_SESSION: session },
  });
}

describe.skipIf(process.env['SOTTO_E2E'] !== '1')('the account and plan screens against the local stack (2.13)', () => {
  it(
    'reads the catalog, starts the trial, buys minutes and a plan, and meets the device limit',
    { timeout: 120_000 },
    async () => {
      const secrets = new MemorySecretStore();
      const auth = new AuthSession({
        oidc: new OpenIdClient({
          issuer,
          clientId: 'desktop',
          scopes: 'openid email profile offline_access',
          allowHttp: true,
        }),
        secrets,
        loopback: () => startLoopback(60_000),
      });
      const email = `client-e2e-billing-${Date.now()}@example.com`;
      const password = `E2e-${randomBytes(12).toString('base64url')}9!`;
      await auth.signIn((url) => signUpInBrowser(url, { email, password, mailpit }));

      const rest = new RestClient({
        baseUrl: apiBaseUrl,
        clientVersion,
        accessToken: (options) => auth.accessToken(options),
      });
      /** A computer of this account: its own key and fingerprint (a trial is once per device too). */
      const computer = (name: string) =>
        new AccountService({
          rest,
          device: new DeviceIdentity(new MemorySecretStore()),
          appVersion: clientVersion,
          platform: 'windows',
          fingerprint: async () => randomBytes(32).toString('hex'),
          deviceName: () => name,
        });
      const desk = computer('Desk e2e');

      // No plan yet: the catalog offers the trial, the plans and the top-up, with no price anywhere (Q3).
      let account = (await desk.load()).view;
      expect(account.plan.state).toBe('none');
      expect(account.trial).toEqual({ used: false, endsOn: null });
      expect(account.deviceRemovals).toEqual({ left: 3, max: 3, windowDays: 30, nextFreesOn: null });
      expect(account.catalog?.purchases).toBe(true);
      expect(account.catalog?.plans.map((p) => p.id)).toEqual(['credits_monthly', 'unlimited']);
      expect(account.catalog?.topUps).toEqual([{ id: 'topup_100', minutes: 100, validDays: 365 }]);
      expect(trialOffered(account)).toEqual({ days: 14, minutes: 30, maxSessionMinutes: 10, devices: 2, smart: false });
      expect(planWords(account)).toMatchObject({ headline: 'No plan yet', detail: 'Start the trial, or pick a plan' });

      // F9 · a: the trial from this computer, then it can't be had twice.
      await desk.startTrial();
      account = (await desk.load()).view;
      expect(account.plan).toMatchObject({ id: 'trial', state: 'trialing', renews: false, daysLeft: 14 });
      expect(account.trial.used).toBe(true);
      expect(account.trial.endsOn).toBe(account.plan.until);
      expect(account.minutes?.usable).toBe(30);
      await expect(desk.startTrial()).rejects.toMatchObject({ code: ErrorCodes.Licensing.TrialAlreadyUsed });

      // The billing portal has nothing to show before anything was bought.
      await expect(desk.portal()).rejects.toMatchObject({ code: ErrorCodes.Billing.NoBillingCustomer });

      // F8: a top-up during the trial, paid in "the browser" (the provider's webhook), shows in the account.
      const topUpPage = await desk.checkout({ topUpId: 'topup_100' });
      expect(topUpPage).toMatch(/^https:\/\/billing\.local\.invalid\/checkout\//);
      const beforeTopUp = account;
      expect(pay(topUpPage)).toContain('100 minutes bought');
      account = (await desk.load()).view;
      expect(account.minutes?.usable).toBe(130);
      expect(purchaseArrived({ topUpId: 'topup_100' }, beforeTopUp, account)).toMatch(
        /^100 minutes added\. They last until /,
      );

      // A plan bought the same way replaces the trial; it renews until it is cancelled in the portal.
      const planPage = await desk.checkout({ planId: 'credits_monthly' });
      const beforePlan = account;
      const subscribed = /subscribed: (sub_local_\w+)/.exec(pay(planPage))?.[1];
      expect(subscribed).toBeTruthy();
      account = (await desk.load()).view;
      expect(account.plan).toMatchObject({ id: 'credits_monthly', name: 'Credits', state: 'active', renews: true });
      expect(account.trial).toEqual({ used: true, endsOn: null });
      // The trial's minutes end with it; the plan's month and the top-up's minutes are read together with the plan.
      expect(account.minutes?.usable).toBe(500);
      expect(purchaseArrived({ planId: 'credits_monthly' }, beforePlan, account)).toMatch(/^Credits plan started: /);
      expect(planWords(account).detail).toMatch(/^Credits plan · renews /);
      await expect(desk.checkout({ planId: 'unlimited' })).rejects.toMatchObject({
        code: ErrorCodes.Billing.AlreadySubscribed,
      });
      expect(await desk.portal()).toMatch(/^https:\/\/billing\.local\.invalid\/portal\//);

      pay(planPage, '--status', 'canceled', '--subscription', subscribed!);
      account = (await desk.load()).view;
      expect(account.plan).toMatchObject({ state: 'active', renews: false });
      expect(planWords(account).tag).toMatch(/^Cancelled · runs until /);

      // The ledger, newest first, in pages of 20: this account's few entries fit in one.
      expect(account.ledger.map((entry) => entry.kind)).toContain('Top-up');
      expect(account.ledgerNext).toBeNull();

      // F3: at the limit (3 on a paid plan), a fourth computer can't be added until one is removed in its place. The
      // server takes 5 new devices a day per user, refusals included: this part uses 4 of them, the desk the first.
      const second = computer('Second e2e');
      const third = computer('Third e2e');
      await second.load();
      await third.load();
      const fourth = computer('Fourth e2e');
      const refused = await fourth.load().catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(ApiError);
      expect((refused as ApiError).code).toBe(ErrorCodes.Identity.DeviceLimitReached);
      const limit = await fourth.deviceLimit();
      expect(limit.devices.map((d) => d.name).sort()).toEqual(['Desk e2e', 'Second e2e', 'Third e2e']);
      expect(limit.limit).toBe(3);
      expect(limit.removals).toEqual({ left: 3, max: 3, windowDays: 30, nextFreesOn: null });

      await fourth.replaceDevice(limit.devices.find((d) => d.name === 'Third e2e')!.id);
      account = (await fourth.load()).view;
      expect(account.devices.map((d) => d.name).sort()).toEqual(['Desk e2e', 'Fourth e2e', 'Second e2e']);
      expect(account.devices.find((d) => d.name === 'Fourth e2e')!.isThisComputer).toBe(true);
      expect(account.deviceRemovals.left).toBe(2);
      expect(account.deviceRemovals.nextFreesOn).toMatch(/^\w{3} \d{1,2}/);

      // F10 · c: another computer removed from this one, which counts against the cap too.
      await fourth.removeDevice(account.devices.find((d) => d.name === 'Second e2e')!.id);
      account = (await fourth.load()).view;
      expect(account.devices.map((d) => d.name).sort()).toEqual(['Desk e2e', 'Fourth e2e']);
      expect(account.deviceRemovals.left).toBe(1);
    },
  );
});

describe.skipIf(process.env['SOTTO_E2E'] !== '1')('a licence given by staff, against the local stack (2.16)', () => {
  it(
    'shows the plan as given by Sotto, with nothing to buy or start, until it is revoked',
    { timeout: 120_000 },
    async () => {
      const session = join(tmpdir(), `sotto-e2e-staff-${randomBytes(6).toString('hex')}.json`);
      const email = `client-e2e-licence-${Date.now()}@example.com`;
      try {
        staff(session, 'login', '--local-admin');

        // Given before its owner signs up, as for a tester: it waits for the email, verified.
        expect(staff(session, 'licence', 'grant', email, '--reason', 'Client e2e: a licence before sign-up')).toContain(
          'Pending',
        );

        const auth = new AuthSession({
          oidc: new OpenIdClient({
            issuer,
            clientId: 'desktop',
            scopes: 'openid email profile offline_access',
            allowHttp: true,
          }),
          secrets: new MemorySecretStore(),
          loopback: () => startLoopback(60_000),
        });
        const password = `E2e-${randomBytes(12).toString('base64url')}9!`;
        await auth.signIn((url) => signUpInBrowser(url, { email, password, mailpit }));
        const rest = new RestClient({
          baseUrl: apiBaseUrl,
          clientVersion,
          accessToken: (options) => auth.accessToken(options),
        });
        const desk = new AccountService({
          rest,
          device: new DeviceIdentity(new MemorySecretStore()),
          appVersion: clientVersion,
          platform: 'windows',
          fingerprint: async () => randomBytes(32).toString('hex'),
          deviceName: () => 'Licensed e2e',
        });

        // At the first sign-in the licence is on the account: the Team plan, for good, with nothing to pay.
        let account = (await desk.load()).view;
        expect(account.plan).toMatchObject({
          id: 'team',
          name: 'Team',
          state: 'active',
          renews: false,
          licensed: true,
        });
        expect(account.plan.until).toBeNull();
        expect(planWords(account)).toMatchObject({ detail: 'Team plan · given by Sotto', tag: 'Licence' });
        expect(trialOffered(account)).toBeNull();
        expect(plansOffered(account)).toEqual([]);
        expect(topUpsOffered(account)).toEqual([]);
        await expect(desk.startTrial()).rejects.toMatchObject({ code: ErrorCodes.Licensing.TrialNotAvailable });

        // Revoked, the plan ends at once: the app offers the plans and the trial again.
        const id = /^(\S+)\s+active\s/m.exec(staff(session, 'licences', '--email', email))?.[1];
        expect(id).toBeTruthy();
        staff(session, 'licence', 'revoke', id!, '--reason', 'Client e2e: revoked at the end of the run');
        account = (await desk.load()).view;
        expect(account.plan).toMatchObject({ state: 'none', licensed: false });
        expect(plansOffered(account).map((p) => p.id)).toEqual(['credits_monthly', 'unlimited']);
        expect(trialOffered(account)).not.toBeNull();
      } finally {
        try {
          staff(session, 'logout');
        } catch {
          // The session file goes with the temp folder anyway.
        }
      }
    },
  );
});

describe.skipIf(process.env['SOTTO_E2E'] !== '1')('your data against the local stack (Q19)', () => {
  it(
    'saves a copy of the data, refuses another email, then deletes the account, after which the same sign-in starts afresh',
    { timeout: 120_000 },
    async () => {
      const email = `client-e2e-delete-${Date.now()}@example.com`;
      const auth = new AuthSession({
        oidc: new OpenIdClient({
          issuer,
          clientId: 'desktop',
          scopes: 'openid email profile offline_access',
          allowHttp: true,
        }),
        secrets: new MemorySecretStore(),
        loopback: () => startLoopback(60_000),
      });
      const password = `E2e-${randomBytes(12).toString('base64url')}9!`;
      await auth.signIn((url) => signUpInBrowser(url, { email, password, mailpit }));
      const rest = new RestClient({
        baseUrl: apiBaseUrl,
        clientVersion,
        accessToken: (options) => auth.accessToken(options),
      });
      const desk = new AccountService({
        rest,
        device: new DeviceIdentity(new MemorySecretStore()),
        appVersion: clientVersion,
        platform: 'windows',
        fingerprint: async () => randomBytes(32).toString('hex'),
        deviceName: () => 'Data e2e',
      });
      await desk.load();
      await desk.startTrial();
      const before = (await desk.load()).view;

      // The copy: a section per kind of record, this user's and no one else's.
      const data = (await desk.exportData()) as { sections: Record<string, Record<string, unknown>> };
      // The jobs' counts too since the server's 3.4 (a debrief and prep drafts each period).
      expect(Object.keys(data.sections)).toEqual(['account', 'billing', 'jobs', 'sessions', 'user']);
      expect(data.sections['user']!['email']).toBe(email);
      expect((data.sections['account']!['plan'] as { id: string }).id).toBe('trial');
      expect(JSON.stringify(data)).not.toMatch(/publicKey|fingerprint|thumbprint/i);

      // Anything but the account's own email deletes nothing.
      await expect(desk.deleteAccount('someone-else@example.com')).rejects.toMatchObject({
        code: ErrorCodes.Request.InvalidInput,
      });

      await desk.deleteAccount(email);

      // Keycloak still knows the person (Q39): the same sign-in starts a fresh, empty account, and this computer is
      // added to it again, with a key of its own.
      const after = (await desk.load()).view;
      expect(after.plan.state).toBe('none');
      expect(after.devices.map((d) => d.name)).toEqual(['Data e2e']);
      expect(after.ledger).toEqual([]);
      expect(before.plan.state).toBe('trialing');
    },
  );
});
