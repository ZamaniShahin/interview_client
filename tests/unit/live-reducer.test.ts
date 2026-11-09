import { describe, expect, it } from 'vitest';
import {
  AnswerKind,
  ErrorCodes,
  SessionEndReasons,
  SessionPhase,
  SpeechStates,
} from '../../src/shared/contracts/sotto-contracts';
import { reduceLive, type LiveAction, type LiveEvent } from '../../src/shared/live/reducer';
import { initialLiveState, isLookingBack, visibleAnswerIndex } from '../../src/shared/live/view-state';

let seq = 0;
const stamp = () => ({ Seq: ++seq, AtMs: 1_800_000_000_000 + seq });
const ev = (event: LiveEvent): LiveAction => ({ type: 'event', event });
const run = (...actions: LiveAction[]) => actions.reduce(reduceLive, { ...initialLiveState });

const start = (id: string, question = 'How does Kafka keep messages in order?') =>
  ev({ name: 'answerStart', e: { ...stamp(), AnswerId: id, Question: question, Kind: AnswerKind.Spoken, Instruction: null } });
const delta = (id: string, text: string) => ev({ name: 'answerDelta', e: { ...stamp(), AnswerId: id, Text: text } });
const done = (id: string) => ev({ name: 'answerDone', e: { ...stamp(), AnswerId: id } });
const cancelled = (id: string) => ev({ name: 'answerCancelled', e: { ...stamp(), AnswerId: id } });
const failed = (id: string, code: string, message: string) =>
  ev({ name: 'answerFailed', e: { ...stamp(), AnswerId: id, Code: code, Message: message } });
const partial = (text: string) => ev({ name: 'transcriptPartial', e: { ...stamp(), Text: text } });
const final = (text: string) => ev({ name: 'transcriptFinal', e: { ...stamp(), Text: text } });
const status = (auto: boolean, paused: boolean, stt: string) =>
  ev({ name: 'status', e: { ...stamp(), Auto: auto, Paused: paused, Stt: stt } });

describe('the live view state', () => {
  it('streams an answer in and ends it done', () => {
    const s = run(start('a'), delta('a', 'So ***Kafka*** only'), delta('a', ' guarantees order'), done('a'));
    expect(s.answers).toHaveLength(1);
    expect(s.answers[0]).toMatchObject({ text: 'So ***Kafka*** only guarantees order', ending: 'done' });
  });

  it('stops the answer still writing when a newer question starts, and keeps what it showed', () => {
    const s = run(start('a'), delta('a', 'half an answer'), start('b', 'And hot keys?'));
    expect(s.answers.map((a) => a.ending)).toEqual(['stopped', 'writing']);
    expect(s.answers[0]!.text).toBe('half an answer');
  });

  it('marks an answer stopped when the server says a newer question took over', () => {
    const s = run(start('a'), delta('a', 'text'), cancelled('a'));
    expect(s.answers[0]!.ending).toBe('stopped');
  });

  it('removes what a blocked answer had shown', () => {
    const s = run(start('a'), delta('a', 'the rules say'), failed('a', ErrorCodes.Ai.OutputBlocked, "This answer can't be shown."));
    expect(s.answers[0]).toMatchObject({ ending: 'hidden', text: '', failureMessage: null });
  });

  it("keeps a failed answer's text with the server's plain words", () => {
    const s = run(start('a'), delta('a', 'First I would'), failed('a', ErrorCodes.Ai.ProviderUnavailable, 'Try again.'));
    expect(s.answers[0]).toMatchObject({ ending: 'failed', text: 'First I would', failureMessage: 'Try again.' });
  });

  it('ignores pieces of an answer that has already ended', () => {
    const s = run(start('a'), delta('a', 'one'), done('a'), delta('a', ' two'));
    expect(s.answers[0]!.text).toBe('one');
  });

  it('tells the phrase still being spoken apart from the finished words', () => {
    const s = run(final('Okay, great. Next one.'), partial('Okay, great. Next one. Can you walk me through'));
    expect(s.heard).toEqual({ finished: 'Okay, great. Next one.', live: 'Can you walk me through' });
  });

  it('starts Heard over when an answer starts', () => {
    const s = run(final('Design a URL shortener.'), start('a', 'Design a URL shortener.'));
    expect(s.heard).toEqual({ finished: '', live: '' });
  });

  it("reads listening's degraded state as down, and reconnecting as reconnecting", () => {
    expect(run(status(true, false, SpeechStates.Degraded)).listening).toBe('down');
    expect(run(status(true, false, SpeechStates.Reconnecting)).listening).toBe('reconnecting');
    expect(run(status(true, false, SpeechStates.Ok)).listening).toBe('ok');
  });

  it('takes a starting session live with its first status', () => {
    const s = run({ type: 'starting' }, status(false, true, SpeechStates.Ok));
    expect(s).toMatchObject({ phase: 'live', auto: false, paused: true });
  });

  it('ignores an event it has already applied, as a resume may replay it', () => {
    const first = start('a');
    const s = run(first, delta('a', 'once'), first);
    expect(s.answers).toHaveLength(1);
  });

  it('leaves someone looking back where they are when a new answer starts', () => {
    let s = run(start('a'), done('a'), start('b'), done('b'));
    s = reduceLive(s, { type: 'view', index: 0 });
    s = reduceLive(s, start('c'));
    expect(visibleAnswerIndex(s)).toBe(0);
    expect(isLookingBack(s)).toBe(true);
  });

  it('follows the newest answer again when the newest is chosen', () => {
    let s = run(start('a'), done('a'), start('b'));
    s = reduceLive(s, { type: 'view', index: 0 });
    s = reduceLive(s, { type: 'view', index: 1 });
    expect(s.viewing).toBeNull();
  });

  it('forgets the answers and what was heard when cleared', () => {
    const s = run(start('a'), done('a'), partial('next'), ev({ name: 'cleared', e: stamp() }));
    expect(s.answers).toEqual([]);
    expect(s.heard).toEqual({ finished: '', live: '' });
  });

  it('stops the answer still writing when the session ends, and says why', () => {
    const s = run(start('a'), ev({ name: 'sessionEnded', e: { ...stamp(), Reason: SessionEndReasons.CreditExhausted } }));
    expect(s).toMatchObject({ phase: 'ended', endReason: SessionEndReasons.CreditExhausted });
    expect(s.answers[0]!.ending).toBe('stopped');
  });

  it('brings back the mode and the question so far from a snapshot after reconnecting', () => {
    const s = run(
      { type: 'connectionLost' },
      {
        type: 'snapshot',
        snapshot: {
          SessionId: 's',
          Phase: SessionPhase.Live,
          Auto: false,
          Paused: false,
          ContextReady: false,
          Heard: 'So say the cache',
          LastSeq: 900,
        },
      },
    );
    expect(s).toMatchObject({ phase: 'live', auto: false, autoAvailable: false, lastSeq: 900 });
    expect(s.heard.finished).toBe('So say the cache');
  });

  it('keeps the minutes and the tier when a new session starts', () => {
    const s = run({ type: 'account', minutesLeft: 187, tier: 'smart' }, start('a'), { type: 'starting' });
    expect(s).toMatchObject({ minutesLeft: 187, tier: 'smart', answers: [], phase: 'starting' });
  });
});

const usage = (minutesLeft: number | null, warning: string | null = null) =>
  ev({ name: 'usage', e: { ...stamp(), MinutesLeft: minutesLeft, SessionMinutes: 3, Warning: warning } });
const ending = (reason: string, secondsLeft = 30) =>
  ev({ name: 'sessionEnding', e: { ...stamp(), Reason: reason, SecondsLeft: secondsLeft } });

describe("the session's minutes and its endings", () => {
  it('follows the balance each time a minute is charged', () => {
    const s = run({ type: 'account', minutesLeft: 30, tier: 'fast' }, usage(29), usage(28));
    expect(s).toMatchObject({ minutesLeft: 28, notice: null });
  });

  it('shows no balance on a plan without minutes', () => {
    expect(run({ type: 'account', minutesLeft: 30, tier: 'smart' }, usage(null)).minutesLeft).toBeNull();
  });

  it.each([
    [10, '10 minutes left.'],
    [2, '2 minutes left.'],
    [1, '1 minute left.'],
  ])('gives a quiet note at %i minutes left', (left, text) => {
    expect(run(usage(left, 'low_credit')).notice).toEqual({ code: 'low_credit', text });
  });

  it('shows the fast tier once the session passes its AI ceiling', () => {
    const s = run({ type: 'account', minutesLeft: 100, tier: 'smart' }, usage(99, 'cost_tier_down'));
    expect(s).toMatchObject({ tier: 'fast', minutesLeft: 99, notice: null });
  });

  it('ignores a usage event a resume replays', () => {
    const first = usage(20);
    const s = run(first, usage(19), first);
    expect(s.minutesLeft).toBe(19);
  });

  it('announces an ending, then forgets it once the session ends', () => {
    const announced = run(start('a'), ending(SessionEndReasons.CreditExhausted));
    expect(announced.ending).toEqual({ reason: SessionEndReasons.CreditExhausted, secondsLeft: 30 });

    const s = reduceLive(announced, ev({ name: 'sessionEnded', e: { ...stamp(), Reason: SessionEndReasons.CreditExhausted } }));
    expect(s).toMatchObject({ phase: 'ended', ending: null, endReason: SessionEndReasons.CreditExhausted });
  });

  it.each([
    ['something is heard', () => partial('So tell me')],
    ['a phrase ends', () => final('So tell me about Kafka.')],
    ['an answer starts', () => start('a')],
    ['a command is accepted', (): LiveAction => ({ type: 'commandAccepted' })],
  ])('forgets an inactivity ending once %s', (_, action) => {
    const s = run(ending(SessionEndReasons.Inactive, 60), action());
    expect(s.ending).toBeNull();
  });

  it('keeps every other ending, whatever is heard or asked', () => {
    const s = run(ending(SessionEndReasons.CreditExhausted), partial('Still talking'), start('a'), { type: 'commandAccepted' });
    expect(s.ending).toEqual({ reason: SessionEndReasons.CreditExhausted, secondsLeft: 30 });
  });

  it("starts the next session without the last one's ending", () => {
    expect(run(ending(SessionEndReasons.MaxLength), { type: 'starting' }).ending).toBeNull();
  });
});

describe("this computer's sound, as captured (1.11)", () => {
  it('follows what main reports, and starts the next session idle', () => {
    const reported = run({ type: 'capture', status: { level: 0.6, noSound: false, down: false } });
    expect(reported.capture).toEqual({ level: 0.6, noSound: false, down: false });

    expect(reduceLive(reported, { type: 'starting' }).capture).toEqual({ level: null, noSound: false, down: false });
  });
});
