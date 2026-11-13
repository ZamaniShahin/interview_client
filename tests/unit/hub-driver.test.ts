import type { Subject } from '@microsoft/signalr';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/main/api/rest-client';
import type { LiveTransport } from '../../src/main/connection/live-connection';
import { HubDriver, resendFrames, type HubDriverDependencies } from '../../src/main/session/hub-driver';
import {
  AskMode,
  ErrorCodes,
  PracticeFocus,
  PracticeState,
  SessionPhase,
  type AudioFrame,
  type HubConnectionLike,
  type LiveClient,
  type SessionSnapshot,
} from '../../src/shared/contracts/sotto-contracts';
import { reduceLive, type LiveAction } from '../../src/shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../src/shared/live/view-state';

type Reply = (request: unknown) => unknown;

/** Plays the hub's side of one connection: replies per method (an OK ack unless told otherwise). */
class FakeConnection implements HubConnectionLike {
  readonly invocations: { method: string; request: unknown }[] = [];
  readonly replies = new Map<string, Reply>();

  constructor(private readonly stopped: () => boolean) {}

  async invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    this.invocations.push({ method, request: args[0] });
    const reply = this.replies.get(method);
    const result = await (reply ? reply(args[0]) : { Ok: true });
    // As SignalR does: stopping the connection cancels the calls still waiting for their answer.
    if (this.stopped()) throw new Error('Invocation canceled due to the underlying connection being closed.');
    return result as T;
  }

  /** The streams the driver opened (`UploadAudio`), and what came over each, as SignalR would read them. */
  readonly streams: { method: string; items: AudioFrame[]; completed: boolean }[] = [];

  async send(method: string, ...args: unknown[]): Promise<void> {
    const stream = { method, items: [] as AudioFrame[], completed: false };
    this.streams.push(stream);
    // SignalR subscribes to a stream argument as the call is made, as this does.
    (args[0] as Subject<AudioFrame>).subscribe({
      next: (item) => stream.items.push(item),
      error: () => {},
      complete: () => {
        stream.completed = true;
      },
    });
  }

  on(): void {}
  off(): void {}

  methods(): string[] {
    return this.invocations.map((call) => call.method);
  }
}

class FakeTransport implements LiveTransport {
  stopped = false;
  readonly connection = new FakeConnection(() => this.stopped);
  private readonly closeListeners: ((error?: Error) => void)[] = [];

  constructor(
    readonly token: string,
    /** The device proof the connection opened with, in its handshake. */
    readonly deviceProof: string,
    /** The driver's event handlers: the test raises hub events through them. */
    readonly events: LiveClient,
    private readonly failToStart: Error | null,
  ) {}

  async start(): Promise<void> {
    if (this.failToStart) throw this.failToStart;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.close();
  }

  onClose(listener: (error?: Error) => void): void {
    this.closeListeners.push(listener);
  }

  /** The connection drops, or the server closes it with a reason. */
  close(error?: Error): void {
    for (const listener of this.closeListeners) listener(error);
  }
}

const sessionStarted = { Ok: true, Value: { SessionId: 'session-1', Phase: SessionPhase.Live } };

interface Setup {
  /** Prepares connection number `index` (0 is the first) before the driver uses it. */
  connection?: (transport: FakeTransport, index: number) => void;
  /** Connections from this index on fail to open. */
  failFrom?: number;
  deps?: Partial<HubDriverDependencies>;
}

function harness(setup: Setup = {}) {
  const transports: FakeTransport[] = [];
  const actions: LiveAction[] = [];
  const sleeps: number[] = [];
  let state: LiveViewState = initialLiveState;
  let clock = 0;
  let tokens = 0;
  let connectProofs = 0;
  const dpopProofs: string[] = [];

  const driver = new HubDriver({
    connect: (token, deviceProof, dpopProof, events) => {
      dpopProofs.push(dpopProof);
      const index = transports.length;
      const failing = setup.failFrom !== undefined && index >= setup.failFrom;
      const transport = new FakeTransport(
        token,
        deviceProof,
        events,
        failing ? new Error('WebSocket failed to connect.') : null,
      );
      transport.connection.replies.set('StartSession', () => sessionStarted);
      setup.connection?.(transport, index);
      transports.push(transport);
      return transport;
    },
    accessToken: async () => `token-${++tokens}`,
    connectProof: async (token) => `proof-connect-${token}-${++connectProofs}`,
    dpopProof: async (token) => `dpop-${token}`,
    proof: async (method, token) => `proof-${method}-${token}`,
    auto: true,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    ...setup.deps,
  });

  const dispatch = (action: LiveAction) => {
    actions.push(action);
    state = reduceLive(state, action);
  };

  return {
    driver,
    transports,
    dpopProofs,
    actions,
    sleeps,
    state: () => state,
    start: () => driver.start(dispatch, () => state),
    types: () => actions.map((action) => action.type),
  };
}

const hear = (seq: number, text: string) => ({ Seq: seq, AtMs: seq, Text: text });

/** A live session's snapshot with nothing attached, no prep doc, no preferences and no practice. */
const snapshotOf = (heard: string, lastSeq: number): SessionSnapshot => ({
  SessionId: 'session-1',
  Phase: SessionPhase.Live,
  Auto: false,
  Paused: false,
  ContextReady: false,
  Heard: heard,
  LastSeq: lastSeq,
  Attachments: [],
  MaxAttachments: 5,
  PrepDoc: null,
  CustomInstructionsChars: 0,
  PreparedInPrompt: [],
  Practice: null,
});

describe('the hub driver', () => {
  it("starts the session with a device proof bound to the connection's token", async () => {
    const h = harness();

    const result = await h.start();

    expect(result).toEqual({ ok: true });
    expect(h.actions[0]).toEqual({ type: 'starting' });
    const [start] = h.transports[0]!.connection.invocations;
    expect(start!.method).toBe('StartSession');
    expect(start!.request).toMatchObject({ DeviceProof: 'proof-StartSession-token-1', Auto: true, TakeOver: false });
    expect((start!.request as { CommandId: string }).CommandId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('takes the session over from another device only when the user said so', async () => {
    const h = harness({ deps: { takeOver: true } });

    await h.start();

    expect(h.transports[0]!.connection.invocations[0]!.request).toMatchObject({ TakeOver: true });
  });

  it("passes the minutes charged and an ending's notice on to the overlay", async () => {
    const h = harness();
    await h.start();
    const events = h.transports[0]!.events;

    events.usage({ Seq: 1, AtMs: 1, MinutesLeft: 10, SessionMinutes: 4, Warning: 'low_credit' });
    events.sessionEnding({ Seq: 2, AtMs: 2, Reason: 'credit_exhausted', SecondsLeft: 30 });

    expect(h.state()).toMatchObject({
      minutesLeft: 10,
      notice: { code: 'low_credit', text: '10 minutes left.' },
      ending: { reason: 'credit_exhausted', secondsLeft: 30 },
    });
  });

  it("reads the account again when its plan or minutes change, without touching the session's view", async () => {
    const onEntitlementsUpdated = vi.fn();
    const h = harness({ deps: { onEntitlementsUpdated } });
    await h.start();
    const before = h.actions.length;

    h.transports[0]!.events.entitlementsUpdated({ AtMs: 5, Token: 'signed-snapshot' });

    expect(onEntitlementsUpdated).toHaveBeenCalledOnce();
    expect(h.actions).toHaveLength(before);
  });

  it("passes the server's refusal on, and closes the connection", async () => {
    const h = harness({
      connection: (t) =>
        t.connection.replies.set('StartSession', () => ({
          Ok: false,
          Code: ErrorCodes.Licensing.NoEntitlement,
          Message: "Your plan doesn't include live sessions.",
        })),
    });

    const result = await h.start();

    expect(result).toEqual({ ok: false, code: 'no_entitlement', message: "Your plan doesn't include live sessions." });
    expect(h.transports[0]!.stopped).toBe(true);
  });

  it('reads why the server closed a connection it refused', async () => {
    const h = harness({
      connection: (t) =>
        t.connection.replies.set('StartSession', () => {
          t.close(
            new Error(
              'Server returned an error on close: Connection closed with an error. HubException: client_outdated',
            ),
          );
          throw new Error('Invocation canceled due to the underlying connection being closed.');
        }),
    });

    const result = await h.start();

    expect(result).toEqual({
      ok: false,
      code: ErrorCodes.Identity.ClientOutdated,
      message: 'This version of Sotto is out of date. Update it to start a session.',
    });
  });

  it("says Sotto can't be reached when no connection opens", async () => {
    const h = harness({ failFrom: 0 });

    const result = await h.start();

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.Request.Unavailable });
  });

  it("turns the hub's events into the overlay's actions", async () => {
    const h = harness();
    await h.start();

    h.transports[0]!.events.transcriptFinal(hear(1, 'Tell me about yourself.'));

    expect(h.actions).toContainEqual({
      type: 'event',
      event: { name: 'transcriptFinal', e: hear(1, 'Tell me about yourself.') },
    });
    expect(h.state().lastSeq).toBe(1);
  });

  it('sends each command to its hub method, keyed by the C# names', async () => {
    const h = harness();
    await h.start();

    await h.driver.command({ type: 'ask', mode: AskMode.Tip, text: 'Pace?' });
    await h.driver.command({ type: 'trigger', text: null });
    await h.driver.command({ type: 'setMode', auto: false, paused: null });
    await h.driver.command({ type: 'clear' });
    await h.driver.command({ type: 'clearHeard' });
    await h.driver.command({ type: 'endSession' });

    const calls = h.transports[0]!.connection.invocations.slice(1);
    expect(calls.map((call) => call.method)).toEqual([
      'Ask',
      'Trigger',
      'SetMode',
      'Clear',
      'ClearHeard',
      'EndSession',
    ]);
    expect(calls[0]!.request).toMatchObject({ Mode: AskMode.Tip, Text: 'Pace?' });
    expect(calls[1]!.request).toMatchObject({ Text: null });
    expect(calls[2]!.request).toMatchObject({ Auto: false, Paused: null });
    for (const call of calls) expect(call.request).toHaveProperty('CommandId');
  });

  it("sends practice to its hub methods: a start, a typed answer, next and stop (the server's 3.3)", async () => {
    const h = harness();
    await h.start();

    await h.driver.command({ type: 'mockStart', count: 3, focus: PracticeFocus.Technical, questions: null });
    await h.driver.command({ type: 'mockStart', count: 2, focus: PracticeFocus.Mixed, questions: ['Why us?', 'Why now?'] });
    await h.driver.command({ type: 'mockAnswer', text: 'Because of the ledger work.' });
    await h.driver.command({ type: 'mockNext' });
    await h.driver.command({ type: 'mockStop' });

    const calls = h.transports[0]!.connection.invocations.slice(1);
    expect(calls.map((call) => call.method)).toEqual(['MockStart', 'MockStart', 'MockAnswer', 'MockNext', 'MockStop']);
    expect(calls[0]!.request).toMatchObject({ Count: 3, Focus: PracticeFocus.Technical, Questions: null });
    expect(calls[1]!.request).toMatchObject({ Count: 2, Focus: PracticeFocus.Mixed, Questions: ['Why us?', 'Why now?'] });
    // Typed: the server never hears the user, and has no delivery to score without the coach (3.7).
    expect(calls[2]!.request).toMatchObject({ Text: 'Because of the ledger work.', Spoken: false, Metrics: null });
    for (const call of calls) expect(Object.keys(call.request as object)).toContain('CommandId');
    expect(Object.keys(calls[3]!.request as object)).toEqual(['CommandId']);
    expect(Object.keys(calls[4]!.request as object)).toEqual(['CommandId']);
  });

  it('turns the practice events into the practice the page draws', async () => {
    const h = harness();
    await h.start();
    const events = h.transports[0]!.events;
    const status = { State: PracticeState.Answering, N: 1, MainN: 1, Total: 2, Focus: PracticeFocus.Mixed, Difficulty: 1 as const, Last: false, Question: 'Why us?', Error: null };
    events.mockQuestion({ Seq: 1, AtMs: 1, N: 1, MainN: 1, Total: 2, Kind: 0, Question: 'Why us?', Source: 0, Difficulty: 1 });
    events.mockState({ Seq: 2, AtMs: 2, Status: status });

    expect(h.state().practice.turns.map((turn) => turn.question)).toEqual(['Why us?']);
    expect(h.state().practice.status).toMatchObject({ state: PracticeState.Answering, total: 2, question: 'Why us?' });
    expect(h.state().lastSeq).toBe(2);
  });

  it("answers a refused command with the server's code", async () => {
    const h = harness({
      connection: (t) =>
        t.connection.replies.set('Ask', () => ({ Ok: false, Code: 'too_large', Message: 'Too long.' })),
    });
    await h.start();

    const result = await h.driver.command({ type: 'ask', mode: AskMode.Question, text: 'x' });

    expect(result).toEqual({ ok: false, code: 'too_large', message: 'Too long.' });
  });

  it('closes the connection when the session ends, and hears nothing after', async () => {
    const h = harness();
    await h.start();
    const { events } = h.transports[0]!;

    events.sessionEnded({ Seq: 2, AtMs: 2, Reason: 'user' });
    events.transcriptFinal(hear(3, 'Too late.'));

    expect(h.transports[0]!.stopped).toBe(true);
    expect(h.state().phase).toBe('ended');
    expect(h.actions.filter((action) => action.type === 'event')).toHaveLength(1);
  });

  it('lets the command that ended the session have its answer before closing the connection', async () => {
    const h = harness({
      connection: (t) =>
        t.connection.replies.set('EndSession', () => {
          // The server sends SessionEnded before it answers EndSession.
          t.events.sessionEnded({ Seq: 2, AtMs: 2, Reason: 'user' });
          return { Ok: true };
        }),
    });
    await h.start();

    const result = await h.driver.command({ type: 'endSession' });

    expect(result).toEqual({ ok: true });
    expect(h.state().phase).toBe('ended');
    expect(h.transports[0]!.stopped).toBe(true);
  });

  it('says no session runs once it has ended', async () => {
    const h = harness();
    await h.start();
    h.transports[0]!.events.sessionEnded({ Seq: 2, AtMs: 2, Reason: 'user' });

    const result = await h.driver.command({ type: 'clear' });

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.Session.NotInSession });
  });

  it('opens every connection with a DPoP proof of its own, for its own token (Q44)', async () => {
    const h = harness({
      connection: (t, index) => {
        if (index === 1)
          t.connection.replies.set('ResumeSession', () => ({
            Ok: true,
            Value: { SessionId: 'session-1', Replayed: true, LastSeq: 0 },
          }));
      },
    });
    await h.start();

    h.transports[0]!.close(new Error('WebSocket closed with status code: 1006.'));
    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));

    expect(h.dpopProofs).toEqual(['dpop-token-1', 'dpop-token-2']);
    expect(h.transports.map((t) => t.token)).toEqual(['token-1', 'token-2']);
  });

  it('resumes a dropped session on a new connection, from the last event it saw', async () => {
    const h = harness({
      connection: (t, index) => {
        if (index === 1)
          t.connection.replies.set('ResumeSession', () => ({
            Ok: true,
            Value: { SessionId: 'session-1', Replayed: true, LastSeq: 5 },
          }));
      },
    });
    await h.start();
    h.transports[0]!.events.transcriptFinal(hear(5, 'Why this role?'));

    h.transports[0]!.close(new Error('WebSocket closed with status code: 1006.'));

    expect(h.types()).toContain('connectionLost');
    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));
    const [resume] = h.transports[1]!.connection.invocations;
    expect(resume).toMatchObject({
      method: 'ResumeSession',
      request: { SessionId: 'session-1', LastSeq: 5, DeviceProof: 'proof-ResumeSession-token-2' },
    });
    // Every missed event came again: nothing to redraw, though the state is read for the screenshots the server holds.
    expect(h.actions.some((action) => action.type === 'snapshot')).toBe(false);
    expect(h.state()).toMatchObject({ phase: 'live', heard: { finished: 'Why this role?', live: '' } });
  });

  it('redraws from a snapshot when the missed events were too old to replay', async () => {
    const snapshot: SessionSnapshot = { ...snapshotOf('And your strengths?', 40), Auto: true };
    const h = harness({
      connection: (t, index) => {
        if (index !== 1) return;
        t.connection.replies.set('ResumeSession', () => ({
          Ok: true,
          Value: { SessionId: 'session-1', Replayed: false, LastSeq: 40 },
        }));
        t.connection.replies.set('GetState', () => ({ Ok: true, Value: snapshot }));
      },
    });
    await h.start();

    h.transports[0]!.close(new Error('dropped'));

    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));
    expect(h.actions).toContainEqual({ type: 'snapshot', snapshot });
  });

  it('attaches again the screenshots a moved session lost, in their order, from the copies kept here', async () => {
    const kept: Record<string, Uint8Array> = { 'shot-a': new Uint8Array([1]), 'shot-b': new Uint8Array([2]) };
    const h = harness({
      deps: { screenshot: (id) => kept[id] ?? null },
      connection: (t, index) => {
        if (index !== 1) return;
        t.connection.replies.set('ResumeSession', () => ({ Ok: true, Value: { SessionId: 'session-1', Replayed: false, LastSeq: 9 } }));
        // The new server holds none of them: images are never saved.
        t.connection.replies.set('GetState', () => ({ Ok: true, Value: snapshotOf('', 9) }));
      },
    });
    await h.start();
    h.transports[0]!.events.attachments({ Seq: 3, AtMs: 3, Items: [{ Id: 'shot-a' }, { Id: 'shot-b' }], Max: 5 });

    h.transports[0]!.close(new Error('dropped'));

    await vi.waitFor(() => expect(h.transports[1]!.connection.methods().filter((m) => m === 'AttachScreenshot')).toHaveLength(2));
    const attached = h.transports[1]!.connection.invocations.filter((call) => call.method === 'AttachScreenshot');
    expect(attached.map((call) => call.request)).toMatchObject([
      { Id: 'shot-a', Bytes: kept['shot-a'] },
      { Id: 'shot-b', Bytes: kept['shot-b'] },
    ]);
  });

  it('attaches nothing again that the server still holds, or that is no longer kept here', async () => {
    const h = harness({
      deps: { screenshot: (id) => (id === 'shot-a' ? new Uint8Array([1]) : null) },
      connection: (t, index) => {
        if (index !== 1) return;
        t.connection.replies.set('ResumeSession', () => ({ Ok: true, Value: { SessionId: 'session-1', Replayed: true, LastSeq: 3 } }));
        t.connection.replies.set('GetState', () => ({ Ok: true, Value: { ...snapshotOf('', 3), Attachments: [{ Id: 'shot-a' }] } }));
      },
    });
    await h.start();
    h.transports[0]!.events.attachments({ Seq: 3, AtMs: 3, Items: [{ Id: 'shot-a' }, { Id: 'shot-gone' }], Max: 5 });

    h.transports[0]!.close(new Error('dropped'));

    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));
    expect(h.transports[1]!.connection.methods()).not.toContain('AttachScreenshot');
  });

  it('sends a screenshot to attach, to take back, and to ask about at once, with its note', async () => {
    const h = harness();
    await h.start();
    const bytes = new Uint8Array([137, 80, 78, 71]);

    await h.driver.command({ type: 'attachScreenshot', id: 'shot-a', bytes });
    await h.driver.command({ type: 'detachScreenshot', id: 'shot-a' });
    await h.driver.command({ type: 'screenshotQuery', id: 'shot-b', bytes, hint: 'the second loop' });

    const calls = h.transports[0]!.connection.invocations.slice(-3);
    expect(calls).toMatchObject([
      { method: 'AttachScreenshot', request: { Id: 'shot-a', Bytes: bytes } },
      { method: 'DetachScreenshot', request: { Id: 'shot-a' } },
      { method: 'ScreenshotQuery', request: { Id: 'shot-b', Bytes: bytes, Hint: 'the second loop' } },
    ]);
  });

  it('ends the session when the server says it expired', async () => {
    const h = harness({
      connection: (t, index) => {
        if (index === 1)
          t.connection.replies.set('ResumeSession', () => ({
            Ok: false,
            Code: ErrorCodes.Session.SessionExpired,
            Message: 'Gone.',
          }));
      },
    });
    await h.start();

    h.transports[0]!.close(new Error('dropped'));

    await vi.waitFor(() => expect(h.state().phase).toBe('ended'));
    expect(h.actions.at(-1)).toEqual({ type: 'ended', reason: 'expired' });
    expect(h.transports[1]!.stopped).toBe(true);
  });

  it("keeps trying with longer waits, and gives up once the server's grace is over", async () => {
    const h = harness({ failFrom: 1, deps: { retryDelaysMs: [1_000, 2_000, 4_000], giveUpAfterMs: 10_000 } });
    await h.start();

    h.transports[0]!.close(new Error('dropped'));

    await vi.waitFor(() => expect(h.state().phase).toBe('ended'));
    expect(h.sleeps).toEqual([1_000, 2_000, 4_000, 4_000]);
    expect(h.transports).toHaveLength(5);
    expect(h.actions.at(-1)).toEqual({ type: 'ended', reason: 'expired' });
  });

  it('says a command must wait while it reconnects', async () => {
    const h = harness({ deps: { sleep: () => new Promise(() => {}) } });
    await h.start();
    h.transports[0]!.close(new Error('dropped'));

    const result = await h.driver.command({ type: 'clear' });

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.Request.Unavailable });
  });

  it('does not reconnect a session that was closed here', async () => {
    const h = harness();
    await h.start();

    h.driver.dispose();
    h.transports[0]!.close(new Error('dropped'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.transports).toHaveLength(1);
    expect(h.types()).not.toContain('connectionLost');
  });
});

const pcm = (n: number) => Uint8Array.from({ length: 8 }, () => n % 256);
const seqs = (frames: AudioFrame[]) => frames.map((f) => f.Seq);

describe("the hub driver's audio upload (1.12)", () => {
  it("streams the call's sound once the session starts, numbered from 0, keyed by the C# names", async () => {
    const h = harness();
    await h.start();

    h.driver.audio(pcm(1), 1_000);
    h.driver.audio(pcm(2), 1_100);

    const [stream] = h.transports[0]!.connection.streams;
    expect(stream!.method).toBe('UploadAudio');
    expect(stream!.items).toEqual([
      { Seq: 0, CapturedAtMs: 1_000, Pcm: pcm(1) },
      { Seq: 1, CapturedAtMs: 1_100, Pcm: pcm(2) },
    ]);
  });

  it('sends nothing before the session started', async () => {
    const h = harness();
    h.driver.audio(pcm(1), 1_000);

    await h.start();

    expect(h.transports[0]!.connection.streams[0]!.items).toEqual([]);
  });

  it('sends nothing while paused, and goes on numbering where it left off', async () => {
    const h = harness();
    await h.start();
    const events = h.transports[0]!.events;
    h.driver.audio(pcm(1), 1);

    events.status({ Seq: 1, AtMs: 1, Auto: true, Paused: true, Stt: 'ok' });
    h.driver.audio(pcm(2), 2);
    events.status({ Seq: 2, AtMs: 2, Auto: true, Paused: false, Stt: 'ok' });
    h.driver.audio(pcm(3), 3);

    expect(seqs(h.transports[0]!.connection.streams[0]!.items)).toEqual([0, 1]);
    expect(h.transports[0]!.connection.streams[0]!.items[1]!.Pcm).toEqual(pcm(3));
  });

  it('sends the newest 10 s again after a resume, then carries on, with frames from the drop among them', async () => {
    const h = harness({
      connection: (t, index) => {
        if (index === 1)
          t.connection.replies.set('ResumeSession', () => ({
            Ok: true,
            Value: { SessionId: 'session-1', Replayed: true, LastSeq: 0 },
          }));
      },
    });
    await h.start();
    for (let i = 0; i < 120; i++) h.driver.audio(pcm(i), i);

    h.transports[0]!.close(new Error('WebSocket closed with status code: 1006.'));
    // Captured while the connection was down: kept among the newest.
    h.driver.audio(pcm(120), 120);
    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));
    h.driver.audio(pcm(121), 121);

    expect(resendFrames).toBe(100);
    const resumed = h.transports[1]!.connection.streams[0]!;
    expect(resumed.method).toBe('UploadAudio');
    expect(seqs(resumed.items)).toEqual(Array.from({ length: 101 }, (_, i) => 21 + i));
  });

  it('leaves the stream to end with its connection when the session is closed here, and sends nothing after', async () => {
    const h = harness();
    await h.start();

    h.driver.dispose();
    h.driver.audio(pcm(1), 1);

    // Completing it would queue a message SignalR sends only after the stop, which refuses it, unhandled.
    const [stream] = h.transports[0]!.connection.streams;
    expect(h.transports[0]!.stopped).toBe(true);
    expect(stream!.completed).toBe(false);
    expect(stream!.items).toEqual([]);
  });

  it('sends nothing once the server ended the session', async () => {
    const h = harness();
    await h.start();
    h.transports[0]!.events.sessionEnded({ Seq: 1, AtMs: 1, Reason: 'user' });

    h.driver.audio(pcm(1), 1);

    expect(h.transports[0]!.connection.streams[0]!.items).toEqual([]);
  });
});

describe("the hub driver's proof at connect (1.12)", () => {
  it("opens each connection with a proof of its own, bound to that connection's token", async () => {
    const h = harness({
      connection: (t, index) => {
        if (index === 1)
          t.connection.replies.set('ResumeSession', () => ({
            Ok: true,
            Value: { SessionId: 'session-1', Replayed: true, LastSeq: 0 },
          }));
      },
    });
    await h.start();

    h.transports[0]!.close(new Error('WebSocket closed with status code: 1006.'));
    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));

    // The server takes a proof once, and only with the token it was made for.
    expect(h.transports.map((t) => [t.token, t.deviceProof])).toEqual([
      ['token-1', 'proof-connect-token-1-1'],
      ['token-2', 'proof-connect-token-2-2'],
    ]);
  });

  it.each([
    [
      ErrorCodes.Identity.DeviceNotRegistered,
      'This computer was removed from your account. Restart Sotto to add it again.',
    ],
    [
      ErrorCodes.Identity.DeviceProofInvalid,
      "Sotto couldn't confirm this computer. Check that its clock is set right, then try again.",
    ],
    [
      ErrorCodes.Request.RateLimited,
      'Sotto is connected on too many of your computers right now. Close it on one, or wait a minute, then try again.',
    ],
  ])('says in its own words why the server refused this computer at connect (%s)', async (code, message) => {
    const h = harness({
      connection: (t) =>
        t.connection.replies.set('StartSession', () => {
          t.close(
            new Error(`Server returned an error on close: Connection closed with an error. HubException: ${code}`),
          );
          throw new Error('Invocation canceled due to the underlying connection being closed.');
        }),
    });

    expect(await h.start()).toEqual({ ok: false, code, message });
  });

  it("fails the start in the account's words, without connecting, when this computer can't sign a proof", async () => {
    const h = harness({
      deps: {
        connectProof: async () => {
          throw new ApiError(401, ErrorCodes.Identity.DeviceNotRegistered, 'This computer is not registered yet.');
        },
      },
    });

    const result = await h.start();

    expect(result).toEqual({
      ok: false,
      code: ErrorCodes.Identity.DeviceNotRegistered,
      message: 'This computer is not registered yet.',
    });
    expect(h.transports).toEqual([]);
  });

  it('keeps trying to resume while a proof cannot be made, then ends the session as expired', async () => {
    let failing = false;
    const h = harness({
      deps: {
        connectProof: async (token) => {
          if (failing)
            throw new ApiError(401, ErrorCodes.Identity.DeviceNotRegistered, 'This computer is not registered yet.');
          return `proof-connect-${token}`;
        },
        giveUpAfterMs: 30_000,
      },
    });
    await h.start();

    failing = true;
    h.transports[0]!.close(new Error('WebSocket closed with status code: 1006.'));

    await vi.waitFor(() => expect(h.state().phase).toBe('ended'));
    expect(h.state().endReason).toBe('expired');
    expect(h.transports).toHaveLength(1);
  });
});

describe("the hub driver's documents for a session (1.14)", () => {
  const context = { Name: 'Sam Rivera', Resume: 'Backend engineer.', JobDescription: 'Payments.', Notes: null };

  it('sends this computer\'s documents once the session has started, keyed by the C# names', async () => {
    const h = harness({ deps: { context } });

    expect(await h.start()).toEqual({ ok: true });

    const [started, setContext] = h.transports[0]!.connection.invocations;
    expect([started!.method, setContext!.method]).toEqual(['StartSession', 'SetContext']);
    expect(setContext!.request).toMatchObject(context);
    expect((setContext!.request as { CommandId: string }).CommandId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends nothing when there are no documents', async () => {
    const h = harness({ deps: { context: null } });
    await h.start();
    expect(h.transports[0]!.connection.methods()).toEqual(['StartSession']);
  });

  it('sends the prep doc after the documents, with its name and whether it was cut (3.10)', async () => {
    const prepDoc = { Name: 'system-design.pdf', Text: 'Caching\nLoad balancing', Cut: true };
    const h = harness({ deps: { context, prepDoc } });

    await h.start();

    expect(h.transports[0]!.connection.methods()).toEqual(['StartSession', 'SetContext', 'SetPrepDoc']);
    expect(h.transports[0]!.connection.invocations[2]!.request).toMatchObject(prepDoc);
  });

  it('sends a prep doc without the other documents, and none when there is none (3.10)', async () => {
    const alone = harness({ deps: { context: null, prepDoc: { Name: null, Text: 'Notes.', Cut: false } } });
    await alone.start();
    expect(alone.transports[0]!.connection.methods()).toEqual(['StartSession', 'SetPrepDoc']);

    const none = harness({ deps: { context, prepDoc: null } });
    await none.start();
    expect(none.transports[0]!.connection.methods()).toEqual(['StartSession', 'SetContext']);
  });

  it('sends the preferences last, after the documents and the prep doc (3.8)', async () => {
    const preferences = {
      CustomInstructions: 'Keep answers short.',
      PreparedAnswers: [{ Id: 'intro', Phrasings: ['Tell me about yourself'], Answer: 'I build payment systems.' }],
    };
    const h = harness({ deps: { context, prepDoc: { Name: 'p.pdf', Text: 'x', Cut: false }, preferences } });

    await h.start();

    expect(h.transports[0]!.connection.methods()).toEqual(['StartSession', 'SetContext', 'SetPrepDoc', 'SetPreferences']);
    expect(h.transports[0]!.connection.invocations[3]!.request).toMatchObject(preferences);
  });

  it('sends no preferences when there are none, and starts even when the server refuses them (3.8)', async () => {
    const none = harness({ deps: { context, preferences: null } });
    await none.start();
    expect(none.transports[0]!.connection.methods()).not.toContain('SetPreferences');

    const refused = harness({
      deps: { context: null, preferences: { CustomInstructions: 'x', PreparedAnswers: [] } },
      connection: (t) => t.connection.replies.set('SetPreferences', () => ({ Ok: false, Code: 'too_long', Message: 'Too long.' })),
    });
    expect(await refused.start()).toEqual({ ok: true });
    expect(refused.transports[0]!.connection.methods()).toEqual(['StartSession', 'SetPreferences']);
  });

  it('starts the session even when the server refuses the prep doc (3.10)', async () => {
    const h = harness({
      deps: { context, prepDoc: { Name: 'p.pdf', Text: 'x', Cut: false } },
      connection: (t) => t.connection.replies.set('SetPrepDoc', () => ({ Ok: false, Code: 'too_long', Message: 'Too long.' })),
    });
    expect(await h.start()).toEqual({ ok: true });
  });

  it('starts the session even when the server refuses the documents: it then answers only when asked', async () => {
    const h = harness({
      deps: { context },
      connection: (t) => t.connection.replies.set('SetContext', () => ({ Ok: false, Code: 'too_long', Message: 'Too long.' })),
    });

    expect(await h.start()).toEqual({ ok: true });
  });

  it("doesn't send them again after a resume: the session kept them", async () => {
    const h = harness({
      deps: { context },
      connection: (t, index) => {
        if (index === 1) t.connection.replies.set('ResumeSession', () => ({ Ok: true, Value: { SessionId: 'session-1', Replayed: true, LastSeq: 0 } }));
      },
    });
    await h.start();

    h.transports[0]!.close(new Error('WebSocket closed with status code: 1006.'));
    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));

    // The state is read for the screenshots the server holds (3.6); the documents are not sent again.
    expect(h.transports[1]!.connection.methods()).toEqual(['ResumeSession', 'GetState']);
  });
});
