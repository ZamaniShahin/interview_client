// Drives a live session over the hub (checkpoint 1.12). It starts the session with a device proof, turns the hub's
// events into reducer actions, sends the overlay's commands, and after a drop reconnects and resumes the session with
// the last sequence number it saw. The server keeps a suspended session for 2 minutes (backend docs/02 §11); past
// that, or if the server says it expired, the session ends here too.
import { randomUUID } from 'node:crypto';
import { Subject } from '@microsoft/signalr';
import {
  createLiveHub,
  ErrorCodes,
  SessionEndReasons,
  type Ack,
  type AudioFrame,
  type LiveClient,
  type LiveHub,
  type SetContextRequest,
  type SetPreferencesRequest,
  type SetPrepDocRequest,
} from '../../shared/contracts/sotto-contracts';
import type { CommandResult } from '../../shared/ipc';
import type { LiveAction, LiveEvent } from '../../shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../shared/live/view-state';
import { ApiError } from '../api/rest-client';
import type { LiveTransport } from '../connection/live-connection';
import type { SessionCommand, SessionDriver } from './session-controller';

export interface HubDriverDependencies {
  /** Opens a connection carrying this access token and device proof, and calling `events`; not started yet. */
  connect: (accessToken: string, deviceProof: string, events: LiveClient) => LiveTransport;
  accessToken: () => Promise<string>;
  /** The device proof a connection opens with, bound to its token: one per connection (backend docs/04 §6). */
  connectProof: (accessToken: string) => Promise<string>;
  /** A device proof for the hub method, bound to the connection's token. */
  proof: (method: 'StartSession' | 'ResumeSession', accessToken: string) => Promise<string>;
  /** Start in AUTO (the default); MANUAL when the user chose it. */
  auto: boolean;
  /**
   * This computer's documents, sent once the session has started (`SetContext`), keyed by the C# names. AUTO answers
   * only once the résumé and the job description are in (the server's rule). Null sends none.
   */
  context?: Omit<SetContextRequest, 'CommandId'> | null;
  /** The prep doc, sent after the documents (`SetPrepDoc`, 3.10): its name, its text and whether it was cut. */
  prepDoc?: Omit<SetPrepDocRequest, 'CommandId'> | null;
  /** The custom instructions and the bank's enabled entries, sent last (`SetPreferences`, 3.8). */
  preferences?: Omit<SetPreferencesRequest, 'CommandId'> | null;
  /**
   * End the account's live session on another device and start here. Only after the user said yes to it, never by
   * default (the contract's `TakeOver`).
   */
  takeOver?: boolean;
  /** The account's plan or minutes changed (`EntitlementsUpdated`): main reads the account again. */
  onEntitlementsUpdated?: () => void;
  /**
   * A kept screenshot's bytes by its id (3.6): after a resume, what was attached here and the server no longer holds
   * (a session that moved: the server keeps no image) is attached again.
   */
  screenshot?: (id: string) => Uint8Array | null;
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

/**
 * The newest 10 s of the call's sound (100 frames): what a resume sends again (client README, "Audio capture
 * details"). The server drops a frame it has seen, by its `Seq`, so sending one twice is harmless.
 */
export const resendFrames = 100;

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
  /** The audio stream on the current connection (`UploadAudio`); null between a drop and its resume. */
  private upload: Subject<AudioFrame> | null = null;
  /** The session's frames are numbered from 0, across reconnects: the server keeps the highest it has seen. */
  private nextSeq = 0;
  private readonly recent: AudioFrame[] = [];

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
      this.openUpload(opened.hub);
      await this.sendContext(opened.hub);
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

  /**
   * A frame of the call's sound: numbered, kept among the newest 10 s, and streamed up when a connection carries the
   * session. Between a drop and its resume it only waits among the newest. Nothing goes while paused: the server
   * drops paused audio anyway (backend docs/02 §4).
   */
  audio(pcm: Uint8Array, capturedAtMs: number): void {
    if (!this.sessionId || this.disposed || this.ended || this.state().paused) return;
    const frame: AudioFrame = { Seq: this.nextSeq++, CapturedAtMs: capturedAtMs, Pcm: pcm };
    this.recent.push(frame);
    if (this.recent.length > resendFrames) this.recent.shift();
    this.upload?.next(frame);
  }

  dispose(): void {
    this.disposed = true;
    const transport = this.transport;
    this.transport = null;
    this.hub = null;
    // The upload ends with the connection, as the server expects (LiveHub.UploadAudio), and isn't completed first:
    // SignalR queues a stream's completion on a promise it never handles, sent only after this stop, which refuses it.
    this.upload = null;
    void transport?.stop().catch(() => {});
  }

  /**
   * Opens the audio stream on a connection (`UploadAudio`, a call that lasts as long as the connection), and sends
   * the newest frames first: after a resume, the server takes the ones it hadn't seen.
   */
  private openUpload(hub: LiveHub): void {
    const upload = new Subject<AudioFrame>();
    this.upload = upload;
    // A stream that fails ends with its connection; the next resume opens another.
    void hub.uploadAudio(upload).catch(() => {});
    for (const frame of this.recent) upload.next(frame);
  }

  /**
   * This computer's documents for the session, once, right after it starts, then the prep doc: a resume keeps them on
   * the server. A refusal or a drop leaves the session running without them, answering only when asked, as the strip
   * then says.
   */
  private async sendContext(hub: LiveHub): Promise<void> {
    const context = this.deps.context;
    if (context) await hub.setContext({ CommandId: randomUUID(), ...context }).catch(() => undefined);
    const prepDoc = this.deps.prepDoc;
    if (prepDoc) await hub.setPrepDoc({ CommandId: randomUUID(), ...prepDoc }).catch(() => undefined);
    const preferences = this.deps.preferences;
    if (preferences) await hub.setPreferences({ CommandId: randomUUID(), ...preferences }).catch(() => undefined);
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
    attachments: (e) => this.emit({ name: 'attachments', e }),
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
    mockState: (e) => this.emit({ name: 'mockState', e }),
    mockQuestion: (e) => this.emit({ name: 'mockQuestion', e }),
    mockFeedback: (e) => this.emit({ name: 'mockFeedback', e }),
    mockSummary: (e) => this.emit({ name: 'mockSummary', e }),
  };

  private emit(event: LiveEvent): void {
    if (!this.disposed) this.dispatch({ type: 'event', event });
  }

  /** Opens a connection with a fresh access token, and remembers it as the current one. */
  private async open(): Promise<Opened> {
    const token = await this.deps.accessToken();
    // A fresh proof each time: the server takes each one once, and only with the token it was made for.
    const transport = this.deps.connect(token, await this.deps.connectProof(token), this.events);
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
    // The stream went with its connection; frames wait among the newest until the resume.
    this.upload = null;
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
        // What was attached here before the drop, read before a snapshot redraws it.
        const attached = this.state().attachments.ids;
        // Events after LastSeq were replayed through the new connection; if some were too old to keep, redraw.
        const snapshot = await hub.getState();
        if (!ack.Value?.Replayed && snapshot.Ok && snapshot.Value)
          this.dispatch({ type: 'snapshot', snapshot: snapshot.Value });
        this.openUpload(hub);
        this.dispatch({ type: 'connectionRestored' });
        if (snapshot.Ok && snapshot.Value)
          await this.reattach(
            hub,
            attached,
            snapshot.Value.Attachments.map((a) => a.Id),
          );
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

  /**
   * After a resume: the screenshots attached here that the server no longer holds go again, in their order, from the
   * copies kept in main (the server keeps no image, so a session that moved has none). One it refuses is let go.
   */
  private async reattach(hub: LiveHub, attached: string[], held: string[]): Promise<void> {
    for (const id of attached) {
      if (held.includes(id) || this.disposed) continue;
      const bytes = this.deps.screenshot?.(id);
      if (!bytes) continue;
      await hub.attachScreenshot({ CommandId: randomUUID(), Id: id, Bytes: bytes }).catch(() => undefined);
    }
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
    case 'attachScreenshot':
      return hub.attachScreenshot({ CommandId, Id: command.id, Bytes: command.bytes });
    case 'detachScreenshot':
      return hub.detachScreenshot({ CommandId, Id: command.id });
    case 'screenshotQuery':
      return hub.screenshotQuery({ CommandId, Id: command.id, Bytes: command.bytes, Hint: command.hint });
    // Practice (the server's 3.3). An answer is typed until the speech coach (3.7) transcribes spoken ones on this
    // computer: then `Spoken` and its `Metrics`. The server never hears the user.
    case 'mockStart':
      return hub.mockStart({ CommandId, Count: command.count, Focus: command.focus, Questions: command.questions });
    case 'mockAnswer':
      return hub.mockAnswer({ CommandId, Text: command.text, Spoken: false, Metrics: null });
    case 'mockNext':
      return hub.mockNext({ CommandId });
    case 'mockStop':
      return hub.mockStop({ CommandId });
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
  // The account removed this computer meanwhile; at its next start the app registers it again (journey J4).
  [ErrorCodes.Identity.DeviceNotRegistered]:
    'This computer was removed from your account. Restart Sotto to add it again.',
  // A proof is good for a minute either way of the server's clock, so a wrong clock is the likely cause.
  [ErrorCodes.Identity.DeviceProofInvalid]:
    "Sotto couldn't confirm this computer. Check that its clock is set right, then try again.",
  // At connect, the only limit is the user's: three connections at a time, every computer together (Q36). A place comes
  // free as one closes, or within 90 s of a server that stopped.
  [ErrorCodes.Request.RateLimited]:
    'Sotto is connected on too many of your computers right now. Close it on one, or wait a minute, then try again.',
};

/**
 * A failure before the session started. The server refuses a connection with a HubException carrying a code
 * (`client_outdated`, `account_suspended`, `device_proof_invalid`…); SignalR passes it on as "… HubException: <code>".
 * A proof this computer can't make (not registered yet) fails with the account's own code and words.
 */
function failure(error: unknown): CommandResult {
  if (error instanceof ApiError) return { ok: false, code: error.code, message: error.message };
  const text = error instanceof Error ? error.message : String(error);
  const code = /HubException: ([a-z_]+)/.exec(text)?.[1];
  if (code && knownCodes.has(code)) {
    return { ok: false, code, message: refusals[code] ?? `Sotto refused the session (${code}).` };
  }
  return { ok: false, code: ErrorCodes.Request.Unavailable, message: "Can't reach Sotto right now." };
}
