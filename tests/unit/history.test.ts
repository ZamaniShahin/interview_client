// History (3.9): what a session keeps, the tables it is kept in, the recorder that writes it as the session goes, the
// debrief asked of the server (its 3.4 job) and kept, and every outcome of each.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerKind, ErrorCodes, SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import {
  cut,
  debriefLimits,
  debriefRequestOf,
  debriefSchema,
  roleOf,
  type DebriefResult,
  type InterviewView,
} from '../../src/shared/history';
import { jobFailureText } from '../../src/shared/jobs';
import { historyEvents } from '../../src/shared/live/history-events';
import { reduceLive, type LiveAction } from '../../src/shared/live/reducer';
import { initialLiveState, type AnswerView, type LiveViewState } from '../../src/shared/live/view-state';
import { ApiError } from '../../src/main/api/rest-client';
import { HistoryRecorder } from '../../src/main/history/history-recorder';
import { HistoryService } from '../../src/main/history/history-service';
import { jobTimeoutCode, jobWaitMs, pollEveryMs, runJob } from '../../src/main/jobs/run-job';
import { openDatabase } from '../../src/main/storage/local-database';
import { HistoryStore } from '../../src/main/storage/history-store';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';
import { SessionController, type SessionDriver } from '../../src/main/session/session-controller';
import type { CommandResult } from '../../src/shared/ipc';

const nov11 = Date.UTC(2026, 10, 11, 14);

const sample: DebriefResult = {
  version: 1,
  raw: false,
  summary: 'A steady round.',
  scores: { clarity: 8, structure: 7, technical: null, delivery: null, filler: null },
  strengths: ['Clear framing.'],
  improvements: ['Name the trade-offs.'],
  strongerAnswers: [{ question: 'Why Kafka?', answer: 'Ordering per key.' }],
  followUps: ['How would you shard it?'],
  thankYouEmail: 'Thank you, Priya.',
  metrics: null,
};

function store() {
  return new HistoryStore(openDatabase(null, null, migrations));
}

let seq = 0;
const event = (name: string, e: Record<string, unknown>): LiveAction =>
  ({ type: 'event', event: { name, e: { Seq: ++seq, AtMs: nov11 + seq, ...e } } }) as LiveAction;
const answerStart = (id: string, question = 'Why Kafka?', kind: AnswerKind = AnswerKind.Spoken) =>
  event('answerStart', { AnswerId: id, Question: question, Kind: kind, Instruction: null, ScreenshotIds: [] });

/** Each action through the reducer, with what history keeps of each step. */
function run(actions: LiveAction[], from: LiveViewState = { ...initialLiveState, phase: 'live' }) {
  let state = from;
  const kept: ReturnType<typeof historyEvents> = [];
  for (const action of actions) {
    const next = reduceLive(state, action);
    kept.push(...historyEvents(state, next, action));
    state = next;
  }
  return { state, kept };
}

describe('what a session keeps in history (3.9)', () => {
  it.each<[string, LiveAction[], string[]]>([
    [
      'an answer done',
      [
        answerStart('a'),
        event('answerDelta', { AnswerId: 'a', Text: 'Ordering.' }),
        event('answerDone', { AnswerId: 'a' }),
      ],
      ['answered a'],
    ],
    [
      'an answer stopped with text',
      [
        answerStart('a'),
        event('answerDelta', { AnswerId: 'a', Text: 'Part' }),
        event('answerCancelled', { AnswerId: 'a' }),
      ],
      ['answered a'],
    ],
    [
      'an answer stopped by a newer question',
      [answerStart('a'), event('answerDelta', { AnswerId: 'a', Text: 'Part' }), answerStart('b')],
      ['answered a'],
    ],
    ['an answer stopped before any text', [answerStart('a'), event('answerCancelled', { AnswerId: 'a' })], []],
    [
      'an answer of only spaces',
      [answerStart('a'), event('answerDelta', { AnswerId: 'a', Text: '  \n' }), event('answerDone', { AnswerId: 'a' })],
      [],
    ],
    [
      'an answer that failed',
      [
        answerStart('a'),
        event('answerDelta', { AnswerId: 'a', Text: 'Part' }),
        event('answerFailed', { AnswerId: 'a', Code: ErrorCodes.Ai.ProviderUnavailable, Message: 'x' }),
      ],
      [],
    ],
    [
      'an answer hidden',
      [
        answerStart('a'),
        event('answerDelta', { AnswerId: 'a', Text: 'Part' }),
        event('answerFailed', { AnswerId: 'a', Code: ErrorCodes.Ai.OutputBlocked, Message: 'x' }),
      ],
      [],
    ],
    ['an answer still being written', [answerStart('a'), event('answerDelta', { AnswerId: 'a', Text: 'Part' })], []],
    [
      'the end, with what was being written',
      [
        answerStart('a'),
        event('answerDelta', { AnswerId: 'a', Text: 'Part' }),
        event('sessionEnded', { Reason: SessionEndReasons.User }),
      ],
      ['answered a', 'ended user'],
    ],
    ['an end without the server', [{ type: 'ended', reason: SessionEndReasons.Expired }], ['ended expired']],
  ])('keeps %s as %j', (_, actions, kept) => {
    const out = run(actions).kept.map((e) =>
      e.type === 'answered' ? `answered ${e.answer.id}` : e.type === 'ended' ? `ended ${e.reason}` : `heard ${e.text}`,
    );
    expect(out).toEqual(kept);
  });

  it('keeps an answer once, through the events after it and a resume replaying it', () => {
    const start = answerStart('a');
    const delta = event('answerDelta', { AnswerId: 'a', Text: 'Ordering.' });
    const done = event('answerDone', { AnswerId: 'a' });
    const { kept } = run([start, delta, done, event('notice', { Code: 'x', Text: 'y' }), start, delta, done]);
    expect(kept.filter((e) => e.type === 'answered')).toHaveLength(1);
  });

  it('keeps the answer as it was given: its question, kind, text and start', () => {
    const { kept } = run([
      answerStart('a', 'How do you shard?', AnswerKind.Typed),
      event('answerDelta', { AnswerId: 'a', Text: 'By ' }),
      event('answerDelta', { AnswerId: 'a', Text: 'account.' }),
      event('answerDone', { AnswerId: 'a' }),
    ]);
    const answered = kept[0] as { answer: AnswerView };
    expect(answered.answer).toMatchObject({
      question: 'How do you shard?',
      kind: AnswerKind.Typed,
      text: 'By account.',
    });
    expect(answered.answer.startedAtMs).toBeGreaterThan(nov11);
  });

  it.each<[string, string[], string[]]>([
    ['one phrase', ['Tell me about yourself.'], ['Tell me about yourself.']],
    ['a question growing', ['Tell me', 'Tell me about yourself.'], ['Tell me', 'about yourself.']],
    ['a phrase changed in place', ['Tell me', 'So, tell me more.'], ['Tell me', 'So, tell me more.']],
    ['the same phrase again', ['Tell me', 'Tell me'], ['Tell me']],
    ['only spaces added', ['Tell me', 'Tell me   '], ['Tell me']],
  ])('keeps the interviewer’s words of %s, each new part once', (_, finals, lines) => {
    const { kept } = run(finals.map((Text) => event('transcriptFinal', { Text })));
    expect(kept.map((e) => (e.type === 'heard' ? e.text : '?'))).toEqual(lines);
  });

  it('starts the words over once an answer begins, or Heard is cleared', () => {
    const { kept } = run([
      event('transcriptFinal', { Text: 'Why Kafka?' }),
      answerStart('a', 'Why Kafka?'),
      event('transcriptFinal', { Text: 'And why Go?' }),
      { type: 'heardCleared' },
      event('transcriptFinal', { Text: 'And why Go? Take your time.' }),
    ]);
    expect(kept.filter((e) => e.type === 'heard').map((e) => (e as { text: string }).text)).toEqual([
      'Why Kafka?',
      'And why Go?',
      'And why Go? Take your time.',
    ]);
  });

  it('keeps nothing of a replayed phrase, nor of partial words', () => {
    const final = event('transcriptFinal', { Text: 'Why Kafka?' });
    const { kept } = run([final, final, event('transcriptPartial', { Text: 'Why Kafka? And' })]);
    expect(kept).toHaveLength(1);
  });

  it('ends once, whatever ends it next', () => {
    const { kept } = run([
      event('sessionEnded', { Reason: SessionEndReasons.CreditExhausted }),
      { type: 'ended', reason: SessionEndReasons.Expired },
    ]);
    expect(kept).toEqual([{ type: 'ended', reason: SessionEndReasons.CreditExhausted }]);
  });
});

describe('history, as kept on this computer (3.9, backend docs/07 §5)', () => {
  let history: HistoryStore;
  beforeEach(() => {
    history = store();
  });

  const start = (over: Partial<{ candidate: string; role: string; startedAt: number }> = {}) =>
    history.start({
      startedAt: nov11,
      candidate: 'Sam Rivera',
      role: 'Senior Backend Engineer',
      tier: 'smart',
      ...over,
    });

  it('keeps an interview with its answers and lines in their order, and its end', () => {
    const id = start();
    history.addAnswer(id, {
      askedAt: nov11 + 1_000,
      kind: AnswerKind.Spoken,
      question: 'Why Kafka?',
      answer: 'Ordering.',
    });
    history.addAnswer(id, { askedAt: nov11 + 2_000, kind: AnswerKind.Tip, question: 'Tip', answer: '**Breathe.**' });
    history.addLine(id, { at: nov11 + 500, speaker: 'interviewer', text: 'Why Kafka?' });
    history.end(id, nov11 + 60_000, SessionEndReasons.User);
    expect(history.get(id)).toEqual({
      id,
      startedAt: nov11,
      endedAt: nov11 + 60_000,
      candidate: 'Sam Rivera',
      role: 'Senior Backend Engineer',
      kind: 'interview',
      endReason: SessionEndReasons.User,
      answers: 2,
      lines: 1,
      hasDebrief: false,
      average: null,
      recordingSeconds: null,
      practice: null,
      qa: [
        {
          id: expect.any(Number),
          askedAt: nov11 + 1_000,
          kind: AnswerKind.Spoken,
          question: 'Why Kafka?',
          answer: 'Ordering.',
        },
        {
          id: expect.any(Number),
          askedAt: nov11 + 2_000,
          kind: AnswerKind.Tip,
          question: 'Tip',
          answer: '**Breathe.**',
        },
      ],
      transcript: [{ at: nov11 + 500, speaker: 'interviewer', text: 'Why Kafka?' }],
      debrief: null,
    });
  });

  it('lists the newest first, with what each holds', () => {
    const older = start({ startedAt: nov11 - 86_400_000, role: '' });
    const newer = start();
    history.addAnswer(newer, { askedAt: nov11, kind: 0, question: 'Q', answer: 'A' });
    history.saveDebrief(older, sample, nov11);
    expect(history.list().map((i) => [i.id, i.role, i.answers, i.hasDebrief])).toEqual([
      [newer, 'Senior Backend Engineer', 1, false],
      [older, '', 0, true],
    ]);
  });

  it('ends an interview once: a later end changes nothing', () => {
    const id = start();
    history.end(id, nov11 + 1_000, SessionEndReasons.User);
    history.end(id, nov11 + 9_000, SessionEndReasons.Expired);
    expect(history.get(id)).toMatchObject({ endedAt: nov11 + 1_000, endReason: SessionEndReasons.User });
  });

  it('keeps a debrief, replaces it when written again, and reads none that no longer reads', () => {
    const id = start();
    expect(history.saveDebrief(id, sample, nov11)).toBe(true);
    expect(history.debrief(id)).toEqual({ ...sample, createdAt: nov11 });
    history.saveDebrief(id, { ...sample, summary: 'Again.' }, nov11 + 1);
    expect(history.debrief(id)).toMatchObject({ summary: 'Again.', createdAt: nov11 + 1 });
    expect(history.saveDebrief(9_999, sample, nov11)).toBe(false);
  });

  it.each(['not json', '{"version":1}', '[]', 'null'])('reads a kept debrief of %j as none', (content) => {
    const db = openDatabase(null, null, migrations);
    const own = new HistoryStore(db);
    const id = own.start({ startedAt: nov11, candidate: '', role: '', tier: null });
    db.prepare('INSERT INTO debriefs (interview_id, created_at, content) VALUES (?, ?, ?)').run(
      id,
      new Date(nov11).toISOString(),
      content,
    );
    expect(own.debrief(id)).toBeNull();
    expect(own.get(id)?.debrief).toBeNull();
  });

  it('deletes an interview with everything it holds, and leaves the others', () => {
    const db = openDatabase(null, null, migrations);
    const own = new HistoryStore(db);
    const [a, b] = [1, 2].map(() => own.start({ startedAt: nov11, candidate: '', role: '', tier: null }));
    for (const id of [a!, b!]) {
      own.addAnswer(id, { askedAt: nov11, kind: 0, question: 'Q', answer: 'A' });
      own.addLine(id, { at: nov11, speaker: 'interviewer', text: 'Q' });
      own.saveDebrief(id, sample, nov11);
    }
    own.delete(a!);
    expect(own.get(a!)).toBeNull();
    for (const table of ['qa', 'transcript', 'debriefs']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 1 });
    }
    expect(own.clear()).toBe(1);
    expect(own.list()).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM qa').get()).toEqual({ n: 0 });
  });

  it('drops an interview that kept nothing, and keeps one that kept anything', () => {
    const empty = start();
    const withLine = start();
    history.addLine(withLine, { at: nov11, speaker: 'interviewer', text: 'Hello.' });
    const withDebrief = start();
    history.saveDebrief(withDebrief, sample, nov11);
    expect(history.dropIfEmpty(empty)).toBe(true);
    expect(history.dropIfEmpty(withLine)).toBe(false);
    start();
    start();
    expect(history.dropEmpty()).toBe(2);
    expect(
      history
        .list()
        .map((i) => i.id)
        .sort(),
    ).toEqual([withLine, withDebrief].sort());
  });

  it('comes with migration 3, keeping what migrations 1 and 2 kept, through every migration since', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sotto-history-'));
    try {
      const file = join(dir, 'sotto.db');
      const key = 'c0ffee00'.repeat(8);
      const old = openDatabase(file, key, migrations.slice(0, 2));
      const before = new LocalStore(old, () => nov11);
      before.setDocument('resume', 'Go and Kafka.');
      before.saveBankEntry({ id: null, phrasings: ['Why us?'], answer: 'Ledgers.', enabled: true });
      old.close();

      const db = openDatabase(file, key, migrations);
      const after = new LocalStore(db, () => nov11);
      expect(db.pragma('user_version', { simple: true })).toBe(migrations.at(-1)!.version);
      expect(after.documents().resume).toBe('Go and Kafka.');
      expect(after.bank()).toHaveLength(1);
      const id = after.history.start({ startedAt: nov11, candidate: '', role: '', tier: null });
      expect(after.history.get(id)).toMatchObject({ answers: 0, lines: 0 });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a line from anyone but the interviewer or the candidate', () => {
    const id = start();
    expect(() => history.addLine(id, { at: nov11, speaker: 'narrator' as 'interviewer', text: 'x' })).toThrow();
  });
});

describe('the recorder, as a session goes (3.9)', () => {
  let history: HistoryStore;
  let keep: boolean;
  let changes: number;
  let clock: number;
  let recorder: HistoryRecorder;

  beforeEach(() => {
    history = store();
    keep = false;
    changes = 0;
    clock = nov11;
    recorder = new HistoryRecorder(history, {
      keepTranscripts: () => keep,
      changed: () => (changes += 1),
      now: () => clock,
    });
  });

  const answer = (text = 'Ordering.'): AnswerView => ({
    id: 'a',
    question: 'Why Kafka?',
    kind: AnswerKind.Spoken,
    instruction: null,
    text,
    ending: 'done',
    failureMessage: null,
    startedAtMs: nov11 + 5,
    screenshotIds: [],
    prepared: null,
  });

  it('keeps nothing before a session begins', () => {
    recorder.record({ type: 'answered', answer: answer() });
    expect(history.list()).toEqual([]);
  });

  it('keeps an interview from its start to its end, each answer as it comes', () => {
    recorder.begin({ candidate: 'Sam', role: 'Backend', tier: 'fast' });
    const id = recorder.interviewId!;
    recorder.record({ type: 'answered', answer: answer() });
    expect(history.get(id)?.qa.map((q) => q.answer)).toEqual(['Ordering.']);
    clock += 120_000;
    recorder.record({ type: 'ended', reason: SessionEndReasons.User });
    expect(recorder.interviewId).toBeNull();
    expect(history.get(id)).toMatchObject({ candidate: 'Sam', role: 'Backend', endedAt: nov11 + 120_000, answers: 1 });
    expect(changes).toBe(2);
  });

  it('keeps the interviewer’s words only while the user keeps transcripts, read line by line', () => {
    recorder.begin({ candidate: '', role: '', tier: null });
    const id = recorder.interviewId!;
    recorder.record({ type: 'heard', text: 'Not kept.', atMs: nov11 });
    keep = true;
    recorder.record({ type: 'heard', text: 'Kept.', atMs: nov11 + 1 });
    keep = false;
    recorder.record({ type: 'heard', text: 'Not kept either.', atMs: nov11 + 2 });
    recorder.record({ type: 'answered', answer: answer() });
    expect(history.get(id)?.transcript.map((l) => l.text)).toEqual(['Kept.']);
  });

  it('drops an interview that kept nothing when it ends, or when its session never started', () => {
    recorder.begin({ candidate: '', role: '', tier: null });
    recorder.record({ type: 'ended', reason: SessionEndReasons.User });
    recorder.begin({ candidate: '', role: '', tier: null });
    recorder.finish(null);
    expect(history.list()).toEqual([]);
  });

  it('ends the interview still open when another begins', () => {
    recorder.begin({ candidate: '', role: 'First', tier: null });
    recorder.record({ type: 'answered', answer: answer() });
    const first = recorder.interviewId!;
    clock += 1_000;
    recorder.begin({ candidate: '', role: 'Second', tier: null });
    expect(recorder.interviewId).not.toBe(first);
    expect(history.get(first)).toMatchObject({ endedAt: nov11 + 1_000, endReason: null });
  });

  it('keeps each answer of a session driven through the controller, once', async () => {
    vi.useFakeTimers();
    try {
      const controller = new SessionController(() => {});
      controller.recordTo((e) => recorder.record(e));
      let dispatch: (action: LiveAction) => void = () => {};
      const driver: SessionDriver = {
        start: async (d) => {
          dispatch = d;
          d({ type: 'starting' });
          return { ok: true } as CommandResult;
        },
        command: async () => ({ ok: true }),
        dispose: () => {},
      };
      recorder.begin({ candidate: '', role: '', tier: null });
      const id = recorder.interviewId!;
      await controller.start(driver);
      for (const action of [
        answerStart('x'),
        event('answerDelta', { AnswerId: 'x', Text: 'Yes.' }),
        event('answerDone', { AnswerId: 'x' }),
      ]) {
        dispatch(action);
      }
      dispatch(event('sessionEnded', { Reason: SessionEndReasons.User }));
      expect(history.get(id)?.qa.map((q) => q.answer)).toEqual(['Yes.']);
      expect(recorder.interviewId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a debrief asked for, within the server’s limits (3.9)', () => {
  const interview = (over: Partial<InterviewView> = {}): InterviewView => ({
    id: 1,
    kind: 'interview',
    startedAt: nov11,
    endedAt: nov11 + 60_000,
    candidate: 'Sam Rivera',
    role: 'Senior Backend Engineer',
    endReason: null,
    answers: 1,
    lines: 1,
    hasDebrief: false,
    qa: [{ id: 1, askedAt: nov11, kind: 0, question: 'Why Kafka?', answer: 'Ordering.' }],
    transcript: [{ at: nov11, speaker: 'interviewer', text: 'Why Kafka?' }],
    debrief: null,
    average: null,
    practice: null,
    ...over,
  });

  it('sends the name, the role, the questions with their answers, and the lines', () => {
    expect(debriefRequestOf(interview())).toEqual({
      name: 'Sam Rivera',
      role: 'Senior Backend Engineer',
      questions: [{ question: 'Why Kafka?', answer: 'Ordering.' }],
      transcript: [{ speaker: 'interviewer', text: 'Why Kafka?' }],
    });
  });

  it('sends no name or role it does not have, and nothing for an interview that kept nothing', () => {
    expect(debriefRequestOf(interview({ candidate: ' ', role: '' }))).toMatchObject({ name: null, role: null });
    expect(debriefRequestOf(interview({ qa: [], transcript: [] }))).toBeNull();
    expect(
      debriefRequestOf(
        interview({
          qa: [{ id: 1, askedAt: 0, kind: 0, question: ' ', answer: 'x' }],
          transcript: [{ at: 0, speaker: 'interviewer', text: ' ' }],
        }),
      ),
    ).toBeNull();
  });

  it('sends a transcript alone, or questions alone', () => {
    expect(debriefRequestOf(interview({ qa: [] }))?.questions).toEqual([]);
    expect(debriefRequestOf(interview({ transcript: [] }))?.transcript).toEqual([]);
  });

  it(`sends the first ${debriefLimits.questions} questions, each within its limits`, () => {
    const qa = Array.from({ length: debriefLimits.questions + 30 }, (_, i) => ({
      id: i,
      askedAt: 0,
      kind: 0,
      question: `Q${i} ${'q'.repeat(debriefLimits.question)}`,
      answer: 'a'.repeat(debriefLimits.answer + 10),
    }));
    const request = debriefRequestOf(interview({ qa }))!;
    expect(request.questions).toHaveLength(debriefLimits.questions);
    expect(request.questions[0]!.question.startsWith('Q0 ')).toBe(true);
    expect(request.questions.at(-1)!.question.startsWith(`Q${debriefLimits.questions - 1} `)).toBe(true);
    for (const q of request.questions) {
      expect(q.question.length).toBeLessThanOrEqual(debriefLimits.question);
      expect(q.answer.length).toBe(debriefLimits.answer);
    }
  });

  it(`sends the start and the end of a transcript past ${debriefLimits.lines} lines, the middle left out`, () => {
    const transcript = Array.from({ length: debriefLimits.lines + 100 }, (_, i) => ({
      at: i,
      speaker: 'interviewer' as const,
      text: `line ${i} ${'x'.repeat(i === 0 ? debriefLimits.line : 1)}`,
    }));
    const lines = debriefRequestOf(interview({ transcript }))!.transcript;
    expect(lines).toHaveLength(debriefLimits.lines);
    expect(lines[0]!.text.length).toBe(debriefLimits.line);
    expect(lines[debriefLimits.lines / 2 - 1]!.text).toBe(`line ${debriefLimits.lines / 2 - 1} x`);
    expect(lines[debriefLimits.lines / 2]!.text).toBe(`line ${100 + debriefLimits.lines / 2} x`);
    expect(lines.at(-1)!.text).toBe(`line ${debriefLimits.lines + 99} x`);
  });

  it('cuts a name and a role at 200, never mid-pair', () => {
    const request = debriefRequestOf(interview({ candidate: 'n'.repeat(199) + '😀', role: 'r'.repeat(300) }))!;
    expect(request.name).toBe('n'.repeat(199));
    expect(request.role).toBe('r'.repeat(200));
  });

  it.each<[string, number, string]>([
    ['short', 10, 'short'],
    ['exact', 5, 'exact'],
    ['abc😀', 4, 'abc'],
    ['abc😀', 5, 'abc😀'],
    ['', 3, ''],
  ])('cuts %j at %i as %j', (value, max, out) => {
    expect(cut(value, max)).toBe(out);
  });

  it.each<[string, string]>([
    ['Senior Backend Engineer, Payments\nYou will own the ledger.', 'Senior Backend Engineer, Payments'],
    ['\n\n  Staff Engineer  \nMore.', 'Staff Engineer'],
    ['', ''],
    ['x'.repeat(200), 'x'.repeat(120)],
  ])('names the role of a job description %j as %j', (jd, role) => {
    expect(roleOf(jd)).toBe(role);
  });

  it('reads the server’s debrief, its scores 1 to 10 or none, and refuses anything else', () => {
    expect(debriefSchema.safeParse(sample).success).toBe(true);
    expect(
      debriefSchema.safeParse({
        ...sample,
        scores: null,
        metrics: { words: 10, fillers: 1, fillersPer100Words: 10, turns: 2 },
      }).success,
    ).toBe(true);
    expect(debriefSchema.safeParse({ ...sample, extra: 'ignored' }).success).toBe(true);
    for (const bad of [
      { ...sample, scores: { ...sample.scores, clarity: 11 } },
      { ...sample, scores: { ...sample.scores, clarity: 0 } },
      { ...sample, summary: 5 },
      { ...sample, strengths: 'one' },
      { ...sample, strongerAnswers: [{ question: 'q' }] },
      { ...sample, metrics: { words: -1, fillers: 0, fillersPer100Words: 0, turns: 0 } },
      null,
      'debrief',
    ]) {
      expect(debriefSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('a job on the server, asked after until done (3.9, the server’s 3.4)', () => {
  function rest(replies: unknown[], start: unknown = { jobId: 'j1' }) {
    const calls: string[] = [];
    return {
      calls,
      rest: {
        post: vi.fn(async (path: string, options?: { body?: unknown }) => {
          calls.push(`POST ${path} ${JSON.stringify(options?.body)}`);
          if (start instanceof Error) throw start;
          return start as never;
        }),
        get: vi.fn(async (path: string) => {
          calls.push(`GET ${path}`);
          const reply = replies.shift();
          if (reply instanceof Error) throw reply;
          return reply as never;
        }),
      },
    };
  }

  it('starts the job, asks every two seconds while it runs, and answers its result', async () => {
    const { rest: r, calls } = rest([{ status: 'running' }, { status: 'running' }, { status: 'done', result: sample }]);
    const sleeps: number[] = [];
    const result = await runJob(
      '/api/v1/jobs/debrief',
      { a: 1 },
      { rest: r, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(result).toEqual(sample);
    expect(calls).toEqual([
      'POST /api/v1/jobs/debrief {"a":1}',
      'GET /api/v1/jobs/j1',
      'GET /api/v1/jobs/j1',
      'GET /api/v1/jobs/j1',
    ]);
    expect(sleeps).toEqual([pollEveryMs, pollEveryMs]);
  });

  it('passes on a refusal to start, and a failure while it runs', async () => {
    const refused = new ApiError(429, ErrorCodes.Licensing.QuotaExceeded, 'No more.');
    await expect(runJob('/x', {}, { rest: rest([], refused).rest, sleep: async () => {} })).rejects.toBe(refused);
    const failed = new ApiError(503, ErrorCodes.Ai.ProviderUnavailable, 'Down.');
    await expect(
      runJob('/x', {}, { rest: rest([{ status: 'running' }, failed]).rest, sleep: async () => {} }),
    ).rejects.toBe(failed);
  });

  it(`gives up after ${jobWaitMs / 60_000} minutes of running`, async () => {
    let clock = 0;
    const running = Array.from({ length: 1_000 }, () => ({ status: 'running' }));
    const error = await runJob(
      '/x',
      {},
      {
        rest: rest(running).rest,
        now: () => clock,
        sleep: async (ms) => void (clock += ms),
      },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(jobTimeoutCode);
    expect(clock).toBeGreaterThanOrEqual(jobWaitMs);
    expect(clock).toBeLessThan(jobWaitMs + 2 * pollEveryMs);
  });

  it('says so when the server names no job', async () => {
    const error = await runJob('/x', {}, { rest: rest([], {}).rest, sleep: async () => {} }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(jobTimeoutCode);
  });
});

describe('history as the app window uses it (3.9)', () => {
  let local: LocalStore;
  let running: number | null;
  let views: { history: unknown[]; debriefing: number[] }[];
  let job: ReturnType<typeof vi.fn<(path: string, body: unknown) => Promise<unknown>>>;
  let service: HistoryService;

  beforeEach(() => {
    local = new LocalStore(openDatabase(null, null, migrations), () => nov11);
    running = null;
    views = [];
    job = vi.fn(async () => sample);
    service = new HistoryService({
      store: () => local.history,
      running: () => running,
      job,
      changed: (view) => views.push(view),
      now: () => nov11 + 5,
    });
  });

  const interviewWith = (answers = 1) => {
    const id = local.history.start({ startedAt: nov11, candidate: 'Sam', role: 'Backend', tier: null });
    for (let i = 0; i < answers; i++)
      local.history.addAnswer(id, { askedAt: nov11, kind: 0, question: `Q${i}`, answer: 'A' });
    return id;
  };

  it('asks for a debrief, keeps it with the interview, and says while it is written', async () => {
    const id = interviewWith();
    expect(await service.debrief(id)).toEqual({ ok: true });
    expect(job).toHaveBeenCalledWith('/api/v1/jobs/debrief', {
      name: 'Sam',
      role: 'Backend',
      questions: [{ question: 'Q0', answer: 'A' }],
      transcript: [],
    });
    expect(service.open(id)?.debrief).toEqual({ ...sample, createdAt: nov11 + 5 });
    expect(views.map((v) => v.debriefing)).toEqual([[id], []]);
    expect(views.at(-1)?.history).toMatchObject([{ id, hasDebrief: true }]);
  });

  it.each<[string, () => number, Partial<{ running: boolean; noStore: boolean }>, string]>([
    ['one no longer kept', () => 9_999, {}, ErrorCodes.Request.NotFound],
    ['one still running', () => interviewWith(), { running: true }, ErrorCodes.Session.AlreadyInSession],
    ['one that kept nothing', () => interviewWith(0), {}, ErrorCodes.Field.Required],
    ['any, with no history to read', () => 1, { noStore: true }, ErrorCodes.Request.Unavailable],
  ])('asks nothing for %s', async (_, make, over, code) => {
    const id = make();
    if (over.running) running = id;
    if (over.noStore) service = new HistoryService({ store: () => null, running: () => null, job, changed: () => {} });
    expect(await service.debrief(id)).toMatchObject({ ok: false, code });
    expect(job).not.toHaveBeenCalled();
  });

  it('asks once while a debrief is being written', async () => {
    const id = interviewWith();
    let finish: (value: unknown) => void = () => {};
    job.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const first = service.debrief(id);
    expect(await service.debrief(id)).toMatchObject({ ok: false, code: 'debrief_running' });
    finish(sample);
    expect(await first).toEqual({ ok: true });
    expect(job).toHaveBeenCalledTimes(1);
  });

  it.each([
    ErrorCodes.Licensing.QuotaExceeded,
    ErrorCodes.Licensing.NoEntitlement,
    ErrorCodes.Request.RateLimited,
    ErrorCodes.Ai.ProviderUnavailable,
    ErrorCodes.Request.NotFound,
    jobTimeoutCode,
  ])('words a job that failed with %s, and keeps nothing', async (code) => {
    const id = interviewWith();
    job.mockRejectedValueOnce(new ApiError(503, code, 'x'));
    expect(await service.debrief(id)).toEqual({ ok: false, code, message: jobFailureText('debrief', code) });
    expect(service.open(id)?.debrief).toBeNull();
    expect(service.debriefing).toEqual([]);
  });

  it('words a failure that is no ApiError as Sotto being unreachable', async () => {
    const id = interviewWith();
    job.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await service.debrief(id)).toMatchObject({ ok: false, code: ErrorCodes.Request.Unavailable });
  });

  it('keeps no debrief it cannot read', async () => {
    const id = interviewWith();
    job.mockResolvedValueOnce({ summary: 'half a debrief' });
    expect(await service.debrief(id)).toMatchObject({ ok: false, code: ErrorCodes.Request.Internal });
    expect(service.open(id)?.debrief).toBeNull();
  });

  it('keeps no debrief for an interview deleted while it was written', async () => {
    const id = interviewWith();
    job.mockImplementationOnce(async () => {
      local.history.delete(id);
      return sample;
    });
    expect(await service.debrief(id)).toMatchObject({ ok: false, code: ErrorCodes.Request.NotFound });
  });

  it('deletes one, but not the one a session is keeping, and deletes all but that one', () => {
    const [a, b, c] = [interviewWith(), interviewWith(), interviewWith()];
    running = c;
    expect(service.delete(c!)).toMatchObject({ ok: false, code: ErrorCodes.Session.AlreadyInSession });
    expect(service.delete(a!)).toEqual({ ok: true });
    expect(
      service
        .list()
        .map((i) => i.id)
        .sort(),
    ).toEqual([b, c].sort());
    expect(service.clear()).toEqual({ ok: true });
    expect(service.list().map((i) => i.id)).toEqual([c]);
    expect(views.length).toBe(2);
  });

  it('reads nothing, and deletes nothing, without history to read', () => {
    const none = new HistoryService({ store: () => null, running: () => null, job, changed: () => {} });
    expect(none.list()).toEqual([]);
    expect(none.open(1)).toBeNull();
    expect(none.delete(1)).toMatchObject({ ok: false });
    expect(none.clear()).toMatchObject({ ok: false });
  });
});

describe('a job that made nothing, in words (3.9)', () => {
  it.each<[string, string, string]>([
    ['debrief', ErrorCodes.Licensing.QuotaExceeded, "You've had all the debriefs your plan gives this month."],
    ['drafts', ErrorCodes.Licensing.QuotaExceeded, "You've had all the drafts your plan gives this month."],
    ['debrief', ErrorCodes.Licensing.NoEntitlement, "Your plan doesn't include debriefs."],
    ['debrief', ErrorCodes.Request.RateLimited, 'Too many at once. Try again in a minute.'],
    ['debrief', ErrorCodes.Request.Unavailable, "Sotto can't write a debrief right now. Try again in a few minutes."],
    ['drafts', ErrorCodes.Ai.ProviderUnavailable, "Sotto can't write drafts right now. Try again in a few minutes."],
    ['debrief', ErrorCodes.Request.NotFound, 'Writing a debrief took too long and it was lost. Ask again.'],
    ['debrief', 'job_timeout', 'Writing a debrief is taking longer than it should. Try again later.'],
    ['debrief', ErrorCodes.Identity.Unauthenticated, 'Sign in to ask for a debrief.'],
    ['debrief', 'something_new', "Couldn't ask for a debrief. Try again."],
  ])('words a %s that failed with %s', (kind, code, text) => {
    expect(jobFailureText(kind as 'debrief' | 'drafts', code)).toBe(text);
  });
});

afterEach(() => vi.useRealTimers());
