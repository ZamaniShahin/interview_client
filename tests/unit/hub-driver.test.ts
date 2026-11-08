import { describe, expect, it, vi } from 'vitest';
import type { LiveTransport } from '../../src/main/connection/live-connection';
import { HubDriver, type HubDriverDependencies } from '../../src/main/session/hub-driver';
import {
  AskMode,
  ErrorCodes,
  SessionPhase,
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

  async send(): Promise<void> {}
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

  const driver = new HubDriver({
    connect: (token, events) => {
      const index = transports.length;
      const failing = setup.failFrom !== undefined && index >= setup.failFrom;
      const transport = new FakeTransport(token, events, failing ? new Error('WebSocket failed to connect.') : null);
      transport.connection.replies.set('StartSession', () => sessionStarted);
      setup.connection?.(transport, index);
      transports.push(transport);
      return transport;
    },
    accessToken: async () => `token-${++tokens}`,
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
    actions,
    sleeps,
    state: () => state,
    start: () => driver.start(dispatch, () => state),
    types: () => actions.map((action) => action.type),
  };
}

const hear = (seq: number, text: string) => ({ Seq: seq, AtMs: seq, Text: text });

describe('the hub driver', () => {
  it("starts the session with a device proof bound to the connection's token", async () => {
    const h = harness();

    const result = await h.start();

    expect(result).toEqual({ ok: true });
    expect(h.actions[0]).toEqual({ type: 'starting' });
    const [start] = h.transports[0]!.connection.invocations;
    expect(start!.method).toBe('StartSession');
    expect(start!.request).toMatchObject({ DeviceProof: 'proof-StartSession-token-1', Auto: true });
    expect((start!.request as { CommandId: string }).CommandId).toMatch(/^[0-9a-f-]{36}$/);
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
          t.close(new Error('Server returned an error on close: Connection closed with an error. HubException: client_outdated'));
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

    expect(h.actions).toContainEqual({ type: 'event', event: { name: 'transcriptFinal', e: hear(1, 'Tell me about yourself.') } });
    expect(h.state().lastSeq).toBe(1);
  });

  it("sends each command to its hub method, keyed by the C# names", async () => {
    const h = harness();
    await h.start();

    await h.driver.command({ type: 'ask', mode: AskMode.Tip, text: 'Pace?' });
    await h.driver.command({ type: 'trigger', text: null });
    await h.driver.command({ type: 'setMode', auto: false, paused: null });
    await h.driver.command({ type: 'clear' });
    await h.driver.command({ type: 'clearHeard' });
    await h.driver.command({ type: 'endSession' });

    const calls = h.transports[0]!.connection.invocations.slice(1);
    expect(calls.map((call) => call.method)).toEqual(['Ask', 'Trigger', 'SetMode', 'Clear', 'ClearHeard', 'EndSession']);
    expect(calls[0]!.request).toMatchObject({ Mode: AskMode.Tip, Text: 'Pace?' });
    expect(calls[1]!.request).toMatchObject({ Text: null });
    expect(calls[2]!.request).toMatchObject({ Auto: false, Paused: null });
    for (const call of calls) expect(call.request).toHaveProperty('CommandId');
  });

  it("answers a refused command with the server's code", async () => {
    const h = harness({
      connection: (t) => t.connection.replies.set('Ask', () => ({ Ok: false, Code: 'too_large', Message: 'Too long.' })),
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

  it('resumes a dropped session on a new connection, from the last event it saw', async () => {
    const h = harness({
      connection: (t, index) => {
        if (index === 1) t.connection.replies.set('ResumeSession', () => ({ Ok: true, Value: { SessionId: 'session-1', Replayed: true, LastSeq: 5 } }));
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
    // Every missed event came again: nothing to redraw.
    expect(h.transports[1]!.connection.methods()).not.toContain('GetState');
    expect(h.state().phase).toBe('live');
  });

  it('redraws from a snapshot when the missed events were too old to replay', async () => {
    const snapshot: SessionSnapshot = {
      SessionId: 'session-1',
      Phase: SessionPhase.Live,
      Auto: true,
      Paused: false,
      ContextReady: false,
      Heard: 'And your strengths?',
      LastSeq: 40,
    };
    const h = harness({
      connection: (t, index) => {
        if (index !== 1) return;
        t.connection.replies.set('ResumeSession', () => ({ Ok: true, Value: { SessionId: 'session-1', Replayed: false, LastSeq: 40 } }));
        t.connection.replies.set('GetState', () => ({ Ok: true, Value: snapshot }));
      },
    });
    await h.start();

    h.transports[0]!.close(new Error('dropped'));

    await vi.waitFor(() => expect(h.types().at(-1)).toBe('connectionRestored'));
    expect(h.actions).toContainEqual({ type: 'snapshot', snapshot });
  });

  it('ends the session when the server says it expired', async () => {
    const h = harness({
      connection: (t, index) => {
        if (index === 1) t.connection.replies.set('ResumeSession', () => ({ Ok: false, Code: ErrorCodes.Session.SessionExpired, Message: 'Gone.' }));
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
