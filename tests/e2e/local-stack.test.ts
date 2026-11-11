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
import { HistoryRecorder } from '../../src/main/history/history-recorder';
import { HistoryService } from '../../src/main/history/history-service';
import { DraftsService } from '../../src/main/jobs/drafts-service';
import { runJob } from '../../src/main/jobs/run-job';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';
import { ScreenshotShelf } from '../../src/main/screenshots/screenshot-shelf';
import { HubDriver, type HubDriverDependencies } from '../../src/main/session/hub-driver';
import { SessionController, type SessionScreenshots } from '../../src/main/session/session-controller';
import {
  AnswerKind,
  AskMode,
  createLiveHub,
  ErrorCodes,
  type LiveHub,
} from '../../src/shared/contracts/sotto-contracts';
import { emptyPreferences } from '../../src/shared/answer-bank';
import { emptyDocuments } from '../../src/shared/documents';
import { signUpInBrowser } from './keycloak-browser';

/** A real PNG, one pixel: the server reads a screenshot's format and size from its header (backend 3.1). */
const onePixelPng = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);

/** Screenshots as main takes them (3.6), the selector stood in for: each capture is the one-pixel PNG. */
const screenshots = (): SessionScreenshots => ({
  capture: async () => ({ ok: true, shot: { bytes: onePixelPng, mime: 'image/png', width: 1, height: 1 } }),
  shelf: new ScreenshotShelf(),
});

/** The documents a session takes, as the driver sends them (`SetContext`). */
type SessionDocuments = NonNullable<HubDriverDependencies['context']>;

const issuer = process.env['SOTTO_OIDC_ISSUER'] ?? 'http://localhost:8080/realms/sotto';
const apiBaseUrl = process.env['SOTTO_API_BASE_URL'] ?? 'http://localhost:5180';
const mailpit = process.env['SOTTO_MAILPIT_URL'] ?? 'http://localhost:8025';
const clientVersion = '0.1.0';

describe.skipIf(process.env['SOTTO_E2E'] !== '1')('the client against the local stack', () => {
  it('signs up in the browser, registers this computer, and gets answers in a live session, to a typed question and to the sound it uploads', async () => {
    // 1.10: sign in, as the app does it, with only the browser scripted.
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
    const email = `client-e2e-${Date.now()}@example.com`;
    const password = `E2e-${randomBytes(12).toString('base64url')}9!`;

    await auth.signIn((url) => signUpInBrowser(url, { email, password, mailpit }));

    expect(auth.current).toMatchObject({ status: 'signed-in', email });
    expect(await secrets.get('refresh-token')).toBeTruthy();

    // The account, with this computer registered by its key.
    const rest = new RestClient({
      baseUrl: apiBaseUrl,
      clientVersion,
      accessToken: (options) => auth.accessToken(options),
    });
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

    // The trial, as the app's own button starts it (F9 · a): with a proof from this computer.
    await accounts.startTrial();
    loaded = await accounts.load();
    expect(loaded.view.plan.state).toBe('trialing');
    expect(loaded.view.minutes?.usable).toBeGreaterThan(0);

    // 1.12: a live session over the hub, driven as the overlay drives it.
    // The connection opens with this computer's proof (backend docs/04 §6); the server refuses one that isn't.
    // The driver's latest connection, for the test to ask the server what the session holds (`GetState`).
    let latest: LiveHub | null = null;
    const driverWith = ({
      forgeProof = false,
      auto = false,
      context = null as SessionDocuments | null,
      prepDoc = null as HubDriverDependencies['prepDoc'],
      preferences = null as HubDriverDependencies['preferences'],
    } = {}) =>
      new HubDriver({
        connect: (accessToken, deviceProof, events) => {
          const transport = createLiveTransport({
            apiBaseUrl,
            clientVersion,
            accessToken,
            deviceProof: forgeProof ? 'not-a-proof' : deviceProof,
            events,
          });
          latest = createLiveHub(transport.connection);
          return transport;
        },
        accessToken: () => auth.accessToken(),
        connectProof: (token) => accounts.connectProof(token),
        proof: (method, token) => accounts.hubProof(method, token),
        auto,
        context,
        prepDoc,
        preferences,
      });
    expect(await new SessionController(() => {}).start(driverWith({ forgeProof: true }))).toMatchObject({
      ok: false,
      code: ErrorCodes.Identity.DeviceProofInvalid,
    });

    const session = new SessionController(() => {}, screenshots());
    const driver = driverWith();

    expect(await session.start(driver)).toEqual({ ok: true });
    expect(await session.command({ type: 'ask', mode: AskMode.Question, text: 'What is a mutex?' })).toEqual({
      ok: true,
    });
    await vi.waitFor(
      () => {
        const answer = session.current.answers.at(-1);
        expect(answer?.ending).toBe('done');
        expect(answer?.text).toContain('Sure, here is the answer.');
      },
      { timeout: 30_000, interval: 100 },
    );

    // 1.12: the call's sound goes up the hub's audio stream, as main hands it over from capture (1.11). The local
    // stack's scripted speech-to-text reads a frame starting "SOTTO-SCRIPT " as a transcript line, so the words come
    // back as heard: proof that the frames reached the session, in order.
    session.audio(new TextEncoder().encode('SOTTO-SCRIPT partial: How would you'), Date.now());
    session.audio(new TextEncoder().encode('SOTTO-SCRIPT final: How would you shard a database?'), Date.now());
    await vi.waitFor(() => expect(session.current.heard.finished).toBe('How would you shard a database?'), {
      timeout: 15_000,
      interval: 100,
    });
    expect(await session.command({ type: 'trigger', text: null })).toEqual({ ok: true });
    await vi.waitFor(
      () => {
        const answer = session.current.answers.at(-1);
        expect(answer?.question).toBe('How would you shard a database?');
        expect(answer?.ending).toBe('done');
      },
      { timeout: 30_000, interval: 100 },
    );

    // 3.6: in MANUAL a screenshot waits, attached, and the trigger answers it as a screen turn.
    expect(await session.command({ type: 'capture', hint: null })).toEqual({ ok: true });
    await vi.waitFor(() => expect(session.current.attachments.ids).toHaveLength(1), { timeout: 15_000, interval: 100 });
    const attached = session.current.attachments.ids[0]!;
    expect(await session.command({ type: 'trigger', text: null })).toEqual({ ok: true });
    await vi.waitFor(
      () => {
        const answer = session.current.answers.at(-1);
        expect(answer?.kind).toBe(AnswerKind.Screen);
        expect(answer?.screenshotIds).toEqual([attached]);
        expect(answer?.ending).toBe('done');
        expect(session.current.attachments.ids).toEqual([]);
      },
      { timeout: 30_000, interval: 100 },
    );

    // The server sends SessionEnded before it answers EndSession: the answer must still arrive.
    expect(await session.command({ type: 'endSession' })).toEqual({ ok: true });
    await vi.waitFor(() => expect(session.current.phase).toBe('ended'), { timeout: 15_000, interval: 100 });

    // 1.14: a session in AUTO with this computer's documents. The server answers on its own only once SetContext
    // has brought the résumé and the job description, so a heard question answered with no Trigger proves they came.
    const withDocuments = new SessionController(() => {}, screenshots());
    const documents: SessionDocuments = {
      Name: 'Sam Rivera',
      Resume: 'Backend engineer, 7 years: payments in Go and Kafka.',
      JobDescription: 'Senior Backend Engineer, Payments.',
      Notes: null,
    };
    // 3.8: the preferences go with it, and the bank is matched here: the question heard is one the user prepared.
    const prepared = {
      Id: 'ledger',
      Phrasings: ['How do you keep a ledger consistent?'],
      Answer: 'Double entry, and idempotent writes.',
    };
    withDocuments.useBank([{ id: prepared.Id, phrasings: prepared.Phrasings, answer: prepared.Answer, enabled: true }]);
    // 3.9: the session kept in history as it goes, the interviewer's words too.
    const local = new LocalStore(openDatabase(null, null, migrations));
    const recorder = new HistoryRecorder(local.history, { keepTranscripts: () => true, changed: () => {} });
    withDocuments.recordTo((event) => recorder.record(event));
    recorder.begin({ candidate: 'Sam Rivera', role: 'Senior Backend Engineer, Payments', tier: null });
    const preferences = { CustomInstructions: 'Keep answers short.', PreparedAnswers: [prepared] };
    // 3.10: the prep doc goes with it, as main reads it from this computer: cut, with its file's name.
    const prepDoc = {
      Name: 'payments-guide.pdf',
      Text: 'Ledgers: double entry.\nIdempotency keys on every write.',
      Cut: true,
    };
    expect(await withDocuments.start(driverWith({ auto: true, context: documents, prepDoc, preferences }))).toEqual({
      ok: true,
    });
    // The driver lets a refusal of any of these pass (the session runs without them): the server must hold all three.
    const held = await latest!.getState();
    expect(held).toMatchObject({
      Ok: true,
      Value: {
        ContextReady: true,
        PrepDoc: { Name: prepDoc.Name, Chars: prepDoc.Text.length, Cut: true },
        CustomInstructionsChars: preferences.CustomInstructions.length,
        PreparedInPrompt: [prepared.Id],
      },
    });
    withDocuments.audio(
      new TextEncoder().encode('SOTTO-SCRIPT final: How do you keep a ledger consistent?'),
      Date.now(),
    );
    await vi.waitFor(
      () => {
        const answer = withDocuments.current.answers.at(-1);
        expect(answer?.question).toBe('How do you keep a ledger consistent?');
        expect(answer?.prepared).toEqual({
          phrasing: 'How do you keep a ledger consistent?',
          answer: 'Double entry, and idempotent writes.',
        });
        expect(answer?.ending).toBe('done');
      },
      { timeout: 30_000, interval: 100 },
    );

    // 3.6: in AUTO a screenshot is answered at once, with its note.
    expect(await withDocuments.command({ type: 'capture', hint: 'the second loop' })).toEqual({ ok: true });
    await vi.waitFor(
      () => {
        const answer = withDocuments.current.answers.at(-1);
        expect(answer?.kind).toBe(AnswerKind.Screen);
        expect(answer?.screenshotIds).toHaveLength(1);
        expect(answer?.ending).toBe('done');
      },
      { timeout: 30_000, interval: 100 },
    );
    expect(await withDocuments.command({ type: 'endSession' })).toEqual({ ok: true });
    await vi.waitFor(() => expect(withDocuments.current.phase).toBe('ended'), { timeout: 15_000, interval: 100 });

    // 3.9: the interview kept, its answers and the words heard; its debrief asked of the server (the 3.4 job), kept.
    const [kept] = local.history.list();
    expect(kept).toMatchObject({ answers: 2, endedAt: expect.any(Number) });
    expect(local.history.get(kept!.id)?.transcript.map((line) => line.text)).toContain(
      'How do you keep a ledger consistent?',
    );
    const history = new HistoryService({
      store: () => local.history,
      running: () => recorder.interviewId,
      job: (path, body) => runJob(path, body, { rest }),
      changed: () => {},
    });
    expect(await history.debrief(kept!.id)).toEqual({ ok: true });
    // The scripted AI writes no JSON: the debrief comes back without its parts, its text the summary.
    expect(local.history.get(kept!.id)?.debrief).toMatchObject({
      version: 1,
      raw: true,
      summary: 'Sure, here is the answer.',
    });

    // 3.9: prep drafts asked for from the documents. The scripted AI writes no JSON, so the server finds no draft
    // and fails the job: the request was taken and the job ran, end to end.
    const drafts = new DraftsService({
      documents: () => ({
        ...emptyDocuments,
        name: 'Sam Rivera',
        resume: documents.Resume ?? '',
        jobDescription: documents.JobDescription ?? '',
      }),
      preferences: () => ({ ...emptyPreferences, bank: [] }),
      job: (path, body) => runJob(path, body, { rest }),
      keep: () => ({ ok: true }),
      changed: () => {},
    });
    expect(await drafts.write()).toMatchObject({ ok: false, code: ErrorCodes.Ai.ProviderUnavailable });

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
