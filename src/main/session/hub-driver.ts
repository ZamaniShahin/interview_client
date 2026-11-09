// Drives a live session over the hub (checkpoint 1.12). It starts the session with a device proof, turns the hub's
// events into reducer actions, sends the overlay's commands, and after a drop reconnects and resumes the session with
// the last sequence number it saw. The server keeps a suspended session for 2 minutes (backend docs/02 §11); past
// that, or if the server says it expired, the session ends here too.
import { randomUUID } from 'node:crypto';
import {
  createLiveHub,
  ErrorCodes,
  SessionEndReasons,
  type Ack,
  type LiveClient,
  type LiveHub,
} from '../../shared/contracts/sotto-contracts';
import type { CommandResult } from '../../shared/ipc';
import type { LiveAction, LiveEvent } from '../../shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../shared/live/view-state';
import type { LiveTransport } from '../connection/live-connection';
import type { SessionCommand, SessionDriver } from './session-controller';

export interface HubDriverDependencies {
  /** Opens a connection carrying this access token and calling `events`; not started yet. */
  connect: (accessToken: string, events: LiveClient) => LiveTransport;
  accessToken: () => Promise<string>;
  /** A device proof for the hub method, bound to the connection's token. */
  proof: (method: 'StartSession' | 'ResumeSession', accessToken: string) => Promise<string>;
  /** Start in AUTO (the default); MANUAL when the user chose it. */
  auto: boolean;
  /**
   * End the account's live session on another device and start here. Only after the user said yes to it, never by
   * default (the contract's `TakeOver`).
   */
  takeOver?: boolean;
  /** The account's plan or minutes changed (`EntitlementsUpdated`): main reads the account again. */
  onEntitlementsUpdated?: () => void;
  /** Waits between reconnection attempts; the last one repeats. */
  retryDelaysMs?: number[];
  /** How long a dropped session may take to resume: the server's suspend grace. */
  giveUpAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Opened {
  hub: LiveHub;
  /** The access token the connection carries: the device proofs sent over it are bound to it. */
  token: string;
  /** Why the server closed the connection, once it has. */
  closeError: () => Error | null;
}

const unreachable: CommandResult = {
  ok: false,
  code: ErrorCodes.Request.Unavailable,
  message: "Can't reach Sotto right now. Your session is kept while it reconnects.",
};

export class HubDriver implements SessionDriver {
  private transport: LiveTransport | null = null;
  private hub: LiveHub | null = null;
  private sessionId: string | null = null;
  private disposed = false;
  /** The server said the session ended; the connection closes once no command waits on it. */
  private ended = false;
  private pending = 0;
  private dispatch: (action: LiveAction) => void = () => {};
  private state: () => LiveViewState = () => initialLiveState;

  constructor(private readonly deps: HubDriverDependencies) {}

  async start(dispatch: (action: LiveAction) => void, state: () => LiveViewState): Promise<CommandResult> {
    this.dispatch = dispatch;
    this.state = state;
    dispatch({ type: 'starting' });
    let opened: Opened | null = null;
    try {
      opened = await this.open();
      const ack = await opened.hub.startSession({
        CommandId: randomUUID(),
        DeviceProof: await this.deps.proof('StartSession', opened.token),
        Auto: this.deps.auto,
        TakeOver: this.deps.takeOver ?? false,
      });
      if (!ack.Ok || !ack.Value) {
        this.dispose();
        return toResult(ack);
      }
      this.sessionId = ack.Value.SessionId;
      return { ok: true };
    } catch (error) {
      // The server refuses a connection after the handshake, by closing it with the reason: that beats whatever the
      // pending call failed with.
      const reason = opened?.closeError() ?? error;
      this.dispose();
      return failure(reason);
    }
  }

  async command(command: SessionCommand): Promise<CommandResult> {
    const hub = this.hub;
    if (!this.sessionId || this.disposed || this.ended) {
      return { ok: false, code: ErrorCodes.Session.NotInSession, message: 'No session is running.' };
    }
    if (!hub) return unreachable;
    this.pending += 1;
    try {
      return toResult(await send(hub, command, randomUUID()));
    } catch {
      return unreachable;
    } finally {
      this.pending -= 1;
      if (this.ended && this.pending === 0) this.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    const transport = this.transport;
    this.transport = null;
    this.hub = null;
    void transport?.stop().catch(() => {});
  }

  /**
   * Every hub event becomes a reducer action. The session's end also closes the connection, but not under a command
   * still waiting: the server sends `SessionEnded` before it answers the `EndSession` that caused it.
   */
  private readonly events: LiveClient = {
    status: (e) => this.emit({ name: 'status', e }),
    transcriptPartial: (e) => this.emit({ name: 'transcriptPartial', e }),
    transcriptFinal: (e) => this.emit({ name: 'transcriptFinal', e }),
    speechStarted: (e) => this.emit({ name: 'speechStarted', e }),
    answerStart: (e) => this.emit({ name: 'answerStart', e }),
    answerDelta: (e) => this.emit({ name: 'answerDelta', e }),
    answerDone: (e) => this.emit({ name: 'answerDone', e }),
    answerCancelled: (e) => this.emit({ name: 'answerCancelled', e }),
    answerFailed: (e) => this.emit({ name: 'answerFailed', e }),
    cleared: (e) => this.emit({ name: 'cleared', e }),
    notice: (e) => this.emit({ name: 'notice', e }),
    usage: (e) => this.emit({ name: 'usage', e }),
    sessionEnding: (e) => this.emit({ name: 'sessionEnding', e }),
    sessionEnded: (e) => {
      this.emit({ name: 'sessionEnded', e });
      this.ended = true;
      if (this.pending === 0) this.dispose();
    },
    // The account's, not the session's: it has no Seq and is never replayed, so it skips the overlay's state.
    entitlementsUpdated: () => {
      if (!this.disposed) this.deps.onEntitlementsUpdated?.();
    },
  };

  private emit(event: LiveEvent): void {
    if (!this.disposed) this.dispatch({ type: 'event', event });
  }

  /** Opens a connection with a fresh access token, and remembers it as the current one. */
  private async open(): Promise<Opened> {
    const token = await this.deps.accessToken();
    const transport = this.deps.connect(token, this.events);
    let closeError: Error | null = null;
    transport.onClose((error) => {
      // The first reason counts: stopping a closed connection reports no error.
      closeError ??= error ?? null;
      this.closed(transport);
    });
    await transport.start();
    if (this.disposed) {
      await transport.stop().catch(() => {});
      throw new Error('The session was closed.');
    }
    this.transport = transport;
    this.hub = createLiveHub(transport.connection);
    return { hub: this.hub, token, closeError: () => closeError };
  }

  private closed(transport: LiveTransport): void {
    // Only a drop of the current connection, during a session that is still going, is worth resuming.
    if (transport !== this.transport || this.disposed || !this.sessionId || this.state().phase === 'ended') return;
    this.transport = null;
    this.hub = null;
    this.dispatch({ type: 'connectionLost' });
    void this.resume();
  }

  private async resume(): Promise<void> {
    const delays = this.deps.retryDelaysMs ?? [1_000, 2_000, 4_000, 8_000, 10_000];
    const giveUpAfter = this.deps.giveUpAfterMs ?? 120_000;
    const now = this.deps.now ?? Date.now;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const startedAt = now();

    for (let attempt = 0; !this.disposed && now() - startedAt < giveUpAfter; attempt++) {
      await sleep(delays[Math.min(attempt, delays.length - 1)]!);
      if (this.disposed) return;
      try {
        const { hub, token } = await this.open();
        const ack = await hub.resumeSession({
          CommandId: randomUUID(),
          SessionId: this.sessionId!,
          LastSeq: this.state().lastSeq,
          DeviceProof: await this.deps.proof('ResumeSession', token),
        });
        if (!ack.Ok) {
          if (ack.Code === ErrorCodes.Session.SessionExpired) {
            this.end(SessionEndReasons.Expired);
            return;
          }
          throw new Error(ack.Code ?? 'The session could not be resumed.');
        }
        // Events after LastSeq were replayed through the new connection; if some were too old to keep, redraw.
        if (!ack.Value?.Replayed) {
          const snapshot = await hub.getState();
          if (snapshot.Ok && snapshot.Value) this.dispatch({ type: 'snapshot', snapshot: snapshot.Value });
        }
        this.dispatch({ type: 'connectionRestored' });
        return;
      } catch {
        const transport = this.transport;
        this.transport = null;
        this.hub = null;
        await transport?.stop().catch(() => {});
      }
    }
    if (!this.disposed) this.end(SessionEndReasons.Expired);
  }

  private end(reason: string): void {
    this.dispatch({ type: 'ended', reason });
    this.dispose();
  }
}

/** Each overlay command to its hub method; the request keys are the C# names. */
function send(hub: LiveHub, command: SessionCommand, CommandId: string): Promise<Ack> {
  switch (command.type) {
    case 'ask':
      return hub.ask({ CommandId, Mode: command.mode, Text: command.text });
    case 'trigger':
      return hub.trigger({ CommandId, Text: command.text });
    case 'setMode':
      return hub.setMode({ CommandId, Auto: command.auto, Paused: command.paused });
    case 'clear':
      return hub.clear({ CommandId });
    case 'clearHeard':
      return hub.clearHeard({ CommandId });
    case 'endSession':
      return hub.endSession({ CommandId });
  }
}

function toResult(ack: Ack<unknown>): CommandResult {
  return ack.Ok
    ? { ok: true }
    : { ok: false, code: ack.Code ?? ErrorCodes.Request.Internal, message: ack.Message ?? 'Something went wrong.' };
}

const knownCodes = new Set(Object.values(ErrorCodes).flatMap((group) => Object.values(group) as string[]));

/** The words for the codes a connection is refused with: the HubException carries the code alone. */
const refusals: Record<string, string> = {
  [ErrorCodes.Identity.ClientOutdated]: 'This version of Sotto is out of date. Update it to start a session.',
  [ErrorCodes.Identity.AccountSuspended]: 'This account is suspended.',
  [ErrorCodes.Identity.Unauthenticated]: 'Sign in again to start a session.',
};

/**
 * A failure before the session started. The server refuses a connection with a HubException carrying a code
 * (`client_outdated`, `account_suspended`); SignalR passes it on as "… HubException: <code>".
 */
function failure(error: unknown): CommandResult {
  const text = error instanceof Error ? error.message : String(error);
  const code = /HubException: ([a-z_]+)/.exec(text)?.[1];
  if (code && knownCodes.has(code)) {
    return { ok: false, code, message: refusals[code] ?? `Sotto refused the session (${code}).` };
  }
  return { ok: false, code: ErrorCodes.Request.Unavailable, message: "Can't reach Sotto right now." };
}
