// Gap fillers (backend Q47, v1 0.3.0's): the overlay's line to say while an answer loads. v1's renderer cases
// (ui/tests/renderer-cases.js), ported to the state the overlay draws from, and more around each: up at once; an older
// answer's text never takes it down; its own answer's first text, or its end, does; a new one replaces it; an empty
// one, Clear, practice, a reconnect and the session's end take it down. Then the switch: sent with the preferences,
// and a change sent to a running session.
import { describe, expect, it } from 'vitest';
import { HubDriver } from '../../src/main/session/hub-driver';
import { PreviewDriver } from '../../src/main/session/preview-driver';
import { SessionController } from '../../src/main/session/session-controller';
import {
  AnswerKind,
  AskMode,
  ErrorCodes,
  PracticeState,
  SessionEndReasons,
  SessionPhase,
  type HubConnectionLike,
  type SessionSnapshot,
} from '../../src/shared/contracts/sotto-contracts';
import type { LiveTransport } from '../../src/main/connection/live-connection';
import { reduceLive, type LiveAction, type LiveEvent } from '../../src/shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../src/shared/live/view-state';
import { defaultSettings, settingsPatchSchema } from '../../src/shared/settings';

let seq = 0;
const stamp = () => ({ Seq: ++seq, AtMs: seq });
const ev = (event: LiveEvent): LiveAction => ({ type: 'event', event });

const filler = (Text: string) => ev({ name: 'gapFiller', e: { ...stamp(), Text } });
const start = (AnswerId: string) =>
  ev({
    name: 'answerStart',
    e: { ...stamp(), AnswerId, Question: 'Q?', Kind: AnswerKind.Spoken, Instruction: null, ScreenshotIds: [] },
  });
const delta = (AnswerId: string, Text = 'So, at Acme') =>
  ev({ name: 'answerDelta', e: { ...stamp(), AnswerId, Text } });
const done = (AnswerId: string) => ev({ name: 'answerDone', e: { ...stamp(), AnswerId } });
const cancelled = (AnswerId: string) => ev({ name: 'answerCancelled', e: { ...stamp(), AnswerId } });
const failed = (AnswerId: string, Code: string = ErrorCodes.Ai.ProviderUnavailable) =>
  ev({ name: 'answerFailed', e: { ...stamp(), AnswerId, Code, Message: 'The model stopped responding.' } });

const run = (...actions: LiveAction[]): LiveViewState => actions.reduce(reduceLive, initialLiveState);
const line = 'Hmm.... let me <b>think</b> of a good example here....';

describe("the overlay's gap filler", () => {
  it('goes up at once, as the text it is', () => {
    expect(run(filler(line)).gapFiller).toEqual({ text: line, answerId: null });
  });

  it("stays while an older answer streams and ends, and goes with its own answer's first text", () => {
    // An early trigger: the server waits for the interviewer's last words while the previous answer may still stream.
    let state = run(start('old'), filler(line), delta('old', 'the old answer, still coming'), done('old'));
    expect(state.gapFiller?.text).toBe(line);

    state = reduceLive(state, start('new'));
    expect(state.gapFiller).toEqual({ text: line, answerId: 'new' });
    state = reduceLive(state, delta('new'));
    expect(state.gapFiller).toBeNull();
    state = reduceLive(reduceLive(state, delta('new', ' we had...')), done('new'));
    expect(state.gapFiller).toBeNull();
  });

  it('is claimed by the first answer to start after it, never a later one', () => {
    const state = run(filler(line), start('first'), start('second'), delta('second'));

    expect(state.gapFiller).toEqual({ text: line, answerId: 'first' });
  });

  it.each([
    ['ends with no text', done],
    ['is cancelled', cancelled],
    ['fails', failed],
    ['is blocked by the output filter', (id: string) => failed(id, ErrorCodes.Ai.OutputBlocked)],
  ])('goes when its answer %s', (_, end) => {
    expect(run(filler(line), start('a'), end('a')).gapFiller).toBeNull();
  });

  it.each([
    ['done', done],
    ['cancelled', cancelled],
    ['failed', failed],
  ])('stays when an older answer is %s', (_, end) => {
    expect(run(start('old'), filler(line), end('old')).gapFiller?.text).toBe(line);
  });

  it('is replaced by a new one', () => {
    expect(run(filler('Okay.... let me think....'), filler('Right.... give me a second....')).gapFiller?.text).toBe(
      'Right.... give me a second....',
    );
  });

  it.each(['', ' ', '\t\n'])('goes with an empty one (%j)', (text) => {
    expect(run(filler(line), filler(text)).gapFiller).toBeNull();
  });

  it('goes with Clear', () => {
    expect(run(filler(line), ev({ name: 'cleared', e: stamp() })).gapFiller).toBeNull();
  });

  it('goes when practice starts', () => {
    // Made in order: an event older than the line would be ignored as replayed.
    const up = filler(line);
    const practice = ev({
      name: 'mockState',
      e: {
        ...stamp(),
        Status: {
          State: PracticeState.Preparing,
          N: 0,
          MainN: 0,
          Total: 5,
          Focus: 'mixed',
          Difficulty: 'medium',
          Last: false,
          Question: '',
        } as never,
      },
    });

    expect(run(up, practice).gapFiller).toBeNull();
  });

  it("goes with the session's end", () => {
    const up = filler(line);
    const ended = ev({ name: 'sessionEnded', e: { ...stamp(), Reason: SessionEndReasons.User } });

    expect(run(up, ended).gapFiller).toBeNull();
  });

  it('goes with a reconnect: the snapshot is drawn again without it', () => {
    const snapshot: SessionSnapshot = {
      SessionId: 's',
      Phase: SessionPhase.Live,
      Auto: true,
      Paused: false,
      ContextReady: true,
      Heard: '',
      LastSeq: 1,
      Attachments: [],
      MaxAttachments: 5,
      PrepDoc: null,
      CustomInstructionsChars: 0,
      PreparedInPrompt: [],
      Practice: null,
      InterviewType: 'technical',
    };

    expect(run(filler(line), { type: 'snapshot', snapshot }).gapFiller).toBeNull();
  });

  it('stays through what has nothing to do with it: Heard, a notice, attachments', () => {
    const state = run(
      filler(line),
      ev({ name: 'transcriptPartial', e: { ...stamp(), Text: 'How do' } }),
      ev({ name: 'notice', e: { ...stamp(), Code: 'x', Text: 'Something.' } }),
      ev({ name: 'attachments', e: { ...stamp(), Items: [], Max: 5 } }),
    );

    expect(state.gapFiller?.text).toBe(line);
  });

  it('ignores an event replayed from before it', () => {
    const state = run(filler(line));
    const old: LiveAction = ev({ name: 'gapFiller', e: { Seq: 0, AtMs: 0, Text: '' } });

    expect(reduceLive(state, old).gapFiller?.text).toBe(line);
  });
});

describe('the setting', () => {
  it('is on by default, as v1', () => {
    expect(defaultSettings.gapFillers).toBe(true);
  });

  it.each([true, false])('takes %s', (gapFillers) => {
    expect(settingsPatchSchema.safeParse({ gapFillers }).success).toBe(true);
  });

  it.each(['on', 1, null])('refuses %j', (gapFillers) => {
    expect(settingsPatchSchema.safeParse({ gapFillers }).success).toBe(false);
  });
});

// ---- What the hub is sent ------------------------------------------------------------------------------------------

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

function hub(deps: { gapFillers?: boolean; withPreferences?: boolean }) {
  const connection = new Connection();
  const transport = {
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
    preferences: deps.withPreferences ? { CustomInstructions: 'Short answers.', PreparedAnswers: [] } : null,
    gapFillers: deps.gapFillers,
  });
  return { driver, connection };
}

describe("the hub driver's gap fillers", () => {
  it.each([
    [true, true, { CustomInstructions: 'Short answers.', PreparedAnswers: [], GapFillers: true }],
    [false, true, { CustomInstructions: 'Short answers.', PreparedAnswers: [], GapFillers: false }],
    [false, false, { CustomInstructions: null, PreparedAnswers: null, GapFillers: false }],
    [undefined, true, { CustomInstructions: 'Short answers.', PreparedAnswers: [], GapFillers: null }],
  ] as const)('with the setting %s and preferences %s, sends %j', async (gapFillers, withPreferences, sent) => {
    const { driver, connection } = hub({ gapFillers, withPreferences });

    await driver.start(
      () => {},
      () => initialLiveState,
    );

    const call = connection.invocations.find((c) => c.method === 'SetPreferences');
    expect(call?.request).toMatchObject(sent);
  });

  it.each([true, undefined])(
    'sends no preferences at all when there are none and the setting is %s',
    async (gapFillers) => {
      const { driver, connection } = hub({ gapFillers, withPreferences: false });

      await driver.start(
        () => {},
        () => initialLiveState,
      );

      expect(connection.invocations.map((c) => c.method)).not.toContain('SetPreferences');
    },
  );

  it.each([true, false])(
    'puts a change mid-session (%s) to the hub as preferences with only the switch',
    async (on) => {
      const { driver, connection } = hub({});
      await driver.start(
        () => {},
        () => initialLiveState,
      );

      expect(await driver.command({ type: 'setGapFillers', on })).toEqual({ ok: true });

      const call = connection.invocations.at(-1)!;
      expect(call.method).toBe('SetPreferences');
      expect(call.request).toMatchObject({ CustomInstructions: null, PreparedAnswers: null, GapFillers: on });
    },
  );
});

describe("the session's switch", () => {
  it('is sent to the running session, and to none when none runs', async () => {
    const sent: unknown[] = [];
    const controller = new SessionController(() => {});

    expect(await controller.setGapFillers(false)).toMatchObject({ ok: false, code: ErrorCodes.Session.NotInSession });

    await controller.start({
      start: async () => ({ ok: true }),
      command: async (command) => {
        sent.push(command);
        return { ok: true };
      },
      dispose: () => {},
    });
    expect(await controller.setGapFillers(false)).toEqual({ ok: true });
    expect(sent).toEqual([{ type: 'setGapFillers', on: false }]);
  });
});

describe("the preview's gap fillers", () => {
  it('shows a line before each answer to say, and none once switched off', async () => {
    const driver = new PreviewDriver({ interview: false });
    const events: LiveEvent[] = [];
    await driver.start((action) => {
      if (action.type === 'event') events.push(action.event);
    });

    await driver.command({ type: 'ask', mode: AskMode.Question, text: 'Why us?' });
    await new Promise((resolve) => setTimeout(resolve, 900));
    const names = events.map((e) => e.name);
    expect(names.indexOf('gapFiller')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('gapFiller')).toBeLessThan(names.indexOf('answerStart'));

    await driver.command({ type: 'setGapFillers', on: false });
    const before = events.filter((e) => e.name === 'gapFiller').length;
    await driver.command({ type: 'ask', mode: AskMode.Question, text: 'Why now?' });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(events.filter((e) => e.name === 'gapFiller').length).toBe(before);
    driver.dispose();
  });
});
