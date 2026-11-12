// Practice (Shahin, 2026-11-12, with the server's 3.3): what the Practice page may ask, the practice drawn from the
// hub's events, main's practice session (it starts the session then the practice, keeps it in history once its summary
// comes, then ends the session), and the preview's scripted interviewer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AskMode,
  ErrorCodes,
  PracticeDifficulty,
  PracticeFocus,
  PracticeQuestionSource,
  PracticeState,
  PracticeTurnKind,
  SessionEndReasons,
  SessionPhase,
  type PracticeStatus,
} from '../../src/shared/contracts/sotto-contracts';
import type { CommandResult } from '../../src/shared/ipc';
import { reduceLive, type LiveAction, type LiveEvent } from '../../src/shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../src/shared/live/view-state';
import {
  idlePractice,
  lowestQuestions,
  practiceActionSchema,
  practiceBusy,
  practiceEndedText,
  practiceEndingText,
  practiceLimits,
  practiceStartSchema,
  type PracticeRecord,
  type PracticeView,
} from '../../src/shared/practice';
import { PracticeRun, type PracticeRunDependencies } from '../../src/main/session/practice-run';
import { PreviewDriver } from '../../src/main/session/preview-driver';
import { previewQuestionMs, previewScore, previewScoreMs } from '../../src/main/session/preview-practice';
import type { SessionCommand, SessionDriver } from '../../src/main/session/session-controller';

// ---- The hub's practice events, as a test writes them ----------------------------------------------------------

const status = (over: Partial<PracticeStatus> = {}): PracticeStatus => ({
  State: PracticeState.Answering,
  N: 1,
  MainN: 1,
  Total: 3,
  Focus: PracticeFocus.Mixed,
  Difficulty: PracticeDifficulty.Medium,
  Last: false,
  Question: 'Why payments?',
  Error: null,
  ...over,
});

const mockState = (seq: number, s: PracticeStatus | null): LiveEvent => ({
  name: 'mockState',
  e: { Seq: seq, AtMs: seq, Status: s },
});

const mockQuestion = (seq: number, n: number, question: string, kind: PracticeTurnKind = PracticeTurnKind.Main) => ({
  name: 'mockQuestion' as const,
  e: {
    Seq: seq,
    AtMs: seq,
    N: n,
    MainN: kind === PracticeTurnKind.Main ? n : n - 1,
    Total: 3,
    Kind: kind,
    Question: question,
    Source: PracticeQuestionSource.Model,
    Difficulty: PracticeDifficulty.Medium,
  },
});

const mockFeedback = (seq: number, n: number, score: number | null, answer = 'An answer.') => ({
  name: 'mockFeedback' as const,
  e: {
    Seq: seq,
    AtMs: seq,
    N: n,
    Kind: PracticeTurnKind.Main,
    Question: `Question ${n}`,
    Answer: answer,
    Spoken: false,
    Metrics: null,
    Score: score,
    Good: ['Clear.'],
    Improve: ['Add a number.'],
    ModelAnswer: 'A stronger one.',
    Prepared: '',
    Raw: false,
  },
});

const mockSummary = (seq: number, average: number | null = 6) => ({
  name: 'mockSummary' as const,
  e: {
    Seq: seq,
    AtMs: seq,
    Asked: 1,
    Answered: 1,
    Average: average,
    Turns: [
      {
        N: 1,
        Kind: PracticeTurnKind.Main,
        Question: 'Q1',
        Source: PracticeQuestionSource.Model,
        Score: 6,
        Answered: true,
      },
    ],
    Best: null,
    Worst: null,
    TalkSeconds: 0,
    Wpm: null,
    Fillers: 0,
    FillersPer100Words: null,
    Focus: PracticeFocus.Mixed,
    Difficulty: PracticeDifficulty.Medium,
    Tips: ['Add a number.'],
  },
});

const apply = (events: LiveEvent[], from: LiveViewState = initialLiveState) =>
  events.reduce((state, event) => reduceLive(state, { type: 'event', event }), from);

// ---- What the page may ask ----------------------------------------------------------------------------------------

describe('what the Practice page may ask of main', () => {
  it.each([1, 2, 5, 9, 10])('starts %i questions', (count) => {
    expect(practiceStartSchema.safeParse({ count, focus: PracticeFocus.Mixed, questions: null }).success).toBe(true);
  });

  it.each([PracticeFocus.Mixed, PracticeFocus.Behavioral, PracticeFocus.Technical])('on focus %i', (focus) => {
    expect(practiceStartSchema.safeParse({ count: 5, focus, questions: null }).success).toBe(true);
  });

  it('takes the questions chosen, trimmed, 1 to 10 of them, each 400 characters at most', () => {
    const parsed = practiceStartSchema.parse({ count: 1, focus: 0, questions: ['  Why us?  ', 'q'.repeat(400)] });
    expect(parsed.questions).toEqual(['Why us?', 'q'.repeat(400)]);
    const ten = Array.from({ length: 10 }, (_, i) => `Q${i}`);
    expect(practiceStartSchema.safeParse({ count: 10, focus: 0, questions: ten }).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ['no questions', { count: 0, focus: 0, questions: null }],
    ['eleven', { count: 11, focus: 0, questions: null }],
    ['a fraction', { count: 2.5, focus: 0, questions: null }],
    ['a count as text', { count: '3', focus: 0, questions: null }],
    ['an unknown focus', { count: 3, focus: 3, questions: null }],
    ['a focus by name', { count: 3, focus: 'mixed', questions: null }],
    ['an empty list of chosen questions', { count: 1, focus: 0, questions: [] }],
    ['a blank chosen question', { count: 1, focus: 0, questions: ['   '] }],
    ['a chosen question too long', { count: 1, focus: 0, questions: ['q'.repeat(401)] }],
    ['eleven chosen questions', { count: 10, focus: 0, questions: Array.from({ length: 11 }, () => 'Q') }],
    ['something more', { count: 3, focus: 0, questions: null, auto: true }],
    ['no focus', { count: 3, questions: null }],
    ['nothing', null],
  ])('refuses %s', (_, start) => {
    expect(practiceStartSchema.safeParse(start).success).toBe(false);
  });

  it.each<[unknown, boolean]>([
    [{ type: 'start', start: { count: 3, focus: 0, questions: null } }, true],
    [{ type: 'answer', text: 'Because the ledger had to balance.' }, true],
    [{ type: 'answer', text: 'a'.repeat(practiceLimits.answer) }, true],
    [{ type: 'next' }, true],
    [{ type: 'stop' }, true],
    [{ type: 'close' }, true],
    [{ type: 'answer', text: '' }, false],
    [{ type: 'answer', text: '   \n ' }, false],
    [{ type: 'answer', text: 'a'.repeat(practiceLimits.answer + 1) }, false],
    [{ type: 'answer', text: 42 }, false],
    [{ type: 'answer', text: 'ok', spoken: true }, false],
    [{ type: 'next', now: true }, false],
    [{ type: 'start' }, false],
    [{ type: 'ask', text: 'What is on screen?' }, false],
    [{ type: 'endSession' }, false],
    ['next', false],
  ])('%j is %s', (action, valid) => {
    expect(practiceActionSchema.safeParse(action).success).toBe(valid);
  });
});

describe('the two lowest, to retry (Q22)', () => {
  const t = (n: number, score: number | null, answered = true, question = `Q${n}`) => ({
    n,
    question,
    score,
    answered,
  });

  it.each<[string, ReturnType<typeof t>[], string[]]>([
    ['the two lowest, lowest first', [t(1, 7), t(2, 3), t(3, 5)], ['Q2', 'Q3']],
    ['the earlier first on a tie', [t(1, 4), t(2, 4), t(3, 4)], ['Q1', 'Q2']],
    ['only scored answers', [t(1, null), t(2, 6), t(3, 8)], ['Q2', 'Q3']],
    ['only answered questions', [t(1, 2, false), t(2, 6), t(3, 8)], ['Q2', 'Q3']],
    ['one question once, asked twice', [t(1, 3, true, 'Same'), t(2, 4, true, 'Same'), t(3, 9)], ['Same', 'Q3']],
    ['nothing with one scored answer', [t(1, 3), t(2, null)], []],
    ['nothing with none', [], []],
    ['nothing from blank questions', [t(1, 3, true, '  '), t(2, 4)], []],
  ])('takes %s', (_, turns, questions) => {
    expect(lowestQuestions(turns)).toEqual(questions);
  });

  it('keeps each one within what a chosen question may be', () => {
    const long = 'q'.repeat(practiceLimits.question + 50);
    expect(lowestQuestions([t(1, 3, true, long), t(2, 4)])[0]).toHaveLength(practiceLimits.question);
  });
});

describe("practice's words for an ending", () => {
  it.each<[string, number, string]>([
    [
      SessionEndReasons.Inactive,
      60,
      'Nothing happened for a while. The session ends in a minute. Send your answer to keep going.',
    ],
    [SessionEndReasons.CreditExhausted, 30, 'No minutes left. The session ends in 30 seconds.'],
    [SessionEndReasons.MaxLength, 1, "Your plan's longest session is nearly over. The session ends in 1 second."],
    ['something_newer', 10, 'The session ends in 10 seconds.'],
  ])('before %s, with %is left', (reason, seconds, words) => {
    expect(practiceEndingText(reason, seconds)).toBe(words);
  });

  it('says a quiet spell ended it in its own words, and the rest as a session does', () => {
    expect(practiceEndedText(SessionEndReasons.Inactive)).toBe('The practice ended: nothing happened for a while.');
    expect(practiceEndedText(SessionEndReasons.CreditExhausted)).toBe('The session ended: no minutes left.');
    expect(practiceEndedText(null)).toBe('Session ended.');
  });

  it.each<[PracticeState | null, boolean]>([
    [PracticeState.Preparing, true],
    [PracticeState.Scoring, true],
    [PracticeState.Answering, false],
    [PracticeState.Feedback, false],
    [null, false],
  ])('waits on the server in state %s: %s', (state, busy) => {
    const view = state === null ? null : ({ ...idlePractice, state } as never);
    expect(practiceBusy(view)).toBe(busy);
  });
});

// ---- The practice drawn from the hub's events -------------------------------------------------------------------

describe('the practice drawn from the hub’s events', () => {
  it('follows where it is, and clears it once none runs', () => {
    const running = apply([mockState(1, status())]);
    expect(running.practice.status).toEqual({
      state: PracticeState.Answering,
      n: 1,
      mainN: 1,
      total: 3,
      focus: PracticeFocus.Mixed,
      difficulty: PracticeDifficulty.Medium,
      last: false,
      question: 'Why payments?',
      error: null,
    });
    expect(apply([mockState(2, null)], running).practice.status).toBeNull();
  });

  it('keeps each question in order, one put back in its place when asked again (after a move)', () => {
    const state = apply([
      mockQuestion(1, 2, 'Second'),
      mockQuestion(2, 1, 'First'),
      mockQuestion(3, 2, 'Second again'),
    ]);
    expect(state.practice.turns.map((t) => [t.n, t.question])).toEqual([
      [1, 'First'],
      [2, 'Second again'],
    ]);
    expect(state.practice.turns[0]).toMatchObject({ answer: null, feedback: null, total: 3 });
  });

  it("puts each answer's feedback on its question", () => {
    const state = apply([mockQuestion(1, 1, 'Why us?'), mockFeedback(2, 1, 7, 'Because.')]);
    expect(state.practice.turns[0]).toMatchObject({
      question: 'Why us?',
      answer: 'Because.',
      feedback: { score: 7, good: ['Clear.'], improve: ['Add a number.'], modelAnswer: 'A stronger one.', raw: false },
    });
  });

  it('brings the question with a feedback whose question was missed', () => {
    const state = apply([mockState(1, status({ Total: 4 })), mockFeedback(2, 3, null)]);
    expect(state.practice.turns).toEqual([
      expect.objectContaining({
        n: 3,
        question: 'Question 3',
        total: 4,
        answer: 'An answer.',
        feedback: expect.objectContaining({ score: null }),
      }),
    ]);
  });

  it('keeps the summary once it comes', () => {
    const state = apply([mockQuestion(1, 1, 'Q1'), mockFeedback(2, 1, 6), mockSummary(3)]);
    expect(state.practice.summary).toMatchObject({ asked: 1, answered: 1, average: 6, tips: ['Add a number.'] });
    expect(state.practice.summary?.turns).toEqual([
      {
        n: 1,
        kind: PracticeTurnKind.Main,
        question: 'Q1',
        source: PracticeQuestionSource.Model,
        score: 6,
        answered: true,
      },
    ]);
  });

  it('starts over for a practice after a summary: the last one was kept as it ended', () => {
    const done = apply([mockQuestion(1, 1, 'Old'), mockFeedback(2, 1, 6), mockSummary(3), mockState(4, null)]);
    const again = apply([mockState(5, status({ State: PracticeState.Preparing, N: 0, MainN: 0 }))], done);
    expect(again.practice).toEqual({
      status: expect.objectContaining({ state: PracticeState.Preparing }),
      turns: [],
      summary: null,
    });
    const asked = apply([mockQuestion(6, 1, 'New')], done);
    expect(asked.practice.turns.map((t) => t.question)).toEqual(['New']);
    expect(asked.practice.summary).toBeNull();
  });

  it('takes where it is from a snapshot, keeping what was drawn', () => {
    const drawn = apply([mockQuestion(1, 1, 'Q1')]);
    const snapshot = reduceLive(drawn, {
      type: 'snapshot',
      snapshot: {
        SessionId: 's',
        Phase: SessionPhase.Live,
        Auto: false,
        Paused: false,
        ContextReady: true,
        Heard: '',
        LastSeq: 9,
        Attachments: [],
        MaxAttachments: 5,
        PrepDoc: null,
        CustomInstructionsChars: 0,
        PreparedInPrompt: [],
        Practice: status({ State: PracticeState.Scoring }),
      },
    });
    expect(snapshot.practice.status?.state).toBe(PracticeState.Scoring);
    expect(snapshot.practice.turns).toHaveLength(1);
  });

  it('ignores an event it has seen, and starts empty with each session', () => {
    const seen = apply([mockQuestion(5, 1, 'Q1')]);
    expect(apply([mockQuestion(5, 1, 'Replayed')], seen).practice.turns[0]!.question).toBe('Q1');
    expect(reduceLive(seen, { type: 'starting' }).practice).toEqual({ status: null, turns: [], summary: null });
  });
});

// ---- Main's practice session ------------------------------------------------------------------------------------

/** Plays a practice session's driver: what it is sent, and the hub's events the test raises. */
class FakeDriver implements SessionDriver {
  dispatch: (action: LiveAction) => void = () => {};
  readonly commands: SessionCommand[] = [];
  readonly replies = new Map<string, CommandResult>();
  startResult: CommandResult = { ok: true };
  disposed = 0;
  private seq = 0;

  async start(dispatch: (action: LiveAction) => void): Promise<CommandResult> {
    this.dispatch = dispatch;
    dispatch({ type: 'starting' });
    if (this.startResult.ok)
      this.raise({ name: 'status', e: { Seq: 0, AtMs: 0, Auto: false, Paused: false, Stt: 'ok' } });
    return this.startResult;
  }

  async command(command: SessionCommand): Promise<CommandResult> {
    this.commands.push(command);
    const reply = this.replies.get(command.type) ?? { ok: true };
    if (command.type === 'endSession' && reply.ok) this.end(SessionEndReasons.User);
    return reply;
  }

  dispose(): void {
    this.disposed += 1;
  }

  raise(event: LiveEvent): void {
    this.seq += 1;
    this.dispatch({ type: 'event', event: { ...event, e: { ...event.e, Seq: this.seq } } as LiveEvent });
  }

  end(reason: string): void {
    this.raise({ name: 'sessionEnded', e: { Seq: 0, AtMs: 0, Reason: reason } });
  }

  types(): string[] {
    return this.commands.map((c) => c.type);
  }
}

function practiceHarness(over: Partial<PracticeRunDependencies> = {}) {
  const driver = new FakeDriver();
  const views: PracticeView[] = [];
  const kept: PracticeRecord[] = [];
  let ended = 0;
  let clock = Date.UTC(2026, 10, 12, 9);
  const run = new PracticeRun({
    driver: async () => ({ ok: true, driver, minutesLeft: 120, tier: 'smart' }),
    busy: () => null,
    publish: (view) => views.push(view),
    keep: (record) => {
      kept.push(record);
      return 40 + kept.length;
    },
    about: () => ({ candidate: 'Sam Rivera', role: 'Senior Backend Engineer' }),
    ended: () => {
      ended += 1;
    },
    now: () => (clock += 1_000),
    ...over,
  });
  return {
    run,
    driver,
    views,
    kept,
    ended: () => ended,
    last: () => views.at(-1)!,
    /** Lets the controller publish what it holds (it publishes at most every 33 ms). */
    settle: () => vi.advanceTimersByTimeAsync(50),
  };
}

const start = { count: 3, focus: PracticeFocus.Mixed, questions: null };

describe("main's practice session", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts the session, then the practice asked for, and draws it as it goes', async () => {
    const h = practiceHarness();
    expect(await h.run.start({ count: 2, focus: PracticeFocus.Technical, questions: ['Why us?'] })).toEqual({
      ok: true,
    });
    expect(h.views[0]).toMatchObject({ phase: 'starting' });
    expect(h.driver.commands).toEqual([
      { type: 'mockStart', count: 2, focus: PracticeFocus.Technical, questions: ['Why us?'] },
    ]);
    expect(h.run.running).toBe(true);

    h.driver.raise(mockState(0, status()));
    h.driver.raise(mockQuestion(0, 1, 'Why payments?'));
    await h.settle();
    expect(h.last()).toMatchObject({
      phase: 'live',
      minutesLeft: 120,
      status: { state: PracticeState.Answering },
      turns: [{ question: 'Why payments?' }],
      summary: null,
      problem: null,
    });
  });

  it('sends the answer, next and stop to its session', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    await h.run.answer('Because payments have to add up.');
    await h.run.next();
    await h.run.stop();
    expect(h.driver.commands.slice(1)).toEqual([
      { type: 'mockAnswer', text: 'Because payments have to add up.' },
      { type: 'mockNext' },
      { type: 'mockStop' },
    ]);
  });

  it('refuses while another session or the sound check runs, without opening one', async () => {
    const driver = vi.fn();
    const h = practiceHarness({ busy: () => 'End the session first.', driver });
    expect(await h.run.start(start)).toEqual({
      ok: false,
      code: ErrorCodes.Session.AlreadyInSession,
      message: 'End the session first.',
    });
    expect(driver).not.toHaveBeenCalled();
    expect(h.run.running).toBe(false);
  });

  it('says why, when no session can be had (signed out, say)', async () => {
    const h = practiceHarness({
      driver: async () => ({ ok: false, code: ErrorCodes.Identity.Unauthenticated, message: 'Sign in first.' }),
    });
    expect(await h.run.start(start)).toMatchObject({ ok: false, code: ErrorCodes.Identity.Unauthenticated });
    expect(h.last()).toEqual({
      ...idlePractice,
      problem: { code: ErrorCodes.Identity.Unauthenticated, message: 'Sign in first.' },
    });
  });

  it('says why the server refused the session, and keeps nothing', async () => {
    const h = practiceHarness();
    h.driver.startResult = { ok: false, code: ErrorCodes.Licensing.NoEntitlement, message: 'No plan.' };
    expect(await h.run.start(start)).toMatchObject({ ok: false, code: ErrorCodes.Licensing.NoEntitlement });
    expect(h.run.running).toBe(false);
    expect(h.last().problem).toEqual({ code: ErrorCodes.Licensing.NoEntitlement, message: 'No plan.' });
    expect(h.kept).toEqual([]);
  });

  it('ends the session at once when the server refuses the practice, and says why', async () => {
    const h = practiceHarness();
    h.driver.replies.set('mockStart', {
      ok: false,
      code: ErrorCodes.Session.NoContext,
      message: 'Load your résumé or the job description first: practice questions are written from them.',
    });
    expect(await h.run.start(start)).toMatchObject({ ok: false, code: ErrorCodes.Session.NoContext });
    expect(h.driver.types()).toEqual(['mockStart', 'endSession']);
    expect(h.run.running).toBe(false);
    expect(h.ended()).toBe(1);
    expect(h.last()).toMatchObject({ phase: 'idle', problem: { code: ErrorCodes.Session.NoContext } });
  });

  it('keeps the practice once its summary comes, then ends the session: no minute after it', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    h.driver.raise(mockQuestion(0, 1, 'Q1'));
    h.driver.raise(mockFeedback(0, 1, 6, 'My answer.'));
    h.driver.raise(mockSummary(0));
    await h.settle();
    await h.settle();

    expect(h.kept).toHaveLength(1);
    expect(h.kept[0]).toMatchObject({
      endReason: SessionEndReasons.User,
      candidate: 'Sam Rivera',
      role: 'Senior Backend Engineer',
      tier: 'smart',
      focus: PracticeFocus.Mixed,
      turns: [{ question: 'Q1', answer: 'My answer.', feedback: { score: 6 } }],
      summary: { average: 6 },
    });
    expect(h.driver.types().filter((t) => t === 'endSession')).toHaveLength(1);
    expect(h.run.running).toBe(false);
    expect(h.ended()).toBe(1);
    expect(h.last()).toMatchObject({
      phase: 'done',
      status: null,
      summary: { average: 6 },
      historyId: 41,
      problem: null,
    });
  });

  it('keeps what was answered when the session ends under it, and says why', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    h.driver.raise(mockQuestion(0, 1, 'Q1'));
    h.driver.raise(mockFeedback(0, 1, 5));
    h.driver.end(SessionEndReasons.CreditExhausted);
    await h.settle();

    expect(h.kept).toEqual([expect.objectContaining({ endReason: SessionEndReasons.CreditExhausted, summary: null })]);
    expect(h.last()).toMatchObject({
      phase: 'done',
      summary: null,
      problem: { code: SessionEndReasons.CreditExhausted, message: 'The session ended: no minutes left.' },
    });
    // It ended by itself: nothing more is sent to it.
    expect(h.driver.types()).toEqual(['mockStart']);
  });

  it('keeps nothing of a practice nobody answered', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    h.driver.raise(mockQuestion(0, 1, 'Q1'));
    h.driver.end(SessionEndReasons.Inactive);
    await h.settle();
    expect(h.kept).toEqual([]);
    expect(h.last().problem?.message).toBe('The practice ended: nothing happened for a while.');
  });

  it('shows the session ending soon, and what minutes are left', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    h.driver.raise({
      name: 'sessionEnding',
      e: { Seq: 0, AtMs: 0, Reason: SessionEndReasons.Inactive, SecondsLeft: 60 },
    });
    h.driver.raise({ name: 'usage', e: { Seq: 0, AtMs: 0, MinutesLeft: 41, Warning: null } } as LiveEvent);
    await h.settle();
    expect(h.last()).toMatchObject({
      ending: { reason: SessionEndReasons.Inactive, secondsLeft: 60 },
      minutesLeft: 41,
    });
  });

  it('puts the summary away, back to the setup; closing a practice running stops it', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    await h.run.close();
    expect(h.driver.types()).toEqual(['mockStart', 'mockStop']);

    h.driver.raise(mockQuestion(0, 1, 'Q1'));
    h.driver.raise(mockFeedback(0, 1, 6));
    h.driver.raise(mockSummary(0));
    await h.settle();
    await h.settle();
    expect(await h.run.close()).toEqual({ ok: true });
    expect(h.last()).toEqual(idlePractice);
  });

  it('shows nothing more of a summary put away while its session was still ending', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    h.driver.replies.set('endSession', { ok: true });
    // The session takes its time to end: its end comes after the user put the summary away.
    const end = h.driver.end.bind(h.driver);
    h.driver.end = () => {};
    h.driver.raise(mockQuestion(0, 1, 'Q1'));
    h.driver.raise(mockFeedback(0, 1, 6));
    h.driver.raise(mockSummary(0));
    await h.settle();
    await h.run.close();
    expect(await h.run.start(start)).toMatchObject({
      ok: false,
      message: 'The last practice is still ending. Try again in a moment.',
    });
    end(SessionEndReasons.User);
    await h.settle();
    expect(h.last()).toEqual(idlePractice);
    expect(h.run.running).toBe(false);
  });

  it('refuses a second practice while one runs, and every ask when none does', async () => {
    const h = practiceHarness();
    expect(await h.run.answer('Too early.')).toMatchObject({ ok: false, code: ErrorCodes.Session.NotInSession });
    expect(await h.run.next()).toMatchObject({ ok: false, code: ErrorCodes.Session.NotInSession });
    expect(await h.run.stop()).toMatchObject({ ok: false, code: ErrorCodes.Session.NotInSession });
    await h.run.start(start);
    expect(await h.run.start(start)).toMatchObject({ ok: false, code: ErrorCodes.Session.PracticeRunning });
  });

  it('ends its session when the app quits, keeping what was answered', async () => {
    const h = practiceHarness();
    await h.run.start(start);
    h.driver.raise(mockQuestion(0, 1, 'Q1'));
    h.driver.raise(mockFeedback(0, 1, 7));
    await h.settle();
    await h.run.quit();
    expect(h.driver.types()).toEqual(['mockStart', 'endSession']);
    expect(h.kept).toHaveLength(1);
    expect(h.run.running).toBe(false);
    await h.run.quit();
    expect(h.kept).toHaveLength(1);
  });
});

// ---- The preview's interviewer ----------------------------------------------------------------------------------

function previewHarness() {
  const driver = new PreviewDriver({ interview: false });
  let state = initialLiveState;
  const events: LiveEvent[] = [];
  void driver.start((action) => {
    if (action.type === 'event') events.push(action.event);
    state = reduceLive(state, action);
  });
  return { driver, events, state: () => state, names: () => events.map((e) => e.name) };
}

const longAnswer = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ');

describe("the preview's practice interviewer (development only)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays no interview in a practice session: nobody speaks', async () => {
    const h = previewHarness();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.names()).toEqual(['status']);
  });

  it.each<[string, number]>([
    ['', 3],
    ['A short one.', 3],
    [Array.from({ length: 12 }, () => 'w').join(' '), 6],
    [Array.from({ length: 39 }, () => 'w').join(' '), 6],
    [Array.from({ length: 40 }, () => 'w').join(' '), 8],
  ])('scores %j as %i, by its length', (answer, score) => {
    expect(previewScore(answer)).toBe(score);
  });

  it('asks, scores, follows up a weak answer, and sums up as the server does', async () => {
    const h = previewHarness();
    expect(
      await h.driver.command({ type: 'mockStart', count: 2, focus: PracticeFocus.Mixed, questions: null }),
    ).toEqual({ ok: true });
    expect(h.state().practice.status?.state).toBe(PracticeState.Preparing);
    await vi.advanceTimersByTimeAsync(previewQuestionMs);
    expect(h.state().practice.status).toMatchObject({ state: PracticeState.Answering, mainN: 1, total: 2 });

    // A strong answer: 8, and the next question harder.
    await h.driver.command({ type: 'mockAnswer', text: longAnswer });
    expect(h.state().practice.status?.state).toBe(PracticeState.Scoring);
    await vi.advanceTimersByTimeAsync(previewScoreMs);
    expect(h.state().practice.turns[0]?.feedback?.score).toBe(8);
    expect(h.state().practice.status).toMatchObject({
      state: PracticeState.Feedback,
      difficulty: PracticeDifficulty.Hard,
      last: false,
    });

    await h.driver.command({ type: 'mockNext' });
    await vi.advanceTimersByTimeAsync(previewQuestionMs);
    expect(h.state().practice.status).toMatchObject({ state: PracticeState.Answering, mainN: 2 });

    // A weak one: 3, then one follow-up, still the second main question.
    await h.driver.command({ type: 'mockAnswer', text: 'Short.' });
    await vi.advanceTimersByTimeAsync(previewScoreMs);
    expect(h.state().practice.status?.last).toBe(false);
    await h.driver.command({ type: 'mockNext' });
    await vi.advanceTimersByTimeAsync(previewQuestionMs);
    expect(h.state().practice.turns.at(-1)).toMatchObject({ kind: PracticeTurnKind.FollowUp, mainN: 2, n: 3 });

    // A weak follow-up: easier, and the last.
    await h.driver.command({ type: 'mockAnswer', text: 'Still short.' });
    await vi.advanceTimersByTimeAsync(previewScoreMs);
    expect(h.state().practice.status).toMatchObject({ last: true, difficulty: PracticeDifficulty.Medium });

    await h.driver.command({ type: 'mockNext' });
    expect(h.state().practice.summary).toMatchObject({
      asked: 3,
      answered: 3,
      average: 4.7,
      best: 1,
      worst: 2,
      tips: [
        'Say what you did, not only what happened.',
        'Give one concrete example.',
        'Answer in two to four sentences.',
      ],
    });
    expect(h.state().practice.status).toBeNull();
  });

  it('asks the questions chosen, in order, as chosen', async () => {
    const h = previewHarness();
    await h.driver.command({
      type: 'mockStart',
      count: 5,
      focus: PracticeFocus.Technical,
      questions: ['Why us?', 'Why now?'],
    });
    await vi.advanceTimersByTimeAsync(previewQuestionMs);
    expect(h.state().practice.turns[0]).toMatchObject({
      question: 'Why us?',
      source: PracticeQuestionSource.Chosen,
      total: 2,
    });
  });

  it('asks again for an empty answer, and ignores one when none is awaited', async () => {
    const h = previewHarness();
    await h.driver.command({ type: 'mockAnswer', text: 'Nobody asked.' });
    expect(h.state().practice.status).toBeNull();
    await h.driver.command({ type: 'mockStart', count: 1, focus: PracticeFocus.Mixed, questions: null });
    await vi.advanceTimersByTimeAsync(previewQuestionMs);
    await h.driver.command({ type: 'mockAnswer', text: '   ' });
    expect(h.state().practice.status).toMatchObject({
      state: PracticeState.Answering,
      error: "I didn't catch an answer yet: say it out loud, or type it.",
    });
  });

  it('pauses the copilot while practice runs, as the server does', async () => {
    const h = previewHarness();
    await h.driver.command({ type: 'mockStart', count: 1, focus: PracticeFocus.Mixed, questions: null });
    for (const command of [
      { type: 'ask' as const, mode: AskMode.Question, text: 'Help' },
      { type: 'trigger' as const, text: null },
    ]) {
      expect(await h.driver.command(command)).toMatchObject({ ok: false, code: ErrorCodes.Session.PracticeRunning });
    }
    expect(
      await h.driver.command({ type: 'mockStart', count: 1, focus: PracticeFocus.Mixed, questions: null }),
    ).toMatchObject({
      ok: false,
      code: ErrorCodes.Session.PracticeRunning,
    });
  });

  it('gives the summary before the session ends, and on a stop', async () => {
    const h = previewHarness();
    await h.driver.command({ type: 'mockStart', count: 3, focus: PracticeFocus.Mixed, questions: null });
    await vi.advanceTimersByTimeAsync(previewQuestionMs);
    await h.driver.command({ type: 'endSession' });
    expect(h.names().slice(-3)).toEqual(['mockSummary', 'mockState', 'sessionEnded']);

    const again = previewHarness();
    await again.driver.command({ type: 'mockStart', count: 3, focus: PracticeFocus.Mixed, questions: null });
    await again.driver.command({ type: 'mockStop' });
    expect(again.state().practice.summary).toMatchObject({ asked: 0, answered: 0, average: null });
  });
});
