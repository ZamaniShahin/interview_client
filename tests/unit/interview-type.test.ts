// The interview's type (Q47, v1 0.4.0's TECH / INTRO switch): what the overlay shows comes from the server's word
// (`Status`, the snapshot); the overlay's command goes to the hub as `SetInterviewType`; a session starts by sending the
// user's last choice; the preview echoes it as the server does; the setting is kept between sessions.
import { describe, expect, it } from 'vitest';
import { HubDriver } from '../../src/main/session/hub-driver';
import { PreviewDriver } from '../../src/main/session/preview-driver';
import {
  InterviewTypes,
  SessionPhase,
  type HubConnectionLike,
  type SessionSnapshot,
  type StatusEvent,
} from '../../src/shared/contracts/sotto-contracts';
import { overlayCommandSchema } from '../../src/shared/ipc';
import { reduceLive, type LiveAction, type LiveEvent } from '../../src/shared/live/reducer';
import { initialLiveState, interviewTypeOf, interviewTypes } from '../../src/shared/live/view-state';
import { defaultSettings, settingsPatchSchema, settingsSchema } from '../../src/shared/settings';
import type { LiveTransport } from '../../src/main/connection/live-connection';

let seq = 0;
const status = (InterviewType: string): LiveAction => ({
  type: 'event',
  event: {
    name: 'status',
    e: { Seq: ++seq, AtMs: seq, Auto: true, Paused: false, Stt: 'ok', InterviewType } satisfies StatusEvent,
  },
});

const snapshot = (InterviewType: string): SessionSnapshot => ({
  SessionId: 'session-1',
  Phase: SessionPhase.Live,
  Auto: true,
  Paused: false,
  ContextReady: true,
  Heard: '',
  LastSeq: 3,
  Attachments: [],
  MaxAttachments: 5,
  PrepDoc: null,
  CustomInstructionsChars: 0,
  PreparedInPrompt: [],
  Practice: null,
  InterviewType,
});

describe("the interview's type in the overlay's state", () => {
  it('is technical before the server says anything, as v1 and the server start', () => {
    expect(initialLiveState.interviewType).toBe('technical');
  });

  it("flips on the server's Status, both ways and as often as it comes", () => {
    let state = initialLiveState;
    for (const type of ['intro', 'technical', 'intro', 'intro', 'technical'] as const) {
      state = reduceLive(state, status(type));
      expect(state.interviewType).toBe(type);
    }
  });

  it.each(['', 'Intro', 'TECHNICAL', 'casual', ' intro'])('keeps what it had when Status says %j', (spelling) => {
    const intro = reduceLive(initialLiveState, status('intro'));

    expect(reduceLive(intro, status(spelling)).interviewType).toBe('intro');
  });

  it('takes the snapshot after a (re)connect, and keeps what it had when the snapshot spells it oddly', () => {
    const fromSnapshot = reduceLive(initialLiveState, { type: 'snapshot', snapshot: snapshot('intro') });
    expect(fromSnapshot.interviewType).toBe('intro');

    expect(reduceLive(fromSnapshot, { type: 'snapshot', snapshot: snapshot('behavioral') }).interviewType).toBe(
      'intro',
    );
    expect(reduceLive(fromSnapshot, { type: 'snapshot', snapshot: snapshot('technical') }).interviewType).toBe(
      'technical',
    );
  });

  it('keeps the rest of Status as it was: the type is one more field, not a reset', () => {
    const state = reduceLive(initialLiveState, status('intro'));

    expect([state.auto, state.paused, state.listening, state.phase]).toEqual([true, false, 'ok', 'idle']);
  });

  it.each([
    ['intro', 'intro'],
    ['technical', 'technical'],
    ['Intro', null],
    ['', null],
    [null, null],
    [undefined, null],
    [2, null],
    [{ type: 'intro' }, null],
  ])('reads %j as %j', (value, read) => {
    expect(interviewTypeOf(value)).toBe(read);
  });

  it('lists the two types in the order the strip shows them', () => {
    expect(interviewTypes).toEqual([InterviewTypes.Technical, InterviewTypes.Intro]);
  });
});

describe("the overlay's command (renderer to main)", () => {
  it.each(['intro', 'technical'])('takes %s', (interviewType) => {
    expect(overlayCommandSchema.safeParse({ type: 'setInterviewType', interviewType }).success).toBe(true);
  });

  it.each([['Intro'], ['TECH'], [''], [null], [undefined], [1]])('refuses %j', (interviewType) => {
    expect(overlayCommandSchema.safeParse({ type: 'setInterviewType', interviewType }).success).toBe(false);
  });

  it('refuses one without its type', () => {
    expect(overlayCommandSchema.safeParse({ type: 'setInterviewType' }).success).toBe(false);
  });
});

describe('the setting', () => {
  it('defaults to technical', () => {
    expect(defaultSettings.interviewType).toBe('technical');
    expect(settingsSchema.safeParse(defaultSettings).success).toBe(true);
  });

  it.each(['intro', 'technical'])('keeps %s', (interviewType) => {
    expect(settingsPatchSchema.safeParse({ interviewType }).success).toBe(true);
  });

  it.each(['casual', 'Intro', '', null])('refuses %j', (interviewType) => {
    expect(settingsPatchSchema.safeParse({ interviewType }).success).toBe(false);
  });
});

// ---- The hub driver --------------------------------------------------------------------------------------------------

class Connection implements HubConnectionLike {
  readonly invocations: { method: string; request: unknown }[] = [];

  async invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    this.invocations.push({ method, request: args[0] });
    return (
      method === 'StartSession'
        ? { Ok: true, Value: { SessionId: 'session-1', Phase: SessionPhase.Live } }
        : { Ok: true }
    ) as T;
  }

  async send(): Promise<void> {}
  on(): void {}
  off(): void {}
}

function hub(interviewType?: 'intro' | 'technical' | null) {
  const connection = new Connection();
  const transport: LiveTransport = {
    connection,
    start: async () => {},
    stop: async () => {},
    onClose: () => {},
  } as unknown as LiveTransport;
  const driver = new HubDriver({
    connect: () => transport,
    accessToken: async () => 'token',
    connectProof: async () => 'proof',
    dpopProof: async () => 'dpop',
    proof: async () => 'proof',
    auto: false,
    context: { Name: 'Sam', Resume: 'Résumé.', JobDescription: 'Job.', Notes: null },
    interviewType,
  });
  return { driver, connection };
}

describe("the hub driver's interview type", () => {
  it.each(['intro', 'technical'] as const)('sends the choice %s first of all, before the documents', async (type) => {
    const { driver, connection } = hub(type);

    expect(
      await driver.start(
        () => {},
        () => initialLiveState,
      ),
    ).toEqual({ ok: true });

    expect(connection.invocations.map((c) => c.method)).toEqual(['StartSession', 'SetInterviewType', 'SetContext']);
    expect(connection.invocations[1]!.request).toMatchObject({ Type: type });
    expect((connection.invocations[1]!.request as { CommandId: string }).CommandId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([null, undefined])('sends none when there is no choice (%j): the server starts technical', async (type) => {
    const { driver, connection } = hub(type);

    await driver.start(
      () => {},
      () => initialLiveState,
    );

    expect(connection.invocations.map((c) => c.method)).toEqual(['StartSession', 'SetContext']);
  });

  it("puts the overlay's command to the hub with its C# names", async () => {
    const { driver, connection } = hub(null);
    await driver.start(
      () => {},
      () => initialLiveState,
    );

    expect(await driver.command({ type: 'setInterviewType', interviewType: 'intro' })).toEqual({ ok: true });

    const call = connection.invocations.at(-1)!;
    expect(call.method).toBe('SetInterviewType');
    expect(Object.keys(call.request as object).sort()).toEqual(['CommandId', 'Type']);
    expect(call.request).toMatchObject({ Type: 'intro' });
  });
});

// ---- The preview: the development stand-in for the hub -----------------------------------------------------------------

describe("the preview's interview type", () => {
  it('echoes a switch in Status, as the server does, and starts technical', async () => {
    const driver = new PreviewDriver({ interview: false });
    const events: LiveEvent[] = [];
    let state = initialLiveState;
    await driver.start((action) => {
      if (action.type === 'event') events.push(action.event);
      state = reduceLive(state, action);
    });

    expect(await driver.command({ type: 'setInterviewType', interviewType: 'intro' })).toEqual({ ok: true });
    const echo = events.filter((e) => e.name === 'status').at(-1)!;
    expect(echo.name === 'status' && echo.e.InterviewType).toBe('intro');
    expect(state.interviewType).toBe('intro');

    await driver.command({ type: 'setInterviewType', interviewType: 'technical' });
    expect(state.interviewType).toBe('technical');
    driver.dispose();
  });
});
