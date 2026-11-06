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
